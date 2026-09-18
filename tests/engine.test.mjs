import test from 'node:test';
import assert from 'node:assert/strict';
import {newControl,addBook,group,reserve,activeCount,readyGroups,markAccepted,collect,releaseSlot,takeLease,advanceNonDirector,selectIdea,applyDirectorRoute} from '../extension/core/engine.mjs';
import {ROLES,repoName,safePath,chatURL,countWords,validateBook} from '../extension/core/protocol.mjs';
export const config=(id='b1')=>({id,title:id,repo:`owner/${id}`,branch:'main',platform:'番茄小说',start:1,end:100,min:3,max:20,keywords:'悬疑',chats:Object.fromEntries(Object.keys(ROLES).map(r=>[r,`https://chatgpt.com/c/${id}-${r.replaceAll('_','-')}`]))});
const setup=()=>{const s=newControl();s.paused=false;for(let i=1;i<=3;i++)addBook(s,config('b'+i));return s;};
test('三本书写手整组竞争：先三加三，第三组等待；部分席位空闲不拆组',()=>{
  const s=setup();for(const b of s.books)group(s,b,'WRITERS',['writer_a','writer_b','writer_c']);
  reserve(s,s.books[0]);reserve(s,s.books[1]);assert.equal(activeCount(s),6);assert.throws(()=>reserve(s,s.books[2]),/六席/);
  const jobs=s.books[0].group.jobs.map(id=>s.jobs[id]);jobs.forEach(j=>markAccepted(s,j,{kind:'WRITER'},'a'.repeat(40)));
  assert.equal(activeCount(s),6);releaseSlot(jobs[0]);releaseSlot(jobs[1]);assert.throws(()=>reserve(s,s.books[2]),/六席/);
  releaseSlot(jobs[2]);assert.equal(readyGroups(s)[0].config.id,'b3');reserve(s,s.books[2]);assert.equal(activeCount(s),6);
});
test('必须收齐三份真实凭证；业务屏障不要求网页先完成显示',()=>{
  const s=setup(),b=s.books[0];group(s,b,'WRITERS',['writer_a','writer_b','writer_c']);reserve(s,b);
  const js=b.group.jobs.map(id=>s.jobs[id]);markAccepted(s,js[0],{},'a'.repeat(40));markAccepted(s,js[1],{},'a'.repeat(40));assert.equal(collect(s,b),null);
  markAccepted(s,js[2],{},'a'.repeat(40));const prev=collect(s,b);assert.equal(prev.jobs.length,3);assert.equal(activeCount(s),3);advanceNonDirector(s,b,prev);assert.equal(b.phase,'DIRECTOR_AFTER_WRITERS');
});
test('双审核不齐不送总监',()=>{const s=setup(),b=s.books[0];group(s,b,'REVIEWS',['logic','style']);reserve(s,b);markAccepted(s,s.jobs[b.group.jobs[0]],{},'a'.repeat(40));assert.equal(collect(s,b),null);});
test('旧控制台席位尚在，租约过期也不能被第二台接管',()=>{const s=setup();takeLease(s,'a',0);group(s,s.books[0],'IDEA',['idea']);reserve(s,s.books[0]);assert.throws(()=>takeLease(s,'b',200000),/占用席位/);});
test('同控制台可以恢复；没有席位时允许过期租约接管',()=>{const s=setup();takeLease(s,'a',0);takeLease(s,'a',100);assert.equal(s.lease.epoch,1);assert.throws(()=>takeLease(s,'b',200),/另一台/);takeLease(s,'b',200000);assert.equal(s.lease.epoch,2);});
test('用户最后选题；禁止裁判自动选第一名',()=>{
  const s=setup(),b=s.books[0];b.phase='IDEA_JUDGE';const prev={phase:'IDEA_JUDGE',jobs:[{result:{eligible_ids:['02','07'],candidates:[{id:'02',title:'二'},{id:'07',title:'七'}],idea_run_id:'IDEA1',review_path:'灵感/评审.md'}}]};
  advanceNonDirector(s,b,prev);assert.equal(b.phase,'WAIT_SELECTION');assert.equal(b.group,null);assert.throws(()=>selectIdea(s,b,'01'),/可选列表/);selectIdea(s,b,'07');assert.equal(b.selection.candidate_id,'07');assert.equal(b.phase,'DIRECTOR_SETUP');
});
test('全部候选不可用最多重开三批，之后停止',()=>{
  const s=setup(),b=s.books[0],p={phase:'IDEA_JUDGE',jobs:[{result:{eligible_ids:[]}}]};
  for(let i=0;i<3;i++){b.group=null;advanceNonDirector(s,b,p);}b.group=null;assert.throws(()=>advanceNonDirector(s,b,p),/三批/);
});
test('三稿完成后必须先总监匿名，再裁判，再总监解封',()=>{
  const s=setup(),b=s.books[0];b.phase='DIRECTOR_AFTER_WRITERS';assert.throws(()=>applyDirectorRoute(s,b,{action:'REVIEW',chapter:1,winner:'A'},{}),/非法路由/);applyDirectorRoute(s,b,{action:'JUDGE',chapter:1},{});assert.equal(b.phase,'JUDGE');assert.deepEqual(b.group.jobs.map(id=>s.jobs[id].role),['judge']);
});
test('新章禁止跳章，初始化必须使用起始章',()=>{const s=setup(),b=s.books[0];b.phase='DIRECTOR_SETUP';assert.throws(()=>applyDirectorRoute(s,b,{action:'WRITE',chapter:2},{}),/连续/);});
test('返修固定原获选写手，限制三轮，修完并行重跑三门禁',()=>{
  const s=setup(),b=s.books[0];b.phase='DIRECTOR_AFTER_REVIEWS';b.winner='B';assert.throws(()=>applyDirectorRoute(s,b,{action:'REVISE',chapter:1,winner:'A',round:1},{}),/换冠军/);
  applyDirectorRoute(s,b,{action:'REVISE',chapter:1,winner:'B',round:1},{});assert.equal(s.jobs[b.group.jobs[0]].role,'writer_b');b.group=null;b.phase='DIRECTOR_AFTER_REVISION';applyDirectorRoute(s,b,{action:'RECHECK',chapter:1},{});assert.equal(b.group.jobs.length,3);
  b.group=null;b.phase='DIRECTOR_AFTER_RECHECK';b.round=3;b.repair_rounds={1:3};assert.throws(()=>applyDirectorRoute(s,b,{action:'REVISE',chapter:1,winner:'B',round:4},{}),/最多三轮/);
});
test('总监未做终局审核不得完成',()=>{const s=setup(),b=s.books[0];b.phase='DIRECTOR_AFTER_STAGE';assert.throws(()=>applyDirectorRoute(s,b,{action:'COMPLETE',chapter:1},{}),/非法路由/);b.phase='DIRECTOR_AFTER_FINAL';assert.throws(()=>applyDirectorRoute(s,b,{action:'COMPLETE',chapter:1},{}),/终章/);});
test('阶段旧章修复后恢复生产章，再重审',()=>{
  const s=setup(),b=s.books[0];b.phase='DIRECTOR_AFTER_STAGE';b.chapter=10;applyDirectorRoute(s,b,{action:'REVISE',chapter:4,round:1,winner:'C',repair_scope:'STAGE'},{});assert.equal(b.chapter,4);assert.equal(b.resume_chapter,10);
  b.group=null;b.phase='DIRECTOR_AFTER_RECHECK';assert.throws(()=>applyDirectorRoute(s,b,{action:'STAGE',chapter:4},{}),/恢复/);applyDirectorRoute(s,b,{action:'STAGE',chapter:10},{});assert.equal(b.chapter,10);assert.equal(b.phase,'STAGE');
});
test('暂停不释放已发送席位，也不再领取新任务',()=>{const s=setup();group(s,s.books[0],'IDEA',['idea']);reserve(s,s.books[0]);s.paused=true;group(s,s.books[1],'IDEA',['idea']);assert.throws(()=>reserve(s,s.books[1]),/暂停/);assert.equal(activeCount(s),1);});
test('完成凭证不能重复消费或提前释放',()=>{const s=setup(),b=s.books[0];group(s,b,'IDEA',['idea']);const j=s.jobs[b.group.jobs[0]];assert.throws(()=>releaseSlot(j));reserve(s,b);markAccepted(s,j,{},'a'.repeat(40));assert.throws(()=>markAccepted(s,j,{},'a'.repeat(40)));});
test('不允许复用不同书的聊天、仓库或者第四本书',()=>{
  const s=setup();assert.throws(()=>addBook(s,config('b4')),/三本/);const t=newControl();const a=config();addBook(t,a);const b=config('b2');b.chats=a.chats;assert.throws(()=>addBook(t,b),/共用/);
});
test('仓库、分支、路径及对话网址校验',()=>{
  assert.equal(repoName('https://github.com/u/repo.git'),'u/repo');assert.throws(()=>repoName('https://evil.example/u/repo'));
  for(const p of ['../secret','a/../../b','/root/a','a\\b','.git/config','a?b'])assert.throws(()=>safePath(p));
  assert.equal(safePath('稿件/第001章/正文.txt'),'稿件/第001章/正文.txt');assert.throws(()=>chatURL('https://chatgpt.com/'));
  for(const branch of ['a..b','a/.lock','a b','/main','a.lock'])assert.throws(()=>validateBook({...config(),branch}));
});
test('中文统一字数排除标题说明由正文文件规则保障',()=>{assert.equal(countWords('你好，ABC123 456。\n世界！'),6);});
