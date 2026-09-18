import {assert,isSHA,isHash,sha256,countWords,resultPath,receiptPath,safePath} from './protocol.mjs';
export class Pending extends Error {}
export async function verifyReceipt(api,b,j,head) {
  const got=await api.json(j.repo,receiptPath(j.id),head,true);if(!got)return null;
  const r=got.value;
  for(const [k,v] of Object.entries({schema:'novel-completion/1',job_id:j.id,book_id:j.book_id,role:j.role,nonce:j.nonce,input_commit:j.input_commit,task_sha256:j.task_sha256}))assert(r[k]===v,`完成凭证 ${k} 与任务不符`);
  assert(['COMPLETE','BLOCKED'].includes(r.status),'凭证未宣告完成');
  if(r.status==='BLOCKED')throw new Error(`角色阻断：${String(r.reason||'未说明原因').slice(0,300)}`);
  assert(isSHA(r.artifact_commit),'产物提交必须是40位Git提交SHA');
  assert(await api.ancestor(j.repo,j.published_commit,r.artifact_commit),'产物不是任务发布提交的后代');
  assert(await api.ancestor(j.repo,r.artifact_commit,head),'产物提交不属于当前分支历史');
  assert(Array.isArray(r.artifacts)&&r.artifacts.length>0&&r.artifacts.length<=1000,'产物清单不能为空或过大');
  const manifest=new Map();
  for(const x of r.artifacts){safePath(x.path);assert(isHash(x.sha256)&&!manifest.has(x.path),'产物SHA或重复路径错误');manifest.set(x.path,x.sha256);}
  const read=async p=>{
    safePath(p);assert(manifest.has(p),`完成清单未绑定：${p}`);
    const a=await api.read(j.repo,p,r.artifact_commit);assert(await sha256(a.text)===manifest.get(p),`固定产物哈希不符：${p}`);
    // 已完成产物在收到凭证前被改写也不能通过。
    const latest=await api.read(j.repo,p,head);assert(latest.sha===a.sha,`产物已被后续改写：${p}`);
    return a.text;
  };
  const json=async p=>JSON.parse(await read(p));
  assert(r.result_path===resultPath(j.id),'结果入口错误');
  const result=await json(r.result_path);
  for(const p of manifest.keys())await read(p);
  if(['writer_a','writer_b','writer_c','judge','logic','style','stage'].includes(j.role)&&j.state_sha256){
    const state=await api.read(j.repo,'运行状态.json',head);
    assert(await sha256(state.text)===j.state_sha256,'执行角色期间正式状态被改写');
  }
  const input=j.input?.route||{};
  if(j.role.startsWith('writer_')) {
    assert(result.kind==='WRITER','写手结果类型错误');
    const d=await json(result.delivery_path);const body=await read(d.body_path);
    assert(d.status==='DELIVERED'&&d.chapter===j.chapter&&d.writer===j.role.slice(-1).toUpperCase()&&d.task_id===input.task_id,'写手交付身份/章节/TASK不符');
    assert(d.body_sha256===await sha256(body),'正文哈希不符');
    const wc=countWords(body);assert(wc===d.word_count&&wc>=b.config.min&&wc<=b.config.max,'正文字数不符');
    assert(d.body_path.startsWith(`稿件/第${String(j.chapter).padStart(3,'0')}章/写手${d.writer}/`),'正文目录不属于本章本写手');
    result.delivery=d;
  } else if(j.role==='logic'||j.role==='style') {
    assert(result.kind==='REVIEW','审核结果类型错误');const v=await json(result.review_path);
    assert(v.status==='REVIEWED'&&v.review_type===(j.role==='logic'?'LOGIC':'STYLE')&&v.chapter===j.chapter&&v.task_id===input.task_id&&v.body_sha256===input.body_sha256,'审核未绑定当前TASK正文');
    assert(typeof v.pass==='boolean'&&['fatal','major','minor'].every(k=>Array.isArray(v[k])),'审核字段缺失');
    if(v.pass){assert(!v.fatal.length&&!v.major.length,'审核有重要问题却宣称通过');if(j.role==='style')assert(Number.isInteger(v.score)&&v.score>=88,'文风评分未达到88');}
    result.review=v;
  } else if(j.role==='judge') {
    if(j.phase==='RECHECK') {
      assert(result.kind==='GATE','返修只允许门禁复核');const g=await json(result.commercial_gate_path);
      assert(g.body_sha256===input.body_sha256&&g.task_id===input.task_id&&typeof g.pass==='boolean','商业门禁未绑定本轮正文');result.gate=g;
    } else {
      assert(result.kind==='JUDGE','裁判结果类型错误');const v=await json(result.blind_result_path);
      assert(v.status==='FROZEN'&&['X','Y','Z'].includes(v.winner_alias)&&v.task_id===input.task_id,'盲评未冻结或任务不符');
      result.judgment=v;result.gate=await json(result.commercial_gate_path);
      assert(result.gate.body_sha256===v.winner_body_sha256,'门禁与获选匿名正文不符');
    }
  } else if(j.role==='idea') {
    assert(result.kind==='IDEAS'&&typeof result.idea_run_id==='string','缺选题批次');
    assert(Array.isArray(result.candidates)&&result.candidates.length===10&&new Set(result.candidates.map(c=>c.id)).size===10,'必须十个不同灵感候选');
    for(const c of result.candidates){assert(typeof c.id==='string'&&c.id&&c.title&&c.path,'候选字段缺失');assert((await read(c.path)).trim().length>0,'候选全文为空');}
  } else if(j.role==='idea_judge') {
    assert(result.kind==='IDEA_REVIEW'&&Array.isArray(result.eligible_ids),'灵感裁判结果格式错误');
    const prev=j.input.jobs[0].result;
    assert(result.idea_run_id===prev.idea_run_id,'灵感裁判跨批次');
    assert(new Set(result.eligible_ids).size===result.eligible_ids.length&&result.eligible_ids.every(id=>prev.candidates.some(c=>c.id===id)),'可选候选不是本批候选');
    assert((await read(result.review_path)).trim().length>0,'裁判报告为空');result.candidates=prev.candidates;
  } else if(j.role==='stage') {
    assert(result.kind==='STAGE','阶段审核结果错误');const v=await json(result.review_path);
    assert(v.review_type===(j.phase==='FINAL'?'FINAL_BOOK':'STAGE')&&typeof v.pass==='boolean','阶段/终局审核类型错误');
    assert(v.snapshot_sha256===input.snapshot_sha256,'阶段审核绑定过期快照');
    assert(['p0','p1','p2'].every(k=>Array.isArray(v[k])),'阶段问题列表缺失');
    if(v.pass)assert(v.status==='PASS'&&!v.p0.length&&!v.p1.length,'阶段有严重问题却宣称通过');result.review=v;
  } else if(j.role==='director') {
    assert(result.kind==='DIRECTOR'&&result.route,'缺总监路由');
    await verifyDirector(api,b,j,result,r.artifact_commit);
  } else throw new Error('未知角色');
  return {result,commit:r.artifact_commit};
}

export async function verifyDirector(api,b,j,result,ref) {
  const route=result.route,repo=b.config.repo;
  if(route.action==='HOLD')return;
  const read=async p=>(await api.read(repo,safePath(p),ref)).text;
  const json=async p=>JSON.parse(await read(p));
  const hash=async p=>sha256(await read(p));
  const state=await json('运行状态.json');
  assert(state.chapter===route.chapter,'路由与正式运行状态章节不一致');
  for(const source of j.input?.jobs||[]){
    const p=source.result.review_path||source.result.delivery_path||source.result.blind_result_path;
    if(p){const before=await api.read(repo,p,source.commit);assert(await hash(p)===await sha256(before.text),'总监改写了刚完成的执行角色报告');}
  }
  const ci=await api.ci(repo,ref);
  if(!ci.ok){if(ci.pending)throw new Pending('等待总监产物固定提交的五套CI');throw new Error('总监固定产物提交CI失败');}
  if(route.action==='WRITE') {
    assert(state.project_state==='WRITING','写作路由要求WRITING');
    const t=await json(state.current_task_path);
    assert(t.chapter===route.chapter&&t.task_id===route.task_id&&t.platform===b.config.platform,'正式TASK不匹配');
    assert(t.body_word_range.min===b.config.min&&t.body_word_range.max===b.config.max,'TASK字数与配置不一致');
    if(route.chapter>b.config.start)assert(isHash(t.previous_lock_sha256)&&await hash(t.previous_lock_path)===t.previous_lock_sha256,'前章LOCK引用失效');
    const ctx=await json(state.context_package_path);assert(ctx.task_id===t.task_id,'上下文包TASK不一致');
    const snap=await json('设定/平台规则快照.json');assert(isSHA(snap.academy_commit_sha),'未冻结学院版本');
    if(j.phase==='DIRECTOR_SETUP'){
      const selection=await json(state.user_selection_path);const chosen=b.selection;
      assert(selection.user_selected===true&&chosen&&selection.candidate_id===chosen.candidate_id&&selection.idea_run_id===chosen.idea_run_id,'总监没有尊重用户最终选择');
    }
  }
  if(route.action==='JUDGE') {
    assert(state.project_state==='JUDGING','盲评要求JUDGING');
    const p=await json(state.blind_package_path);assert(Object.keys(p.candidates).sort().join()==='X,Y,Z','匿名包必须X/Y/Z');
    const hashes=[];for(const c of Object.values(p.candidates)){assert(await hash(c.body_path)===c.body_sha256,'匿名正文SHA不符');hashes.push(c.body_sha256);}
    assert(new Set(hashes).size===3,'匿名稿重复');
    const previous=j.input.jobs.map(x=>x.result.delivery.body_sha256).sort();assert(hashes.sort().join()===previous.join(),'匿名包不是本组三稿');
  }
  if(['REVIEW','RECHECK'].includes(route.action)) {
    assert(state.project_state==='DUAL_REVIEW'&&state.task_id===route.task_id,'审核状态/TASK错误');
    assert(isHash(route.body_sha256)&&await hash(state.candidate_body_path)===route.body_sha256&&state.candidate_body_sha256===route.body_sha256,'审核目标正文不符');
    assert(state.selected_writer===(route.winner||b.winner),'审核获选写手不一致');
    if(route.action==='REVIEW') {
      const resolved=await json(state.resolved_judge_path);const blind=await json(resolved.blind_result_path);const mapping=await json(resolved.mapping_path);
      assert(await hash(resolved.blind_result_path)===resolved.blind_result_sha256&&await hash(resolved.mapping_path)===resolved.mapping_sha256,'盲评/映射SHA错误');
      assert(blind.status==='FROZEN'&&resolved.winner===route.winner&&mapping.mapping[blind.winner_alias]===route.winner&&resolved.winner_body_sha256===route.body_sha256,'解封冠军错误');
      assert(j.input.jobs[0].result.judgment.winner_body_sha256===route.body_sha256,'裁判交付后换稿');
    } else {
      const d=j.input.jobs[0].result.delivery;assert(d.body_sha256===route.body_sha256&&d.writer===b.winner,'返修复核不是原获选写手新稿');
    }
  }
  if(route.action==='REVISE') {
    assert(state.project_state==='REVISION'&&state.chapter_revision_round===route.round,'返修状态或轮次错误');
    const order=await json(state.revision_order_path);assert(order.task_id===route.task_id,'返修令TASK错误');
    if(['STAGE','FINAL'].includes(route.repair_scope)){
      const original=await json(route.original_lock_path);assert(original.writer===route.winner&&original.chapter===route.chapter,'阶段回修必须发原获选写手');
      assert(route.impact_analysis_path&&(await read(route.impact_analysis_path)).trim(),'阶段回修缺影响分析');
    }
  }
  if(['STAGE','FINAL'].includes(route.action)) {
    assert(route.snapshot_path&&await hash(route.snapshot_path)===route.snapshot_sha256,'阶段快照未绑定当前版本');
    const snap=await json(route.snapshot_path);
    if(route.action==='STAGE') {
      assert(['REVIEW_REQUIRED','REVIEWING'].includes(state.stage_state),'阶段状态不允许审核');
      const entries=snap.chapter_locks;assert(Array.isArray(entries)&&entries.length===snap.end_chapter-snap.start_chapter+1,'阶段快照未完整覆盖章节');
      for(let i=0;i<entries.length;i++){const e=entries[i];assert(e.chapter===snap.start_chapter+i&&await hash(e.lock_path)===e.lock_sha256,'阶段快照章序或LOCK哈希过期');}
    } else assert(['FINAL_REVIEW_REQUIRED','FINAL_REVIEWING'].includes(state.stage_state),'终局状态错误');
  }
  // 离开章级双审核后必须有真实锁定链，不能用“完成”字样放行。
  const leavingReview=['DIRECTOR_AFTER_REVIEWS','DIRECTOR_AFTER_RECHECK'].includes(j.phase)&&['WRITE','STAGE','FINAL','REVISE'].includes(route.action);
  if(leavingReview && (route.action!=='REVISE'||route.chapter!==b.chapter)) {
    assert(route.completed_lock_path,'路由缺上一完成章的锁定凭证');
    await verifyLock(read,json,route.completed_lock_path,b,j);
  }
  if(route.action==='COMPLETE')assert(state.project_state==='COMPLETED'&&state.stage_state==='FINAL_CLOSED','正式状态未完成终局');
  if(['DIRECTOR_AFTER_STAGE','DIRECTOR_AFTER_FINAL'].includes(j.phase)&&!['REVISE','HOLD'].includes(route.action)){
    const completed=j.input.jobs[0].result.review;
    assert(completed?.pass===true&&completed.status==='PASS','刚完成的阶段/终局审核未通过，不得推进');
  }
}
export async function verifyLock(read,json,path,b,j) {
  const c=await json(path);const text=await read(c.body_path);const sha=await sha256(text);
  assert(c.status==='LOCKED'&&c.chapter===b.chapter&&c.writer===b.winner&&c.body_sha256===sha,'锁定身份或正文SHA错误');
  assert(c.word_count===countWords(text)&&c.word_count>=b.config.min&&c.word_count<=b.config.max,'锁定字数不符');
  for(const [p,typ] of [[c.logic_review_path,'LOGIC'],[c.style_review_path,'STYLE']]){
    const v=await json(p);assert(v.pass===true&&v.body_sha256===sha&&v.review_type===typ&&v.task_id===c.task_id&&!v.fatal.length&&!v.major.length,'锁定审核未通过同一正文');
    if(typ==='STYLE')assert(v.score>=88,'锁定文风低于88');
    const sent=j.input.jobs.find(x=>x.role===(typ==='LOGIC'?'logic':'style'));
    assert(sent&&sent.result.review_path===p&&sent.result.review.pass&&sent.result.review.body_sha256===sha,'锁定审核不是刚完成的审核任务');
  }
  const g=await json(c.commercial_gate_path);assert(g.pass&&g.body_sha256===sha&&g.score>=85&&!g.hard_failures.length&&g.value_events.length>=2,'商业门禁不通过');
  const d=await json(c.memory_delta_path);assert(d.body_sha256===sha&&d.summary.length>=300&&d.summary.length<=500,'记忆摘要缺失或不符');
  const m=await json(c.memory_apply_receipt_path);assert(m.body_sha256===sha&&await sha256(await read(m.delta_path))===m.delta_sha256,'记忆回执未绑定增量');
  assert(Object.keys(m.updated_ledgers||{}).length>0,'记忆未实际应用');
  for(const [p,h] of Object.entries(m.updated_ledgers))assert(await sha256(await read(p))===h,'记忆账本哈希不符');
}
