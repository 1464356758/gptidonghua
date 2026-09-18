import {CONTROL_PATH,ACADEMY,encode,sha256,taskPath,promptFor,ROLES,copy,assert,VERSION} from './protocol.mjs';
import {newControl,takeLease,event,group,readyGroups,reserve,activeCount,markAccepted,collect,advanceNonDirector,applyDirectorRoute,releaseSlot} from './engine.mjs';
import {verifyReceipt,Pending} from './audit.mjs';

export class Runner {
  constructor(api,transport,settings,runnerId){this.api=api;this.transport=transport;this.settings=settings;this.runnerId=runnerId;}
  async load(){
    const r=await this.api.json(this.settings.repo,CONTROL_PATH,this.settings.branch,true);
    this.s=r?.value||newControl();this.sha=r?.sha||null;
    assert(this.s.schema==='novel-relay/1','远端控制台版本不兼容');
    if(this.transport.bindings){const bindings=await this.transport.bindings();for(const b of this.s.books)b.config.chats=bindings[b.config.id]||{};}
    return this.s;
  }
  async save(){
    this.s.revision++;const remote=copy(this.s);
    for(const b of remote.books)delete b.config.chats;
    const r=await this.api.write(this.settings.repo,this.settings.branch,CONTROL_PATH,encode(remote),this.sha);
    this.sha=r.content.sha;
    await this.transport.cache(this.s);
  }
  async claim(){takeLease(this.s,this.runnerId);await this.save();}
  async tick(){
    await this.load();await this.claim();
    // 发送前已记SENDING但进程中断：只能核对，不能再自动点击。
    for(const j of Object.values(this.s.jobs))if(j.status==='SENDING'){j.status='UNCERTAIN';event(this.s,`${j.id} 发送结果待核对`);}
    const heads={};
    for(const b of this.s.books){
      if(Object.keys(b.config.chats||{}).length!==10){b.held='本机缺少十角色对话绑定，请重新绑定';continue;}
      if(b.phase==='NEW'&&!b.held)group(this.s,b,'IDEA',['idea'],{keywords:b.config.keywords||''});
      const relevant=Object.values(this.s.jobs).filter(j=>j.book_id===b.config.id&&j.slot);
      if(!relevant.length)continue;
      try{heads[b.config.id]=await this.api.head(b.config.repo,b.config.branch);}catch(e){
        if([401,403,429].includes(e.status))throw e;
        b.wait_reason=e.message;if(e.status===404)b.held='本书仓库或分支不可读';continue;
      }
      for(const j of relevant){
        if(['RESERVED','SENT','UNCERTAIN'].includes(j.status)&&j.published_commit){
          try{
            const v=await verifyReceipt(this.api,b,j,heads[b.config.id]);
            if(v){markAccepted(this.s,j,v.result,v.commit);if(b.held?.startsWith('任务超过2小时'))b.held=null;}
          }catch(e){
            if(e instanceof Pending){j.wait_reason=e.message;}
            else if([401,403,429].includes(e.status))throw e;
            else if(e.status>=500||e.name==='TimeoutError'||e.name==='TypeError'){j.wait_reason='网络异常，下轮重查';}
            else {b.held=e.message;j.wait_reason=e.message;event(this.s,`${b.config.id} 阻断：${e.message}`);}
          }
        }
        const p=await this.transport.probe(b.config.chats[j.role],j.id,false);
        if(['LIMIT','CHALLENGE','LOGIN'].includes(p.status)){this.s.paused=true;this.s.pause_reason=`ChatGPT ${p.status}：请在网页恢复后点继续`;}
        if(j.status==='UNCERTAIN'&&p.hasJob){j.status='SENT';event(this.s,`${j.id} 已从用户任务号核对发送`);}
        if(j.status==='ACCEPTED'){
          j.idle_checks=p.status==='IDLE'?(j.idle_checks||0)+1:0;
          // 两轮观察，且至少15秒；未知或标签页丢失均保留席位。
          if(j.idle_checks>=2&&Date.now()-j.accepted_at>=15000)releaseSlot(j);
          else if(p.status==='BUSY'&&Date.now()-j.accepted_at>120000&&!j.refreshed_at){
            await this.transport.refresh(b.config.chats[j.role]);j.refreshed_at=Date.now();event(this.s,`${j.id} 已验凭证后刷新一次显示`);
          }
        }else if(['SENT','UNCERTAIN'].includes(j.status)&&!this.s.paused&&j.reserved_at&&Date.now()-j.reserved_at>7200000){b.held='任务超过2小时仍无有效完成凭证；保持席位，等待检查';}
      }
    }
    for(const bookId of this.s.books.map(b=>b.config.id)){
      const b=this.s.books.find(x=>x.config.id===bookId);
      if(b.held||!b.group)continue;
      const trial=copy(this.s),tb=trial.books.find(x=>x.config.id===bookId);
      const prev=collect(trial,tb);if(!prev)continue;
      try{
        if(prev.jobs[0].role==='director'){
          const d=prev.jobs[0];applyDirectorRoute(trial,tb,d.result.route,{route:d.result.route,director_commit:d.commit,director_result:`自动化/结果/${d.id}.json`});
        }else advanceNonDirector(trial,tb,prev);
        this.s=trial;
      }catch(e){b.held=e.message;event(this.s,`${b.config.id} 路由阻断：${e.message}`);}
    }
    this.prune();await this.save();
    if(await this.transport.pauseRequested?.()){this.s.paused=true;this.s.pause_reason='用户要求暂停新发送';await this.save();}
    if(this.s.paused)return;
    // 先恢复已经预留但确认尚未尝试发送的任务。
    for(const b of this.s.books){if(b.held||!b.group)continue;await this.sendReserved(b);if(this.s.paused)return;}
    for(const b of readyGroups(this.s)){
      if(activeCount(this.s)+b.group.jobs.length>6)continue;
      const statuses=[];
      for(const id of b.group.jobs)statuses.push(await this.transport.probe(b.config.chats[this.s.jobs[id].role],id,true));
      if(statuses.some(p=>p.status!=='IDLE')){b.wait_reason='等待整组对话空闲、登录或页面适配';continue;}
      try{await this.publishGroup(b);}catch(e){
        if(e.status===409||e.status===422||e.message==='仓库已改变，请重新同步后再提交'){b.wait_reason='仓库同时发生提交，下轮重试准备';continue;}
        if([401,403,429].includes(e.status))throw e;
        if(e.status>=500||e.name==='TimeoutError'||e.name==='TypeError'){b.wait_reason='网络异常，下轮重试准备';continue;}
        b.held=e.message;event(this.s,`${b.config.id} 准备任务阻断：${e.message}`);continue;
      }
      delete b.wait_reason;reserve(this.s,b);await this.save();await this.sendReserved(b);if(this.s.paused)return;
    }
    await this.save();
  }
  async publishGroup(b){
    const js=b.group.jobs.map(id=>this.s.jobs[id]);if(js.every(j=>j.published_commit))return;
    const existing=[];
    for(const j of js)existing.push(await this.api.read(j.repo,taskPath(j.id),j.branch,true));
    if(existing.some(Boolean)){
      // 原子发布成功而本地/控制状态保存前崩溃：用固定文件恢复，不能换nonce或重造任务。
      assert(existing.every(Boolean),'任务组只发布了部分文件，需人工检查');
      const head=await this.api.head(b.config.repo,b.config.branch);
      for(let i=0;i<js.length;i++){
        const data=JSON.parse(existing[i].text);assert(data.id===js[i].id&&data.nonce===js[i].nonce,'任务发布恢复身份不符');
        Object.assign(js[i],{input_commit:data.input_commit,state_sha256:data.state_sha256,task_sha256:await sha256(existing[i].text),published_commit:head});
      }
      await this.save();return;
    }
    const head=await this.api.head(b.config.repo,b.config.branch);
    const state=await this.api.read(b.config.repo,'运行状态.json',head);
    const db=(await this.api.json(b.config.repo,'数据库入口.json',head)).value;
    assert(db.repo_url===`https://github.com/${b.config.repo}`&&db.branch===b.config.branch&&db.platform===b.config.platform&&db.academy_repo===`https://github.com/${ACADEMY}`,'小说配置未初始化或与控制台不一致');
    assert(db.chapter_range.start===b.config.start&&db.chapter_range.end===b.config.end&&db.chapter_words.min===b.config.min&&db.chapter_words.max===b.config.max,'小说章节/字数配置不一致');
    const protocol=await this.api.read(b.config.repo,'自动化/角色执行协议.md',head);assert(protocol.text.includes(VERSION),'缺当前自动化执行协议');
    const files={};
    for(const j of js){
      j.input_commit=head;j.state_sha256=await sha256(state.text);
      const {chats,...config}=b.config;
      const envelope={schema:'novel-job/1',version:VERSION,id:j.id,book_id:j.book_id,role:j.role,phase:j.phase,chapter:j.chapter,round:j.round,repo:j.repo,branch:j.branch,nonce:j.nonce,input_commit:head,state_sha256:j.state_sha256,input:copy(j.input),config,control_repo:this.settings.repo,control_branch:this.settings.branch,role_path:`角色指令/${ROLES[j.role]}.txt`,protocol_path:'自动化/角色执行协议.md'};
      files[taskPath(j.id)]=encode(envelope);j.task_sha256=await sha256(files[taskPath(j.id)]);
    }
    const commit=await this.api.atomic(b.config.repo,b.config.branch,files,head);
    for(const j of js)j.published_commit=commit;
    await this.save();
  }
  async sendReserved(b){
    if(!b.group)return;
    for(const id of b.group.jobs){
      const j=this.s.jobs[id];if(j.status!=='RESERVED')continue;
      if(await this.transport.pauseRequested?.()){this.s.paused=true;this.s.pause_reason='用户要求暂停新发送';await this.save();return;}
      assert(j.published_commit,'任务尚未写入GitHub');
      // 尽量减小租约过期后旧实例继续发的窗口；多实例CAS冲突即停止。
      assert(this.s.lease.owner===this.runnerId&&this.s.lease.expires>Date.now()+10000,'执行租约即将过期，下轮重新续约');
      const p=await this.transport.probe(b.config.chats[j.role],id,false);
      if(p.hasJob){j.status='SENT';await this.save();continue;}
      if(p.status!=='IDLE'){j.wait_reason='发送前页面不空闲';if(['LIMIT','LOGIN','CHALLENGE'].includes(p.status)){this.s.paused=true;this.s.pause_reason=`ChatGPT ${p.status}`;await this.save();}return;}
      const currentState=await this.api.read(j.repo,'运行状态.json',j.branch);
      if(await sha256(currentState.text)!==j.state_sha256){b.held='发送前正式运行状态已变化；任务未发送，需检查';await this.save();return;}
      j.status='SENDING';await this.save(); // 写前日志必须先于浏览器点击。
      let sent;try{sent=await this.transport.send(b.config.chats[j.role],id,promptFor(j,j.published_commit));}catch{sent={status:'UNCERTAIN'};}
      j.status=['SENT','ALREADY_SENT'].includes(sent.status)?'SENT':'UNCERTAIN';
      if(j.status==='UNCERTAIN')event(this.s,`${id} 发送未确认；禁止自动重发`);
      if(['LIMIT','LOGIN','CHALLENGE'].includes(sent.status)){this.s.paused=true;this.s.pause_reason=`ChatGPT ${sent.status}`;}
      await this.save();
    }
  }
  prune(){
    const used=new Set(this.s.books.flatMap(b=>b.group?.jobs||[]));
    for(const [id,j] of Object.entries(this.s.jobs))if(j.status==='ACCEPTED'&&!j.slot&&!used.has(id))delete this.s.jobs[id];
    for(const b of this.s.books)b.history=b.history.slice(-80);
  }
}
