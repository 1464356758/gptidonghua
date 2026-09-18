import {assert,encode,repoName,safePath,isSHA,CI_NAMES} from './protocol.mjs';
export class GitHubError extends Error { constructor(message,status=0,retryAt=0){super(message);this.status=status;this.retryAt=retryAt;} }
const seg = s => s.split('/').map(encodeURIComponent).join('/');
export class GitHub {
  constructor(token,fetcher=fetch){assert(token,'请在控制台填写 GitHub 令牌');this.token=token;this.fetcher=fetcher;this.cache=new Map();}
  async request(path, method='GET', body) {
    const r=await this.fetcher(`https://api.github.com${path}`,{method,headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${this.token}`,'X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(20000)});
    if(!r.ok) {
      const wait = Math.max(Number(r.headers.get('retry-after')||0)*1000+Date.now(),Number(r.headers.get('x-ratelimit-reset')||0)*1000);
      // 不把服务端原文（可能含仓库数据）或令牌写日志。
      throw new GitHubError(`GitHub ${r.status}：${r.status===404?'文件或仓库不可读':r.status===401?'令牌失效':r.status===403?'权限不足或达到请求限制':r.status===409||r.status===422?'写入冲突，未覆盖远端':'请求失败'}`,r.status,[403,429].includes(r.status)?wait:0);
    }
    return r.status===204?null:await r.json();
  }
  root(repo){return `/repos/${repoName(repo)}`;}
  async head(repo,branch){return (await this.request(`${this.root(repo)}/git/ref/heads/${seg(branch)}`)).object.sha;}
  async read(repo,path,ref,optional=false) {
    safePath(path);const key=`${repo}:${ref}:${path}`;
    if(isSHA(ref)&&this.cache.has(key))return this.cache.get(key);
    try {
      const r=await this.request(`${this.root(repo)}/contents/${seg(path)}?ref=${encodeURIComponent(ref)}`);
      assert(r.type==='file' && r.encoding==='base64' && typeof r.content==='string','文件过大或不是 UTF-8 文本');
      const bytes=Uint8Array.from(atob(r.content.replace(/\s/g,'')),x=>x.charCodeAt(0));
      assert(bytes.length<=2000000,'单个协议文件超过2MB');
      const v={text:new TextDecoder('utf-8',{fatal:true}).decode(bytes),sha:r.sha};
      if(isSHA(ref))this.cache.set(key,v);return v;
    }catch(e){if(optional && e.status===404)return null;throw e;}
  }
  async json(repo,path,ref,optional=false) {const r=await this.read(repo,path,ref,optional);return r?{...r,value:JSON.parse(r.text)}:null;}
  async write(repo,branch,path,text,sha=null) {
    const bytes=new TextEncoder().encode(text);let raw='';for(const b of bytes)raw+=String.fromCharCode(b);
    return await this.request(`${this.root(repo)}/contents/${seg(safePath(path))}`,'PUT',{message:`relay: ${path}`,content:btoa(raw),branch,...(sha?{sha}:{})});
  }
  async atomic(repo,branch,files,expectedHead,createOnly=true) {
    assert(Object.keys(files).length>0,'提交不能为空');
    const head=await this.head(repo,branch);assert(head===expectedHead,'仓库已改变，请重新同步后再提交');
    if(createOnly) {
      const tree=await this.request(`${this.root(repo)}/git/trees/${head}?recursive=1`);
      assert(!tree.truncated,'仓库树被截断，不能证明路径未存在');
      const paths=new Set(tree.tree.map(x=>x.path));
      for(const p of Object.keys(files))assert(!paths.has(p),`路径已存在，禁止覆盖：${p}`);
    }
    const c=await this.request(`${this.root(repo)}/git/commits/${head}`);
    const t=await this.request(`${this.root(repo)}/git/trees`,'POST',{base_tree:c.tree.sha,tree:Object.entries(files).map(([path,content])=>({path:safePath(path),mode:'100644',type:'blob',content}))});
    const commit=await this.request(`${this.root(repo)}/git/commits`,'POST',{message:`relay: atomic ${Object.keys(files).length} files`,tree:t.sha,parents:[head]});
    // force=false：其他写手先提交时本分支移动会被拒绝。不得强推。
    await this.request(`${this.root(repo)}/git/refs/heads/${seg(branch)}`,'PATCH',{sha:commit.sha,force:false});
    return commit.sha;
  }
  async ancestor(repo,base,head) {
    assert(isSHA(base)&&isSHA(head),'需要固定提交SHA');if(base===head)return true;
    const r=await this.request(`${this.root(repo)}/compare/${base}...${head}`);
    return ['ahead','identical'].includes(r.status)&&r.merge_base_commit?.sha===base;
  }
  async ci(repo,ref) {
    const r=await this.request(`${this.root(repo)}/actions/runs?head_sha=${ref}&event=push&per_page=100`);
    assert(r.total_count<=100,'同提交CI记录过多，需要人工核对');
    const results=CI_NAMES.map(name=>{
      const runs=r.workflow_runs.filter(x=>x.name===name&&x.head_sha===ref).sort((a,b)=>b.id-a.id);
      const x=runs[0];return {name,status:x?.status||'missing',conclusion:x?.conclusion||null,url:x?.html_url};
    });
    return {ok:results.every(x=>x.status==='completed'&&x.conclusion==='success'),pending:results.some(x=>x.status!=='completed'),results};
  }
}
