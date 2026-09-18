import test from 'node:test';
import assert from 'node:assert/strict';
import {Runner} from '../extension/core/runner.mjs';
import {newControl,addBook,group,activeCount} from '../extension/core/engine.mjs';
import {ROLES,CONTROL_PATH,encode,sha256,taskPath,receiptPath,resultPath,VERSION} from '../extension/core/protocol.mjs';
const cfg=id=>({id,title:id,repo:`owner/${id}`,branch:'main',platform:'番茄小说',start:1,end:100,min:3,max:8,keywords:'悬疑',chats:Object.fromEntries(Object.keys(ROLES).map(r=>[r,`https://chatgpt.com/c/${id}-${r.replaceAll('_','-')}`]))});
class MemoryGitHub {
  constructor(){this.files={};this.heads={};this.commits={};this.n=0;this.failWrite=false;this.failAfterAtomic=false;}
  commit(repo,files){const ref=(++this.n).toString(16).padStart(40,'0');this.files[repo]={...files};this.heads[repo]=ref;this.commits[ref]=structuredClone(files);return ref;}
  async head(repo){return this.heads[repo];}
  async read(repo,path,ref,optional=false){const files=/^[0-9a-f]{40}$/.test(ref)?this.commits[ref]:this.files[repo];const text=files?.[path];if(text===undefined){if(optional)return null;throw Object.assign(new Error('404'),{status:404});}return {text,sha:await sha256(text)};}
  async json(repo,path,ref,optional=false){const a=await this.read(repo,path,ref,optional);return a?{...a,value:JSON.parse(a.text)}:null;}
  async write(repo,branch,path,text,sha){if(this.failWrite){this.failWrite=false;throw new Error('injected crash');}const old=await this.read(repo,path,branch,true);if((old?.sha||null)!==sha)throw Object.assign(new Error('CAS conflict'),{status:409});this.commit(repo,{...this.files[repo],[path]:text});return {content:{sha:await sha256(text)}};}
  async atomic(repo,branch,files,head){assert.equal(this.heads[repo],head);for(const p of Object.keys(files))assert(!this.files[repo][p]);const ref=this.commit(repo,{...this.files[repo],...files});if(this.failAfterAtomic){this.failAfterAtomic=false;throw new Error('after atomic crash');}return ref;}
  async ancestor(){return true;}
}
async function setup(phase='WRITERS',count=3){
  const api=new MemoryGitHub(),s=newControl(),bindings={};s.paused=false;
  for(let i=1;i<=count;i++){
    const c=cfg('book'+i),b=addBook(s,c);bindings[c.id]=c.chats;
    group(s,b,phase,phase==='WRITERS'?['writer_a','writer_b','writer_c']:['idea'],{route:{task_id:'TASK1'}});
    api.commit(c.repo,{'数据库入口.json':encode({repo_url:`https://github.com/${c.repo}`,branch:'main',platform:c.platform,academy_repo:'https://github.com/1464356758/xueyuan',chapter_range:{start:1,end:100},chapter_words:{min:3,max:8}}),'运行状态.json':encode({chapter:1,task_id:'TASK1'}),'自动化/角色执行协议.md':VERSION});
  }
  const remote=structuredClone(s);for(const b of remote.books)delete b.config.chats;
  api.commit('owner/control',{[CONTROL_PATH]:encode(remote)});
  const sent=[],views={},transport={cache:async()=>{},bindings:async()=>bindings,probe:async(url,id)=>views[id]||{status:'IDLE',hasJob:sent.includes(id)},send:async(url,id)=>{sent.push(id);views[id]={status:'BUSY',hasJob:true};return {status:'SENT'};},refresh:async()=>{}};
  const make=()=>new Runner(api,transport,{repo:'owner/control',branch:'main'},'runner');return {api,s,transport,sent,views,make};
}
test('真实Runner模拟：三书只发两组三稿，重启不重复发',async()=>{
  const f=await setup();await f.make().tick();assert.equal(f.sent.length,6);const after=JSON.parse(f.api.files['owner/control'][CONTROL_PATH]);assert.equal(activeCount(after),6);assert(after.books.every(b=>!b.config.chats));
  await f.make().tick();assert.equal(f.sent.length,6);assert.equal(Object.values(after.jobs).filter(j=>j.status==='QUEUED').length,3);
});
test('SENDING写入日志后模拟浏览器调用中断，重启保留不确定席位而不重发',async()=>{
  const f=await setup('IDEA',1);f.transport.send=async(url,id)=>{f.sent.push(id);return {status:'UNCERTAIN'};};
  await f.make().tick();const state=JSON.parse(f.api.files['owner/control'][CONTROL_PATH]);assert.equal(Object.values(state.jobs)[0].status,'UNCERTAIN');
  f.transport.probe=async()=>({status:'IDLE',hasJob:false});await f.make().tick();assert.equal(f.sent.length,1);assert.equal(activeCount(JSON.parse(f.api.files['owner/control'][CONTROL_PATH])),1);
});
test('任务文件原子提交后崩溃，下轮恢复相同任务和nonce，不再创建新任务',async()=>{
  const f=await setup('IDEA',1);f.api.failAfterAtomic=true;const interrupted=f.make();await interrupted.load();await interrupted.claim();await assert.rejects(interrupted.publishGroup(interrupted.s.books[0]),/atomic crash/);
  const before=Object.keys(f.api.files['owner/book1']).filter(p=>p.startsWith('自动化/任务/'));assert.equal(before.length,1);
  await f.make().tick();assert.equal(f.sent.length,1);assert.deepEqual(Object.keys(f.api.files['owner/book1']).filter(p=>p.startsWith('自动化/任务/')),before);
});
test('一名角色不空闲，整组三写手不发送也不占位',async()=>{
  const f=await setup('WRITERS',1);f.transport.probe=async(url)=>({status:url.endsWith('writer-b')?'BUSY':'IDLE'});await f.make().tick();assert.equal(f.sent.length,0);assert.equal(activeCount(JSON.parse(f.api.files['owner/control'][CONTROL_PATH])),0);
});
test('第一本书网络写入失败不重复发送未获远端确认的任务',async()=>{
  const f=await setup('IDEA',1);f.api.failWrite=true;await assert.rejects(f.make().tick(),/injected crash/);assert.equal(f.sent.length,0);
});
test('全部凭证已验、网页仍忙时可排下步，但占位仍计入六席',async()=>{
  const f=await setup('WRITERS',1);await f.make().tick();const control=JSON.parse(f.api.files['owner/control'][CONTROL_PATH]);
  for(const j of Object.values(control.jobs)){
    const writer=j.role.slice(-1).toUpperCase(),bp=`稿件/第001章/写手${writer}/V1/正文.txt`,dp=`稿件/第001章/写手${writer}/V1/交付.json`;
    const files={[bp]:'天地玄黄',[dp]:encode({status:'DELIVERED',writer,chapter:1,task_id:'TASK1',body_path:bp,body_sha256:await sha256('天地玄黄'),word_count:4}),[resultPath(j.id)]:encode({kind:'WRITER',delivery_path:dp})};
    const ref=f.api.commit(j.repo,{...f.api.files[j.repo],...files});
    const receipt={schema:'novel-completion/1',status:'COMPLETE',job_id:j.id,book_id:j.book_id,role:j.role,nonce:j.nonce,input_commit:j.input_commit,task_sha256:j.task_sha256,artifact_commit:ref,result_path:resultPath(j.id),artifacts:await Promise.all(Object.entries(files).map(async([path,text])=>({path,sha256:await sha256(text)})))};
    f.api.commit(j.repo,{...f.api.files[j.repo],[receiptPath(j.id)]:encode(receipt)});
  }
  await f.make().tick();const after=JSON.parse(f.api.files['owner/control'][CONTROL_PATH]);assert.equal(after.books[0].phase,'DIRECTOR_AFTER_WRITERS');assert.equal(f.sent.length,4);assert.equal(activeCount(after),4);
});
test('限额提示使全局暂停，不释放占位不换模型',async()=>{
  const f=await setup('IDEA',1);await f.make().tick();f.transport.probe=async()=>({status:'LIMIT',hasJob:true});await f.make().tick();const s=JSON.parse(f.api.files['owner/control'][CONTROL_PATH]);assert.equal(s.paused,true);assert.equal(activeCount(s),1);assert.equal(f.sent.length,1);
});
test('一本书配置错误只阻断本书，另外两本仍能执行',async()=>{
  const f=await setup('IDEA',3),db=JSON.parse(f.api.files['owner/book1']['数据库入口.json']);db.branch='wrong';f.api.commit('owner/book1',{...f.api.files['owner/book1'],'数据库入口.json':encode(db)});
  await f.make().tick();assert.equal(f.sent.length,2);const s=JSON.parse(f.api.files['owner/control'][CONTROL_PATH]);assert(s.books[0].held);assert.equal(s.books[1].held,null);
});
test('检查过程中收到暂停，在下一次浏览器点击前停止发送',async()=>{
  const f=await setup('WRITERS',1);let stop=false;const send=f.transport.send;
  f.transport.pauseRequested=async()=>stop;
  f.transport.send=async(...args)=>{const r=await send(...args);stop=true;return r;};
  await f.make().tick();const s=JSON.parse(f.api.files['owner/control'][CONTROL_PATH]);assert.equal(f.sent.length,1);assert.equal(s.paused,true);assert.equal(activeCount(s),3);
});
test('暂停期间未发送的预留任务，过夜不会被当成执行超时锁死',async()=>{
  const f=await setup('WRITERS',1);let stop=false;f.transport.pauseRequested=async()=>stop;const old=f.transport.send;
  f.transport.send=async(...args)=>{const out=await old(...args);stop=true;return out;};await f.make().tick();
  const s=JSON.parse(f.api.files['owner/control'][CONTROL_PATH]);for(const j of Object.values(s.jobs))j.reserved_at=Date.now()-86400000;
  f.api.commit('owner/control',{[CONTROL_PATH]:encode(s)});await f.make().tick();const after=JSON.parse(f.api.files['owner/control'][CONTROL_PATH]);assert.equal(after.books[0].held,null);assert.equal(activeCount(after),3);
});
