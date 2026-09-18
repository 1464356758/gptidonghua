import {GitHub} from './core/github.mjs';
import {Runner} from './core/runner.mjs';
import {CONTROL_PATH,repoName,assert,uid,chatURL,copy,ROLES} from './core/protocol.mjs';
import {addBook,selectIdea,event,activeCount} from './core/engine.mjs';
import {generate} from './core/generator.mjs';

let queue=Promise.resolve(),immediatePause=false;
function serial(fn){const p=queue.then(fn,fn);queue=p.catch(()=>{});return p;}
const defaultSettings={repo:'1464356758/gptidonghua',branch:'main'};
const transport={
  async tab(url,open){
    const tabs=await chrome.tabs.query({url:'https://chatgpt.com/*'});
    const matches=tabs.filter(t=>t.url?.split('?')[0].replace(/\/$/,'')===url);
    assert(matches.length<=1,'同一角色对话打开了多个标签页，请保留一个');
    if(matches.length)return matches[0];if(!open)return null;
    await chrome.tabs.create({url,active:false});return null;
  },
  async probe(url,id,open){
    try{const t=await this.tab(url,open);if(!t||t.status!=='complete')return {status:'LOADING'};return await chrome.tabs.sendMessage(t.id,{type:'relay.probe',id});}
    catch(e){if(e.message.includes('多个标签页'))return {status:'DUPLICATE_TAB'};return {status:'UNKNOWN'};}
  },
  async send(url,id,prompt){const t=await this.tab(url,false);assert(t,'对话标签页关闭');return await chrome.tabs.sendMessage(t.id,{type:'relay.send',id,prompt});},
  async refresh(url){const t=await this.tab(url,false);if(t)await chrome.tabs.reload(t.id);},
  async cache(s){await chrome.storage.local.set({lastState:s,lastSync:Date.now(),lastError:null});}
  ,async bindings(){return (await chrome.storage.local.get('chatBindings')).chatBindings||{};}
  ,async pauseRequested(){return immediatePause||!!(await chrome.storage.local.get('pauseRequested')).pauseRequested;}
};
async function settings(){return {...defaultSettings,...(await chrome.storage.local.get('settings')).settings};}
async function runner(){
  const {token}=await chrome.storage.session.get('token');assert(token,'请填写GitHub令牌；浏览器重启后需要重新填写');
  let {runnerId}=await chrome.storage.local.get('runnerId');if(!runnerId){runnerId=uid();await chrome.storage.local.set({runnerId});}
  return new Runner(new GitHub(token),transport,await settings(),runnerId);
}
async function tick(){
  const {retryAt}=await chrome.storage.local.get('retryAt');if(retryAt>Date.now())return;
  try{const r=await runner();await r.tick();await chrome.storage.local.set({retryAt:0});}
  catch(e){await chrome.storage.local.set({lastError:e.message,retryAt:e.retryAt>Date.now()?e.retryAt:Date.now()+60000});}
}
async function mutate(fn){const r=await runner();await r.load();await r.claim();await fn(r);await r.save();return r.s;}
async function assets(){return {base:await (await fetch(chrome.runtime.getURL('assets/base-template.json'))).json(),protocol:await (await fetch(chrome.runtime.getURL('assets/auto-protocol.md'))).text()};}
async function command(m){
  if(m.type==='state'){
    const local=await chrome.storage.local.get(['lastState','lastError','lastSync','retryAt']);
    const {token}=await chrome.storage.session.get('token');return {...local,settings:await settings(),hasToken:!!token};
  }
  if(m.type==='connect'){
    const existing=await chrome.storage.local.get('settings');const next={repo:repoName(m.repo),branch:m.branch||'main'};
    if(existing.settings&&(existing.settings.repo!==next.repo||existing.settings.branch!==next.branch)){
      const local=await chrome.storage.local.get('lastState');assert(!local.lastState||activeCount(local.lastState)===0,'仍有在途任务，不能切换控制仓库');
    }
    assert(typeof m.token==='string'&&m.token.trim(),'请输入令牌');
    const api=new GitHub(m.token.trim());await api.head(next.repo,next.branch);
    await chrome.storage.session.set({token:m.token.trim()});await chrome.storage.local.set({settings:next,retryAt:0});
    const r=await runner();await r.load();await transport.cache(r.s);return {ok:true};
  }
  if(m.type==='logout'){
    await mutate(async r=>{r.s.paused=true;r.s.pause_reason='令牌已移除；在途任务仍保留席位';});
    await chrome.storage.session.remove('token');return {ok:true};
  }
  if(m.type==='generate'){const a=await assets();return {files:await generate(a.base,m.config,a.protocol)};}
  if(m.type==='initialize'){
    const r=await runner();await r.load();await r.claim();
    assert(repoName(m.config.repo)!==r.settings.repo,'小说需使用独立仓库，不能覆盖控制台源码仓库');
    const a=await assets(),files=await generate(a.base,m.config,a.protocol),head=await r.api.head(m.config.repo,m.config.branch);
    const db=await r.api.read(m.config.repo,'数据库入口.json',head,true);assert(!db,'该仓库已有小说系统；禁止一键覆盖');
    // 用户新建仓库常有一个README；只在除此以外为空的仓库初始化。
    const tree=await r.api.request(`${r.api.root(m.config.repo)}/git/trees/${head}?recursive=1`);
    assert(!tree.truncated&&tree.tree.filter(x=>x.type==='blob').every(x=>x.path==='README.md'), '只允许初始化空仓库或仅有README的仓库');
    const commit=await r.api.atomic(m.config.repo,m.config.branch,files,head,false);
    const reread=await r.api.json(m.config.repo,'数据库入口.json',commit);assert(reread.value.repo_url===`https://github.com/${m.config.repo}`,'初始化回读失败');
    return {commit};
  }
  if(m.type==='add')return await mutate(async r=>{
    assert(repoName(m.config.repo)!==r.settings.repo,'小说仓库不能和控制仓库相同');addBook(r.s,copy(m.config));
    const bindings=await transport.bindings();bindings[m.config.id]=m.config.chats;await chrome.storage.local.set({chatBindings:bindings});
  });
  if(m.type==='bind')return await mutate(async r=>{
    const b=r.s.books.find(x=>x.config.id===m.config.id);assert(b,'先填写已登记的书号');
    assert(!Object.values(r.s.jobs).some(j=>j.book_id===b.config.id&&j.slot),'本书有在途任务，不能更换对话绑定');
    const chats=Object.fromEntries(Object.keys(ROLES).map(k=>[k,chatURL(m.config.chats[k])]));
    assert(new Set(Object.values(chats)).size===10,'本书不能共用对话');
    const others=new Set(r.s.books.filter(x=>x!==b).flatMap(x=>Object.values(x.config.chats||{})));assert(!Object.values(chats).some(x=>others.has(x)),'不同书不能共用对话');
    const bindings=await transport.bindings();bindings[b.config.id]=chats;b.config.chats=chats;if(b.held==='本机缺少十角色对话绑定，请重新绑定')b.held=null;
    await chrome.storage.local.set({chatBindings:bindings});
  });
  if(m.type==='pause')return await mutate(async r=>{r.s.paused=true;r.s.pause_reason='用户暂停；在途任务继续核对';});
  if(m.type==='resume')return await mutate(async r=>{r.s.paused=false;r.s.pause_reason='';await chrome.storage.local.set({retryAt:0,pauseRequested:false});immediatePause=false;});
  if(m.type==='select')return await mutate(async r=>{const b=r.s.books.find(x=>x.config.id===m.book);assert(b,'未找到小说');selectIdea(r.s,b,m.candidate);});
  if(m.type==='recheck')return await mutate(async r=>{const b=r.s.books.find(x=>x.config.id===m.book);assert(b,'未找到小说');b.held=null;event(r.s,`${b.config.id} 用户要求重新核验`);});
  if(m.type==='retry_unsent')return await mutate(async r=>{
    const j=r.s.jobs[m.job];assert(j&&j.status==='UNCERTAIN','只可处理发送状态不明的任务');
    const b=r.s.books.find(x=>x.config.id===j.book_id),p=await transport.probe(b.config.chats[j.role],j.id,false);
    assert(p.status==='IDLE'&&!p.hasJob,'页面并非空闲或已存在此任务，不能重发');
    assert(m.confirm==='我已核对历史，此任务没有发送','需要核对历史后输入确认文字');
    j.status='RESERVED';event(r.s,`${j.id} 用户核对未发送，允许一次重试`);
  });
  if(m.type==='tick'){await tick();return {ok:true};}
  throw new Error('未知操作');
}
chrome.runtime.onInstalled.addListener(()=>{chrome.alarms.create('relay-tick',{periodInMinutes:1});chrome.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});});
chrome.runtime.onStartup.addListener(()=>{chrome.alarms.create('relay-tick',{periodInMinutes:1});});
chrome.alarms.onAlarm.addListener(a=>{if(a.name==='relay-tick')serial(tick);});
chrome.action.onClicked.addListener(()=>chrome.tabs.create({url:chrome.runtime.getURL('dashboard.html')}));
chrome.runtime.onMessage.addListener((m,sender,respond)=>{
  // 页面内容脚本不能调用配置、令牌或控制台写操作。
  if(sender.id!==chrome.runtime.id||!sender.url?.startsWith(chrome.runtime.getURL('dashboard.html')))return;
  // 先记录停止意图，让进行中的检查在下一次点击发送前看到；随后顺序保存远端状态。
  if(m.type==='pause'){immediatePause=true;chrome.storage.local.set({pauseRequested:true});}
  serial(()=>command(m)).then(value=>respond({ok:true,value}),e=>respond({ok:false,error:e.message}));return true;
});
