import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyReceipt,verifyDirector,Pending} from '../extension/core/audit.mjs';
import {sha256,encode,resultPath,receiptPath} from '../extension/core/protocol.mjs';
const ref='a'.repeat(40),pub='b'.repeat(40),head='c'.repeat(40);
async function fixture(role='writer_a'){
  const j={id:'job',book_id:'book',repo:'x/y',role,nonce:'123',phase:role==='writer_a'?'WRITERS':'REVIEWS',chapter:1,input_commit:'d'.repeat(40),published_commit:pub,task_sha256:'e'.repeat(64),input:{route:{task_id:'T1',body_sha256:await sha256('天地玄黄')}}};
  const b={config:{min:3,max:6}},files={};let result;
  if(role==='writer_a'){
    files['稿件/第001章/写手A/V1/正文.txt']='天地玄黄';
    files['稿件/第001章/写手A/V1/交付.json']=encode({status:'DELIVERED',chapter:1,writer:'A',task_id:'T1',body_path:'稿件/第001章/写手A/V1/正文.txt',body_sha256:await sha256('天地玄黄'),word_count:4});
    result={kind:'WRITER',delivery_path:'稿件/第001章/写手A/V1/交付.json'};
  }else{
    files['工作区/审核.json']=encode({status:'REVIEWED',chapter:1,review_type:role==='logic'?'LOGIC':'STYLE',task_id:'T1',body_sha256:j.input.route.body_sha256,pass:false,fatal:[],major:['需改'],minor:[],score:87});result={kind:'REVIEW',review_path:'工作区/审核.json'};
  }
  files[resultPath(j.id)]=encode(result);
  const receipt={schema:'novel-completion/1',status:'COMPLETE',job_id:j.id,book_id:j.book_id,role:j.role,nonce:j.nonce,input_commit:j.input_commit,task_sha256:j.task_sha256,artifact_commit:ref,result_path:resultPath(j.id),artifacts:[]};
  for(const [path,text] of Object.entries(files))receipt.artifacts.push({path,sha256:await sha256(text)});
  const api={ancestor:async()=>true,json:async(repo,path)=>path===receiptPath(j.id)?{value:receipt}:({value:JSON.parse(files[path])}),read:async(repo,path)=>({text:files[path],sha:await sha256(files[path])})};
  return {api,b,j,files,receipt,rehash:async()=>{for(const a of receipt.artifacts)a.sha256=await sha256(files[a.path]);}};
}
test('只有正文和交付文件，没有完成凭证不推进',async()=>{const f=await fixture();f.api.json=async()=>null;assert.equal(await verifyReceipt(f.api,f.b,f.j,head),null);});
test('正确绑定任务、章节、hash和字数的凭证才接受',async()=>{const f=await fixture();assert.equal((await verifyReceipt(f.api,f.b,f.j,head)).result.delivery.word_count,4);});
for(const key of ['job_id','book_id','role','nonce','input_commit','task_sha256'])test(`拒绝过期或错配凭证 ${key}`,async()=>{const f=await fixture();f.receipt[key]='wrong';await assert.rejects(verifyReceipt(f.api,f.b,f.j,head),/不符/);});
test('拒绝产物不在当前分支历史',async()=>{const f=await fixture();f.api.ancestor=async()=>false;await assert.rejects(verifyReceipt(f.api,f.b,f.j,head),/后代/);});
test('正文被改、清单hash未改时停止',async()=>{const f=await fixture();f.files['稿件/第001章/写手A/V1/正文.txt']='改';await assert.rejects(verifyReceipt(f.api,f.b,f.j,head),/哈希/);});
test('固定提交正确但最新分支正文已改变时停止',async()=>{const f=await fixture(),old=f.api.read;f.api.read=async(r,p,c)=>{const v=await old(r,p,c);return {...v,sha:c===head?'wrong':v.sha};};await assert.rejects(verifyReceipt(f.api,f.b,f.j,head),/改写/);});
test('字数伪报，即使重新计算交付hash仍不能通过',async()=>{const f=await fixture(),p='稿件/第001章/写手A/V1/交付.json';const d=JSON.parse(f.files[p]);d.word_count=999;f.files[p]=encode(d);await f.rehash();await assert.rejects(verifyReceipt(f.api,f.b,f.j,head),/字数/);});
test('缺正文的产物清单不通过',async()=>{const f=await fixture();f.receipt.artifacts=f.receipt.artifacts.filter(x=>!x.path.endsWith('正文.txt'));await assert.rejects(verifyReceipt(f.api,f.b,f.j,head),/未绑定/);});
test('审核不通过也是完成交付，交总监返修',async()=>{const f=await fixture('logic');const r=await verifyReceipt(f.api,f.b,f.j,head);assert.equal(r.result.review.pass,false);});
test('同章旧正文审核不能复用',async()=>{const f=await fixture('logic');f.j.input.route.body_sha256='f'.repeat(64);await assert.rejects(verifyReceipt(f.api,f.b,f.j,head),/当前TASK正文/);});
test('有重要问题仍pass不能接受',async()=>{const f=await fixture('logic'),p='工作区/审核.json';const v=JSON.parse(f.files[p]);v.pass=true;f.files[p]=encode(v);await f.rehash();await assert.rejects(verifyReceipt(f.api,f.b,f.j,head),/重要问题/);});
test('文风低于88不能通过',async()=>{const f=await fixture('style'),p='工作区/审核.json';const v=JSON.parse(f.files[p]);v.pass=true;v.major=[];f.files[p]=encode(v);await f.rehash();await assert.rejects(verifyReceipt(f.api,f.b,f.j,head),/88/);});
test('BLOCKED不能当成COMPLETE',async()=>{const f=await fixture();f.receipt.status='BLOCKED';f.receipt.reason='写入无权限';await assert.rejects(verifyReceipt(f.api,f.b,f.j,head),/角色阻断/);});
test('总监CI未完成则等待，不信任模型自称通过',async()=>{
  const api={read:async()=>({text:encode({chapter:1})}),ci:async()=>({ok:false,pending:true})};
  await assert.rejects(verifyDirector(api,{config:{repo:'x/y'}},{},{route:{action:'WRITE',chapter:1}},ref),Pending);
  api.ci=async()=>({ok:false,pending:false});await assert.rejects(verifyDirector(api,{config:{repo:'x/y'}},{},{route:{action:'WRITE',chapter:1}},ref),/CI失败/);
});
