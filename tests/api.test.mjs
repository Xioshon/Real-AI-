import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
const sql=new DatabaseSync(':memory:');sql.exec(readFileSync('drizzle/0000_bored_zodiak.sql','utf8'));
function prepare(query){let args=[];return{bind(...a){args=a;return this},async first(){return sql.prepare(query).get(...args)||null},async run(){const r=sql.prepare(query).run(...args);return{meta:{changes:Number(r.changes)}}}};}
const jobs=[];globalThis.__gameTestEnv={DB:{prepare,async batch(stmts){sql.exec('BEGIN');try{const results=[];for(const s of stmts)results.push(await s.run());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}},DEEPSEEK_API_KEY:'test-only',AI_DAILY_LIMIT:'300'};globalThis.__gameTestAfter=fn=>jobs.push(fn);
const uri=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const engine=uri(readFileSync('lib/game/engine.ts','utf8'));
const server=uri(readFileSync('lib/game/server.ts','utf8').replace("import {env} from 'cloudflare:workers';","const env=globalThis.__gameTestEnv;").replace("import {after} from 'next/server';","const after=globalThis.__gameTestAfter;").replace("'./engine'",JSON.stringify(engine)));
const route=uri(readFileSync('app/api/game/route.ts','utf8').replace("'@/lib/game/server'",JSON.stringify(server)).replace("import {after} from 'next/server';","const after=globalThis.__gameTestAfter;"));
const {POST}=await import(route);const tokens=Array.from({length:11},()=>crypto.randomUUID());
async function call(i,action,data={}){const res=await POST(new Request('https://game.test/api/game',{method:'POST',headers:{Authorization:'Bearer '+tokens[i],Origin:'https://game.test'},body:JSON.stringify({action,...data})}));return{status:res.status,body:await res.json()};}
async function flush(){const original=globalThis.fetch;globalThis.fetch=async()=>Response.json({choices:[{message:{content:'我個雪櫃話佢想放暑假'}}]});try{while(jobs.length)await jobs.shift()();}finally{globalThis.fetch=original;}}
test('actual API: concurrent 10-player room, authorization, hidden answers, race-safe votes and rejoin',async()=>{
 let r=await call(0,'create',{name:'Host'});assert.equal(r.status,200);const code=r.body.code;
 const joins=await Promise.all(tokens.slice(1,10).map((_,i)=>call(i+1,'join',{code,name:'Player'+i})));assert(joins.every(r=>r.status===200));
 r=await call(10,'join',{code,name:'Overflow'});assert.equal(r.status,400);
 r=await call(1,'start',{code});assert.equal(r.status,403);
 r=await call(0,'start',{code});assert.equal(r.status,200);assert.equal(r.body.phase,'writing');assert.equal(jobs.length,1);await flush();
 const answers=await Promise.all(tokens.slice(0,10).map((_,i)=>call(i,'answer',{code,round:1,answer:'unique answer '+i})));assert(answers.every(r=>r.status===200));
 r=await call(0,'sync',{code});assert.equal(r.body.phase,'voting');assert.equal(r.body.options.length,11);assert(r.body.options.every(o=>!('author'in o)));assert(!JSON.stringify(r.body).includes('tokenHash'));
 const own=r.body.options.find(o=>o.mine);assert.equal((await call(0,'vote',{code,round:1,option:own.id})).status,400);
 assert.equal((await call(0,'vote',{code,round:0,option:r.body.options.find(o=>!o.mine).id})).status,409);
 const ai=r.body.options.find(o=>o.text==='我個雪櫃話佢想放暑假');const votes=await Promise.all(tokens.slice(0,10).map((_,i)=>call(i,'vote',{code,round:1,option:ai.id})));assert(votes.every(r=>r.status===200));
 r=await call(0,'sync',{code});assert.equal(r.body.phase,'reveal');assert(r.body.players.every(p=>p.score===2));
 await Promise.all(tokens.slice(0,10).map((_,i)=>call(i,'sync',{code})));r=await call(0,'sync',{code});assert(r.body.players.every(p=>p.score===2));
 r=await call(3,'join',{code,name:'ignored'});assert.equal(r.status,200);assert.equal(r.body.players.length,10);
 r=await call(10,'sync',{code});assert.equal(r.status,401);
 sql.close();
});
