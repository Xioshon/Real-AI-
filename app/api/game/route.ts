import {GameError,authenticate,beginRound,create,destroy,ensureSchema,generateAnswer,hash,limit,mutate,prepareRound,publicRoom,read,runtime,tick} from '@/lib/game/server';
import {after} from 'next/server';

export const dynamic='force-dynamic';
const response=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});

function text(v:unknown,max:number){
  if(typeof v!=='string')throw new GameError('請填寫完整資料。');
  const s=v.trim().replace(/[\u0000-\u001f\u007f]/g,' ');
  if(!s||Array.from(s).length>max)throw new GameError(`請輸入 1 至 ${max} 個字。`);
  return s;
}
function number(v:unknown,min:number,max:number,fallback:number){const n=Number(v);return Number.isFinite(n)?Math.max(min,Math.min(max,Math.round(n))):fallback;}
function assertOrigin(req:Request){
  const origin=req.headers.get('origin');
  if(!origin)return;
  let host='';
  try{host=new URL(origin).host;}catch{throw new GameError('不允許跨網站操作。',403);}
  const candidates=[new URL(req.url).host,req.headers.get('x-forwarded-host')?.split(',')[0].trim(),req.headers.get('host')].filter(Boolean);
  if(!candidates.includes(host))throw new GameError('不允許跨網站操作。',403);
}

export async function POST(req:Request){
  try{
    await ensureSchema();
    assertOrigin(req);
    if(Number(req.headers.get('content-length')||0)>4096)throw new GameError('資料太長。',413);
    const raw=await req.text();
    if(raw.length>4096)throw new GameError('資料太長。',413);
    let b:Record<string,unknown>;
    try{b=JSON.parse(raw);}catch{throw new GameError('資料格式不正確。');}
    if(!b||typeof b!=='object'||Array.isArray(b))throw new GameError('資料格式不正確。');

    const legacy=req.headers.get('authorization')?.replace(/^Bearer /,'')||'';
    const token=req.headers.get('x-game-token')||legacy;
    if(!/^[a-f0-9-]{36,80}$/i.test(token))throw new GameError('請重新開啟遊戲。',401);
    const tokenHash=await hash(token);
    const action=b.action;

    if(action==='create'){
      await limit('create:global',100,3600000);
      await limit('create:'+await hash(req.headers.get('cf-connecting-ip')||tokenHash),8,3600000);
      if(runtime().CREATE_ROOM_PIN&&b.pin!==runtime().CREATE_ROOM_PIN)throw new GameError('開房密碼不正確。',403);
      const result=await create(text(b.name,12),tokenHash,{
        mode:b.mode==='chinese'?'chinese':'cantonese',
        total:number(b.total,3,12,6),
        writingSeconds:number(b.writingSeconds,15,120,30),
        votingSeconds:number(b.votingSeconds,10,90,25),
        topic:typeof b.topic==='string'&&b.topic.trim()?text(b.topic,40):'隨機混合',
        webSearch:b.webSearch!==false
      });
      return response({...publicRoom(result.room,result.me,result.version),me:result.me});
    }

    const code=text(b.code,6).toUpperCase();
    if(!/^[A-Z2-9]{6}$/.test(code))throw new GameError('請輸入 6 位房間碼。');

    if(action==='join'){
      await limit('join:'+tokenHash,20,60000);
      let me='';
      const result=await mutate(code,r=>{
        const existing=r.players.find(p=>p.tokenHash===tokenHash);
        if(existing){me=existing.id;return;}
        if(r.phase!=='lobby')throw new GameError('遊戲已開始，請等朋友下一局。');
        if(r.players.length>=10)throw new GameError('房間已滿（最多 10 人）。');
        const name=text(b.name,12);
        if(r.players.some(p=>p.name===name))throw new GameError('這個暱稱已有人用，換一個吧。');
        me=crypto.randomUUID();
        r.players.push({id:me,tokenHash,name,score:0,fooled:0,correct:0});
      });
      return response({...publicRoom(result.room,me,result.version),me});
    }

    if(action==='sync'){
      const result=await tick(code,tokenHash);
      return response({...publicRoom(result.room,result.me,result.version),me:result.me});
    }

    await limit('action:'+tokenHash,90,60000);

    if(action==='disband'){
      const snapshot=await read(code);
      const p=authenticate(snapshot.room,tokenHash);
      if(snapshot.room.host!==p.id)throw new GameError('只有房主可以解散房間。',403);
      await destroy(code);
      return response({...publicRoom(snapshot.room,p.id,snapshot.version),me:p.id,closed:true});
    }

    let me='',prepareGeneration='',answerGeneration='';
    const result=await mutate(code,r=>{
      const p=authenticate(r,tokenHash);
      me=p.id;

      if(action==='settings'){
        if(r.host!==p.id||r.phase!=='lobby')throw new GameError('只有房主可在等候室修改設定。',403);
        if(b.total!==undefined)r.total=number(b.total,3,12,r.total);
        if(b.writingSeconds!==undefined)r.writingSeconds=number(b.writingSeconds,15,120,r.writingSeconds);
        if(b.votingSeconds!==undefined)r.votingSeconds=number(b.votingSeconds,10,90,r.votingSeconds);
        if(b.topic!==undefined)r.topic=text(b.topic,40);
        if(b.webSearch!==undefined)r.webSearch=b.webSearch!==false;
      }else if(action==='start'){
        if(r.host!==p.id)throw new GameError('只有房主可以開始。',403);
        if(r.phase!=='lobby')throw new GameError('遊戲已開始。',409);
        if(r.players.length<3)throw new GameError('至少 3 位玩家才可以開始。');
        if(!runtime().DEEPSEEK_API_KEY)throw new GameError('AI 尚未設定，請聯絡房主。',503);
        beginRound(r,Date.now());
        prepareGeneration=r.generation;
      }else if(action==='answer'){
        if(r.phase!=='writing'||b.round!==r.round||Date.now()>=r.deadline)throw new GameError('作答時間已結束。',409);
        if(r.answers[p.id])throw new GameError('你已經交了答案。',409);
        r.answers[p.id]=text(b.answer,60);
        const threshold=r.writingSeconds<=20?1:Math.min(2,r.players.length);
        if(!r.aiStarted&&!r.ai&&Object.keys(r.answers).length>=threshold){r.aiStarted=true;answerGeneration=r.generation;}
      }else if(action==='vote'){
        if(r.phase!=='voting'||b.round!==r.round||Date.now()>=r.deadline)throw new GameError('投票時間已結束。',409);
        if(r.votes[p.id])throw new GameError('你已投票。',409);
        const option=r.options.find(o=>o.id===b.option);
        if(!option||option.author===p.id)throw new GameError('請選另一個答案。');
        r.votes[p.id]=option.id;
      }else if(action==='reset'){
        if(r.host!==p.id)throw new GameError('只有房主可以再開一局。',403);
        if(r.phase!=='finished')throw new GameError('請先完成這局。');
        r.phase='lobby';r.round=0;r.deadline=0;r.generation='';r.history=[];r.used=[];r.answers={};r.votes={};r.options=[];r.deltas={};r.ai='';r.aiError='';r.aiStarted=false;r.question='';r.questionError='';r.context='';
        for(const x of r.players){x.score=0;x.correct=0;x.fooled=0;}
      }else if(action==='leave'){
        if(r.phase!=='lobby'&&r.phase!=='finished')throw new GameError('遊戲中可暫時離開畫面，座位會保留至完局。');
        r.players=r.players.filter(x=>x.id!==p.id);
        if(r.host===p.id)r.host=r.players[0]?.id||'';
      }else if(action==='kick'){
        if(r.host!==p.id||r.phase!=='lobby')throw new GameError('只有房主可在等候室移除玩家。',403);
        if(b.player===p.id)throw new GameError('不能移除自己。');
        r.players=r.players.filter(x=>x.id!==b.player);
      }else throw new GameError('不支援的操作。');
    });

    if(prepareGeneration)after(()=>prepareRound(code,prepareGeneration));
    if(answerGeneration)after(()=>generateAnswer(code,answerGeneration));
    return response({...publicRoom(result.room,me,result.version),me});
  }catch(e){
    if(e instanceof GameError)return response({error:e.message},e.status);
    console.error('game_request_failed',e instanceof Error?e.name:'unknown');
    return response({error:'連線暫時不穩，請重試；已輸入的答案仍會保留。'},503);
  }
}
