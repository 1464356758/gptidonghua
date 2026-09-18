import {ROLES,repoName} from './core/protocol.mjs';
import {zip} from './core/zip.mjs';
import {importMatchingBytes} from './core/matching.mjs';
const $=id=>document.getElementById(id);
const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
function notice(text){$('notice').textContent=text;}
async function rpc(type,body={}){const r=await chrome.runtime.sendMessage({type,...body});if(!r?.ok)throw new Error(r?.error||'控制台暂未响应');return r.value;}
async function act(fn){document.querySelectorAll('button').forEach(b=>b.disabled=true);try{await fn();await refresh();}catch(e){notice(e.message);}finally{document.querySelectorAll('button').forEach(b=>b.disabled=false);}}
for(const [key,name] of Object.entries(ROLES)){const label=node('label',name.replace('_',' ')),input=node('input');input.id='chat-'+key;input.placeholder='https://chatgpt.com/c/…';label.append(input);$('chatFields').append(label);}
function config(){return {id:$('bookId').value.trim(),title:$('title').value.trim(),platform:$('platform').value,repo:repoName($('repo').value),branch:$('branch').value.trim(),academy_repo:$('academyRepo').value.trim(),academy_branch:$('academyBranch').value.trim(),start:+$('start').value,end:+$('end').value,min:+$('min').value,max:+$('max').value,keywords:$('keywords').value.trim(),chats:Object.fromEntries(Object.keys(ROLES).map(k=>[k,$('chat-'+k).value.trim()]))};}
function saveBlob(blob,name){const u=URL.createObjectURL(blob),a=node('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),10000);}
async function generateFile(){const c=config(),r=await rpc('generate',{config:c});return new File([zip(r.files)],`${c.id}_小说匹配文件_AUTO_RC2.zip`,{type:'application/zip'});}
$('generate').onclick=()=>act(async()=>{const f=await generateFile();saveBlob(f,f.name);notice('匹配文件已生成。包含新学院入口及自动化协议。');});
$('share').onclick=()=>act(async()=>{const f=await generateFile();if(navigator.canShare?.({files:[f]}))await navigator.share({files:[f],title:f.name});else{saveBlob(f,f.name);notice('此浏览器不支持直接分享，已下载ZIP。');}});
$('connect').onclick=()=>act(async()=>{await rpc('connect',{repo:$('controlRepo').value,branch:$('controlBranch').value,token:$('token').value});$('token').value='';notice('GitHub已连接。先初始化小说仓库、登记对话，再开始。');});
$('logout').onclick=()=>act(async()=>{await rpc('logout');notice('已暂停并移除令牌；在途任务仍保留。');});
$('initialize').onclick=()=>act(async()=>{notice('正在初始化小说空仓库，请保持控制台打开。');const r=await rpc('initialize',{config:config()});notice(`已初始化并回读关键配置。提交：${r.commit}\n等待GitHub中五套CI通过后，再登记并开始。`);});
$('add').onclick=()=>act(async()=>{await rpc('add',{config:config()});notice('小说已登记。首次运行请先确认十个角色能实际读取和写入小说仓库。');});
$('bind').onclick=()=>act(async()=>{await rpc('bind',{config:config()});notice('本机角色对话绑定已更新。');});
$('resume').onclick=()=>act(async()=>{await rpc('resume');await rpc('tick');notice('已继续接力；每分钟核对GitHub，满组满足条件时发送。');});
$('pause').onclick=()=>act(async()=>{await rpc('pause');notice('已暂停新发送；已经执行的任务继续核对并保存。');});
$('sync').onclick=()=>act(async()=>{await rpc('tick');notice('已核对当前GitHub状态。');});
async function refresh(){
  const x=await rpc('state'),s=x.lastState;
  $('slots').textContent=`${Object.values(s?.jobs||{}).filter(j=>j.slot).length} / 6`;$('booksCount').textContent=`${s?.books.length||0} / 3`;
  $('status').textContent=!x.hasToken?'待连接':s?.paused?'暂停':'运行中';$('synced').textContent=x.lastSync?new Date(x.lastSync).toLocaleTimeString():'—';
  $('pauseReason').textContent=x.lastError||s?.pause_reason||'';
  $('books').replaceChildren();
  for(const b of s?.books||[]){
    const card=node('article');card.className='book';card.append(node('small',b.config.id+' · '+b.config.platform),node('h2',b.config.title));
    const ph=node('span',`第 ${b.chapter} 章 / ${b.config.end} · ${b.phase}`);ph.className='phase';card.append(ph);
    const a=node('a','打开小说仓库');a.href=`https://github.com/${b.config.repo}`;a.target='_blank';a.rel='noreferrer';card.append(a);
    if(b.phase==='WAIT_SELECTION'){
      card.append(node('p','请选择本轮最终题材：'));
      const options=b.selection_source.jobs[0].result,sel=node('select');
      for(const c of options.candidates.filter(c=>options.eligible_ids.includes(c.id))){const o=node('option',c.id+' · '+c.title);o.value=c.id;sel.append(o);}
      card.append(sel);const choose=node('button','我选择这个题材');choose.onclick=()=>act(async()=>{await rpc('select',{book:b.config.id,candidate:sel.value});notice('你的最终选择已记录，将交给总监立项。');});card.append(choose);
      const report=node('a','阅读完整灵感裁判报告');report.href=`https://github.com/${b.config.repo}/blob/${b.selection_source.jobs[0].commit}/${options.review_path.split('/').map(encodeURIComponent).join('/')}`;report.target='_blank';card.append(report);
    }
    if(b.held){const err=node('p',b.held);err.className='error';card.append(err);const retry=node('button','已处理，重新核验');retry.className='secondary';retry.onclick=()=>act(async()=>{await rpc('recheck',{book:b.config.id});await rpc('tick');});card.append(retry);}
    else if(b.wait_reason)card.append(node('p',b.wait_reason));
    $('books').append(card);
  }
  $('jobs').replaceChildren();
  for(const j of Object.values(s?.jobs||{})){
    const tr=node('tr');tr.append(node('td',j.book_id+' / '+ROLES[j.role]),node('td',j.status),node('td',j.slot?'占用':'已释放'));const td=node('td',j.wait_reason||j.id);
    if(j.status==='UNCERTAIN'){const retry=node('button','核对后重试未发送任务');retry.onclick=()=>act(async()=>{const confirm=prompt('仅当已查看原对话完整历史且确认该任务未发送，输入：我已核对历史，此任务没有发送');if(confirm)await rpc('retry_unsent',{job:j.id,confirm});});td.append(retry);}tr.append(td);$('jobs').append(tr);
  }
  $('events').replaceChildren();for(const e of [...(s?.events||[])].reverse())$('events').append(node('li',new Date(e.at).toLocaleString()+' '+e.text));
}
refresh().catch(e=>notice(e.message));setInterval(()=>refresh().catch(()=>{}),5000);

$('importConfig').onchange=()=>act(async()=>{
 const f=$('importConfig').files[0];if(!f)return;if(f.size>8*1024*1024)throw new Error('导入文件超过8MB');
 const c=importMatchingBytes(new Uint8Array(await f.arrayBuffer()),f.name);
 const map={id:'bookId',academy_repo:'academyRepo',academy_branch:'academyBranch'};
 for(const [k,v] of Object.entries(c))$(map[k]||k).value=v;
 for(const r of Object.keys(ROLES))$('chat-'+r).value='';
 notice('项目参数已导入，十角色绑定已清空。请检查小说仓库、学堂与分支；本操作尚未写入GitHub或登记小说。');
 $('importConfig').value='';
});
$('checkAcademy').onclick=()=>act(async()=>{const r=await rpc('check_academy',{config:config()});notice(`学堂与平台入口可读。学堂固定提交：${r.commit}。正式创作仍须按角色规则核对资料和有效期。`);});
