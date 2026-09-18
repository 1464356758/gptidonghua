import {assert, copy, uid, validateBook, ROLES} from './protocol.mjs';
export function newControl() { return {schema:'novel-relay/1', revision:0, paused:true, pause_reason:'尚未启动', lease:null, cursor:0, books:[], jobs:{}, events:[]}; }
export function event(s, text) { s.events.push({at:new Date().toISOString(),text}); s.events = s.events.slice(-200); }
export function addBook(s, config) {
  validateBook(config);
  assert(s.books.length < 3, '最多管理三本书');
  assert(!s.books.some(b=>b.config.id===config.id || b.config.repo===config.repo), '书号与小说仓库必须互相独立');
  const chats = new Set(s.books.flatMap(b=>Object.values(b.config.chats)));
  assert(!Object.values(config.chats).some(u=>chats.has(u)), '不同小说不能共用角色对话');
  const b = {config:copy(config), phase:'NEW', chapter:config.start, round:0, winner:null, group:null, input:null, held:null, history:[]};
  s.books.push(b); event(s,`登记 ${config.id}`); return b;
}
export function activeCount(s) { return Object.values(s.jobs).filter(j=>j.slot).length; }
export function takeLease(s, runner, now = Date.now()) {
  if (s.lease && s.lease.owner !== runner) {
    assert(s.lease.expires <= now, '另一台控制台正在执行');
    assert(activeCount(s) === 0, '旧控制台仍有占用席位；禁止自动接管或重复发送');
  }
  s.lease={owner:runner,expires:now+180000,epoch:s.lease?.owner===runner?s.lease.epoch:(s.lease?.epoch||0)+1};
}
export function group(s,b,phase,roles,input=null) {
  assert(!b.group, '当前任务组尚未清算');
  assert(roles.length && roles.length<=3 && new Set(roles).size===roles.length && roles.every(r=>ROLES[r]), '任务组角色不合法');
  const id = `${b.config.id}-${uid()}`;
  b.phase=phase; b.input=copy(input); b.group={id,phase,jobs:roles.map(role=>{
    const jid=`${id}-${role}`;
    s.jobs[jid]={id:jid,book_id:b.config.id,role,phase,chapter:b.chapter,round:b.round,repo:b.config.repo,branch:b.config.branch,nonce:uid(),status:'QUEUED',slot:false,input:copy(input),created:Date.now()};
    return jid;
  })};
  event(s,`${b.config.id} 排队：${phase}`); return b.group;
}
export function readyGroups(s) {
  const n=s.books.length, out=[];
  for(let k=0;k<n;k++) {const b=s.books[(s.cursor+k)%n];if(!b.held && b.group && b.group.jobs.every(id=>s.jobs[id].status==='QUEUED'))out.push(b);}
  return out;
}
export function reserve(s,b,now=Date.now()) {
  assert(!s.paused && !b.held,'系统或小说已暂停');
  const js=b.group.jobs.map(id=>s.jobs[id]);
  assert(js.every(j=>j.status==='QUEUED'),'不可重复领取');
  assert(activeCount(s)+js.length<=6,'全局六席不足，整组等待');
  js.forEach(j=>{j.status='RESERVED';j.slot=true;j.reserved_at=now;});
  s.cursor=(s.books.indexOf(b)+1)%s.books.length;
  event(s,`${b.config.id} 整组领取 ${js.length} 席`);
}
export function markAccepted(s,j,result,commit) {
  assert(['RESERVED','SENT','UNCERTAIN'].includes(j.status),'此任务不接受完成凭证');
  j.status='ACCEPTED';j.result=copy(result);j.artifact_commit=commit;j.accepted_at=Date.now();
  // 业务完成与浏览器席位释放为两个事件。
  event(s,`${j.book_id} ${j.role} 凭证核验完成`);
}
export function releaseSlot(j) { assert(j.status==='ACCEPTED','没有有效完成凭证不能自动释放'); j.slot=false;j.idle_checks=0; }
export function collect(s,b) {
  if(!b.group)return null;
  const jobs=b.group.jobs.map(id=>s.jobs[id]);
  if(!jobs.every(j=>j.status==='ACCEPTED'))return null;
  const previous={phase:b.group.phase,jobs:jobs.map(j=>({id:j.id,role:j.role,commit:j.artifact_commit,result:j.result}))};
  b.history.push({group_id:b.group.id,phase:b.phase,job_ids:[...b.group.jobs]});
  b.group=null; return previous;
}
export function advanceNonDirector(s,b,previous) {
  const phase=previous.phase;
  if(phase==='IDEA')return group(s,b,'IDEA_JUDGE',['idea_judge'],previous);
  if(phase==='IDEA_JUDGE') {
    const r=previous.jobs[0].result;
    if(r.eligible_ids.length===0) { b.idea_retries=(b.idea_retries||0)+1;assert(b.idea_retries<=3,'连续三批选题不可用，需要调整关键词');return group(s,b,'IDEA',['idea'],previous); }
    b.phase='WAIT_SELECTION';b.selection_source=previous;event(s,`${b.config.id} 等待用户最终选题`);return;
  }
  assert(['WRITERS','JUDGE','REVIEWS','REVISION','RECHECK','STAGE','FINAL'].includes(phase),'未知执行阶段');
  return group(s,b,`DIRECTOR_AFTER_${phase}`,['director'],previous);
}
export function selectIdea(s,b,candidate_id) {
  assert(b.phase==='WAIT_SELECTION' && !b.group,'当前不在人工选题节点');
  const r=b.selection_source.jobs[0].result;
  assert(r.eligible_ids.includes(candidate_id),'该候选不在本轮可选列表');
  const candidate=r.candidates.find(c=>c.id===candidate_id);assert(candidate,'候选记录缺失');
  b.selection={candidate_id,title:candidate.title,idea_run_id:r.idea_run_id,judge_review_path:r.review_path,selected_at:new Date().toISOString(),user_selected:true};
  group(s,b,'DIRECTOR_SETUP',['director'],{...b.selection_source,selection:b.selection});
}
export function applyDirectorRoute(s,b,route,input) {
  const from=b.phase, a=route.action;
  const allowed={DIRECTOR_SETUP:['WRITE','HOLD'],DIRECTOR_AFTER_WRITERS:['JUDGE','HOLD'],DIRECTOR_AFTER_JUDGE:['REVIEW','HOLD'],DIRECTOR_AFTER_REVIEWS:['WRITE','STAGE','REVISE','HOLD'],DIRECTOR_AFTER_REVISION:['RECHECK','HOLD'],DIRECTOR_AFTER_RECHECK:['WRITE','STAGE','FINAL','REVISE','HOLD'],DIRECTOR_AFTER_STAGE:['WRITE','FINAL','REVISE','HOLD'],DIRECTOR_AFTER_FINAL:['COMPLETE','REVISE','HOLD']};
  assert(allowed[from]?.includes(a),`非法路由 ${from} → ${a}`);
  if(a==='HOLD'){b.held=route.reason||'总监要求暂停';b.phase='HOLD';return;}
  assert(Number.isInteger(route.chapter) && route.chapter>=b.config.start && route.chapter<=b.config.end,'路由章节越界');
  if(a==='WRITE') {
    const expected=from==='DIRECTOR_SETUP'?b.config.start:b.chapter+1;
    assert(route.chapter===expected,'新章必须连续，禁止跳章');
    b.chapter=route.chapter;b.round=0;b.winner=null;b.repair_scope=null;
    return group(s,b,'WRITERS',['writer_a','writer_b','writer_c'],input);
  }
  if(a==='REVISE') {
    const repair=['DIRECTOR_AFTER_STAGE','DIRECTOR_AFTER_FINAL'].includes(from)||b.repair_scope;
    if(repair){assert(['STAGE','FINAL'].includes(route.repair_scope),'阶段回修缺修复范围');b.repair_scope=route.repair_scope;b.resume_chapter??=b.chapter;}
    else assert(route.chapter===b.chapter,'普通返修不得换章');
    assert(['A','B','C'].includes(route.winner),'返修缺原获选写手');
    if(!repair)assert(route.winner===b.winner,'返修不得换冠军');
    const oldRound = b.repair_rounds?.[route.chapter]??(route.chapter===b.chapter?b.round:0);
    assert(route.round===oldRound+1 && route.round<=3,'每章最多三轮返修，轮次必须连续');
    b.repair_rounds??={};b.repair_rounds[route.chapter]=route.round;b.round=route.round;b.chapter=route.chapter;b.winner=route.winner;
    return group(s,b,'REVISION',[`writer_${b.winner.toLowerCase()}`],input);
  }
  if(a==='STAGE'||a==='FINAL') {
    const expected=b.resume_chapter??b.chapter;
    assert(route.chapter===expected,'阶段回审必须恢复原生产章');
    b.chapter=expected;delete b.resume_chapter;
    return group(s,b,a,['stage'],input);
  }
  assert(route.chapter===b.chapter,'同轮不得更换章节');
  if(a==='JUDGE')return group(s,b,'JUDGE',['judge'],input);
  if(a==='REVIEW') {assert(['A','B','C'].includes(route.winner),'缺获选写手');b.winner=route.winner;return group(s,b,'REVIEWS',['logic','style'],input);}
  if(a==='RECHECK')return group(s,b,'RECHECK',['judge','logic','style'],input);
  if(a==='COMPLETE'){assert(b.chapter===b.config.end,'未到终章不能完成');b.phase='DONE';event(s,`${b.config.id} 全书完成`);}
}
