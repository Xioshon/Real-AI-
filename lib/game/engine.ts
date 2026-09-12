export type Phase = 'lobby'|'writing'|'voting'|'reveal'|'finished';
export type Player = {id:string; tokenHash:string; name:string; score:number; fooled:number; correct:number};
export type Option = {id:string; author:string; text:string};
export type Room = {code:string; host:string; players:Player[]; phase:Phase; round:number; total:number; deadline:number; generation:string; ai:string; aiError:string; question:string; answers:Record<string,string>; votes:Record<string,string>; options:Option[]; history:string[]; used:number[]; deltas:Record<string,number>; created:number; mode:'cantonese'|'chinese'};
export const QUESTIONS = [
'你遲到兩小時，卻帶着一隻企鵝出現。你第一句講甚麼？',
'如果雪櫃會在半夜發訊息給你，它會說甚麼？',
'替一間只在下雨天開門的雨傘店寫一句廣告。',
'你的貓突然成為你的上司，第一條新規定是甚麼？',
'用一句話解釋，為甚麼你的功課會出現在月球。',
'電梯停在不存在的第十三樓，廣播說了甚麼？',
'一個外星人第一次食菠蘿包，會留下甚麼評論？',
'幫一部永遠只剩 1% 電量的手機寫一句自我介紹。',
'你花一百元買到一個隱形背囊，怎樣證明它存在？',
'替一個「幫人排隊但會迷路」的服務起一句宣傳語。',
'如果星期一要為自己辯護，它會說甚麼？',
'機械人第一次扮人類參加聚會，說甚麼就露餡？',
'朋友問你為甚麼隨身帶着電飯煲，你怎樣回答？',
'你發現學校的鐘慢了三年，第一個反應是甚麼？',
'替一間沒有椅子的餐廳寫一則五星評論。',
'如果拖鞋可以請假，它會用甚麼理由？',
'你在巴士上見到另一個自己，你會先問甚麼？',
'幫一隻完全不識游水的橡皮鴨寫求職介紹。',
'所有人突然只能唱歌溝通，你如何點一杯凍檸茶？',
'你買的鬧鐘每天讚你一句，但從來不響。你會投訴甚麼？',
'為甚麼圖書館會禁止帶薯仔入內？作一個解釋。',
'你是一張被人忘記的優惠券，最後想說甚麼？',
'幫一部只拍到昨天的相機寫一句產品介紹。',
'如果 Wi-Fi 有情緒，它今天為甚麼不開心？',
'你打開快遞，裏面只有一句道歉。上面寫甚麼？',
'你要說服朋友，站着睡覺是你剛開發的新功能。',
'一隻鴿子向你收停車費，你怎樣回應？',
'你開了一間專門賣空氣的店，招牌寫甚麼？',
'幫一個「按了就會忘記想按甚麼」的按鈕寫說明。',
'你發現自己的影子在偷偷放假，它怎樣解釋？'
];
export function shuffled<T>(items:T[]):T[]{const a=[...items];for(let i=a.length-1;i>0;i--){const j=crypto.getRandomValues(new Uint32Array(1))[0]%(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
export function beginRound(r:Room,now:number){
 r.round++; r.phase='writing';r.deadline=now+30000;r.generation=crypto.randomUUID();r.ai='';r.aiError='';r.answers={};r.votes={};r.options=[];r.deltas={};
 const candidates=QUESTIONS.map((_,i)=>i).filter(i=>!r.used.includes(i));const q=shuffled(candidates)[0];r.used.push(q);r.question=QUESTIONS[q];
}
export function finishRound(r:Room,now:number){
 r.deltas=Object.fromEntries(r.players.map(p=>[p.id,0]));
 if(!r.aiError){for(const [pid,choice] of Object.entries(r.votes)){const o=r.options.find(o=>o.id===choice);if(!o)continue;
 if(o.author==='AI'){r.deltas[pid]+=2;const p=r.players.find(p=>p.id===pid);if(p)p.correct++;}
 else if(o.author!==pid){r.deltas[o.author]+=1;const p=r.players.find(p=>p.id===o.author);if(p)p.fooled++;}}
 for(const p of r.players)p.score+=r.deltas[p.id]||0;}
 r.history=[...r.history,...Object.values(r.answers)].slice(-16);r.phase='reveal';r.deadline=now+12000;
}
export function advance(r:Room,now:number):boolean{
 if(r.phase==='writing'&&(now>=r.deadline||(Object.keys(r.answers).length===r.players.length&&!!r.ai))){
 if(!r.ai){r.aiError ||= 'AI 未能及時加入，這輪不計分。';finishRound(r,now);return true;}
 if(Object.keys(r.answers).length<2){r.aiError='少於兩人交答案，這輪不計分。';finishRound(r,now);return true;}
 r.options=shuffled([...Object.entries(r.answers).map(([author,text])=>({id:crypto.randomUUID(),author,text})),{id:crypto.randomUUID(),author:'AI',text:r.ai}]);r.phase='voting';r.deadline=now+Math.max(22000,r.options.length*3000);return true;
 }
 if(r.phase==='voting'&&(now>=r.deadline||Object.keys(r.votes).length===r.players.length)){finishRound(r,now);return true;}
 if(r.phase==='reveal'&&now>=r.deadline){if(r.round>=r.total){r.phase='finished';r.deadline=0;}else beginRound(r,now);return true;}
 return false;
}
export function publicRoom(r:Room,me:string,version:number){const reveal=r.phase==='reveal'||r.phase==='finished';return {
 code:r.code,host:r.host,players:r.players.map(({tokenHash,...p})=>({...p,answered:!!r.answers[p.id],voted:!!r.votes[p.id]})),phase:r.phase,round:r.round,total:r.total,deadline:r.deadline,question:r.question,mode:r.mode,
 options:(r.phase==='voting'||reveal)?r.options.map(o=>({id:o.id,text:o.text,mine:o.author===me,...(reveal?{author:o.author,voters:Object.entries(r.votes).filter(([,id])=>id===o.id).map(([pid])=>pid)}:{})})):[],
 myAnswer:r.answers[me]||'',myVote:r.votes[me]||'',deltas:reveal?r.deltas:{},notice:reveal?r.aiError:'',serverTime:Date.now(),version
};}
