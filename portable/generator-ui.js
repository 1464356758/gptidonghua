const $=id=>document.getElementById(id);
const formKeys=['id','title','platform','repo','branch','academy_repo','academy_branch','start','end','min','max','keywords'];
let currentSlot=0,busy=false;
function defaults(slot){return {id:`book0${slot+1}`,title:['第一部小说','第二部小说','第三部小说'][slot],platform:'番茄小说',repo:'',branch:'main',academy_repo:`https://github.com/${ACADEMY}`,academy_branch:'main',start:1,end:100,min:8000,max:10000,keywords:''};}
function form(){const c=Object.fromEntries(formKeys.map(k=>[k,$(k).value.trim()]));for(const k of ['start','end','min','max'])c[k]=Number(c[k]);return c;}
function draft(){try{localStorage.setItem('novel-relay-draft-'+currentSlot,JSON.stringify(form()));}catch{}}
function showSlot(slot){currentSlot=slot;let c=defaults(slot);try{const saved=JSON.parse(localStorage.getItem('novel-relay-draft-'+slot)||'null');if(saved&&typeof saved==='object')for(const k of formKeys)if(['string','number'].includes(typeof saved[k]))c[k]=saved[k];}catch{}for(const k of formKeys)$(k).value=c[k];document.querySelectorAll('[data-slot]').forEach(b=>b.setAttribute('aria-selected',String(+b.dataset.slot===slot)));}
for(const k of formKeys)$(k).addEventListener('input',draft);
document.querySelectorAll('[data-slot]').forEach(b=>b.onclick=()=>{if(busy)return;draft();showSlot(+b.dataset.slot);$('message').textContent='已切换本机配置草稿；不会修改GitHub中的小说。';});
function setBusy(on){busy=on;document.querySelectorAll('button').forEach(b=>b.disabled=on);}
function download(file){const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=file.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),20000);}
function bytesBase64(bytes){let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(binary);}
window.nativeFeedback=message=>{$('message').textContent=message;setBusy(false);};
async function run(share){
 setBusy(true);$('message').textContent='正在生成完整匹配包并核对文件哈希…';draft();
 try{
  if(!globalThis.crypto?.subtle)throw new Error('当前预览器不能进行安全计算。请使用安卓APP，或用Chrome/Edge打开离线版。');
  const c=validateBook(form(),false),files=await generate(portableBase,c,portableProtocol),bytes=zip(files),name=c.id+'_小说匹配文件_AUTO_RC2.zip';
  if(window.NativeRelay?.exportZip){window.NativeRelay.exportZip(name,bytesBase64(bytes),share?'share':'save');$('message').textContent=share?'请选择接收匹配包的应用。':'请选择 ZIP 的保存位置。';return;}
  const f=new File([bytes],name,{type:'application/zip'});
  if(share&&navigator.canShare?.({files:[f]})){await navigator.share({files:[f]});$('message').textContent='匹配包已交给系统分享。';}
  else{download(f);$('message').textContent='已发起 ZIP 下载。学堂配置：'+c.academy_repo+' / '+c.academy_branch+'。请在电脑控制台导入这个 ZIP。';}
 }catch(e){$('message').textContent=e.name==='AbortError'?'已取消分享，可以重新保存或分享。':e.message;}
 setBusy(false);
}
$('generate').onclick=()=>run(false);$('share').onclick=()=>run(true);
$('openAcademy').onclick=()=>{try{const repo=repoName($('academy_repo').value),branch=$('academy_branch').value.trim();const url='https://github.com/'+repo+(branch?'/tree/'+encodeURIComponent(branch):'');if(window.NativeRelay?.openGithub)window.NativeRelay.openGithub(url);else window.open(url,'_blank','noopener,noreferrer');}catch(e){$('message').textContent=e.message;}};
$('reset').onclick=()=>{if(!confirm('重置当前小说的本机表单？已经生成的文件与GitHub内容不会被修改。'))return;try{localStorage.removeItem('novel-relay-draft-'+currentSlot);}catch{}showSlot(currentSlot);};
if(window.NativeRelay)$('manual').href='https://appassets.androidplatform.net/assets/manual.html';
showSlot(0);
