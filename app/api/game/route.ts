import {GameError,authenticate,beginRound,create,generate,hash,limit,mutate,publicRoom,read,runtime,tick} from '@/lib/game/server';
import {after} from 'next/server';
export const dynamic='force-dynamic';
const response=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function text(v:unknown,max:number){if(typeof v!=='string')throw new GameError('請填寫完整資料。');const s=v.trim().replace(/[\u0000-\u001f\u007f]/g,' ');if(!s||Array.from(s).length>max)throw new GameError(`請輸入 1 至 ${max} 個字。`);return s;}
export async function POST(req:Request){try{
 const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)throw new GameError('不允許跨網站操作。',403);
 if(Number(req.headers.get('content-length')||0)>4096)throw new GameError('資料太長。',413);
 const raw=await req.text();if(raw.length>4096)throw new GameError('資料太長。',413);
 let b:Record<string,unknown>;try{b=JSON.parse(raw);}catch{throw new GameError('資料格式不正確。');}if(!b||typeof b!=='object'||Array.isArray(b))throw new GameError('資料格式不正確。');
 const token=req.headers.get('authorization')?.replace(/^Bearer /,'')||'';if(!/^[a-f0-9-]{36,80}$/i.test(token))throw new GameError('請重新開啟遊戲。',401);const tokenHash=await hash(token);
 const action=b.action;if(action==='create'){
 await limit('create:global',100,3600000);await limit('create:'+await hash(req.headers.get('cf-connecting-ip')||tokenHash),8,3600000);
 if(runtime().CREATE_ROOM_PIN&&b.pin!==runtime().CREATE_ROOM_PIN)throw new GameError('開房密碼不正確。',403);
 const result=await create(text(b.name,12),tokenHash,b.mode==='chinese'?'chinese':'cantonese');
 return response({...publicRoom(result.room,result.me,result.version),me:result.me});
 }
 const code=text(b.code,6).toUpperCase();if(!/^[A-Z2-9]{6}$/.test(code))throw new GameError('請輸入 6 位房間碼。');
 if(action==='join'){
 await limit('join:'+tokenHash,20,60000);let me='';
 const result=await mutate(code,r=>{const existing=r.players.find(p=>p.tokenHash===tokenHash);if(existing){me=existing.id;return;}if(r.phase!=='lobby')throw new GameError('遊戲已開始，請等朋友下一局。');if(r.players.length>=10)throw new GameError('房間已滿（最多 10 人）。');const name=text(b.name,12);if(r.players.some(p=>p.name===name))throw new GameError('這個暱稱已有人用，換一個吧。');me=crypto.randomUUID();r.players.push({id:me,tokenHash,name,score:0,fooled:0,correct:0});});return response({...publicRoom(result.room,me,result.version),me});
 }
 if(action==='sync'){const result=await tick(code,tokenHash);return response({...publicRoom(result.room,result.me,result.version),me:result.me});}
 await limit('action:'+tokenHash,90,60000);
 let me='',generation='';const result=await mutate(code,r=>{const p=authenticate(r,tokenHash);me=p.id;
 if(action==='start'){
 if(r.host!==p.id)throw new GameError('只有房主可以開始。',403);if(r.phase!=='lobby')throw new GameError('遊戲已開始。',409);if(r.players.length<3)throw new GameError('至少 3 位玩家才可以開始。');if(!runtime().DEEPSEEK_API_KEY)throw new GameError('AI 尚未設定，請聯絡房主。',503);beginRound(r,Date.now());generation=r.generation;
 }else if(action==='answer'){
 if(r.phase!=='writing'||b.round!==r.round||Date.now()>=r.deadline)throw new GameError('作答時間已結束。',409);if(r.answers[p.id])throw new GameError('你已經交了答案。',409);r.answers[p.id]=text(b.answer,60);
 }else if(action==='vote'){
 if(r.phase!=='voting'||b.round!==r.round||Date.now()>=r.deadline)throw new GameError('投票時間已結束。',409);if(r.votes[p.id])throw new GameError('你已投票。',409);const option=r.options.find(o=>o.id===b.option);if(!option||option.author===p.id)throw new GameError('請選另一個答案。');r.votes[p.id]=option.id;
 }else if(action==='reset'){
 if(r.host!==p.id)throw new GameError('只有房主可以再開一局。',403);if(r.phase!=='finished')throw new GameError('請先完成這局。');r.phase='lobby';r.round=0;r.deadline=0;r.history=[];r.used=[];r.answers={};r.votes={};r.options=[];r.deltas={};r.aiError='';for(const x of r.players){x.score=0;x.correct=0;x.fooled=0;}
 }else if(action==='leave'){
 if(r.phase!=='lobby'&&r.phase!=='finished')throw new GameError('遊戲中可暫時離開畫面，座位會保留至完局。');r.players=r.players.filter(x=>x.id!==p.id);if(r.host===p.id)r.host=r.players[0]?.id||'';
 }else if(action==='kick'){
 if(r.host!==p.id||r.phase!=='lobby')throw new GameError('只有房主可在等候室移除玩家。',403);if(b.player===p.id)throw new GameError('不能移除自己。');r.players=r.players.filter(x=>x.id!==b.player);
 }else throw new GameError('不支援的操作。');
 });
 if(generation)after(()=>generate(code,generation));
 return response({...publicRoom(result.room,me,result.version),me});
 }catch(e){if(e instanceof GameError)return response({error:e.message},e.status);console.error('game_request_failed',e instanceof Error?e.name:'unknown');return response({error:'連線暫時不穩，請重試；已輸入的答案仍會保留。'},503);}}
