(() => {
  if(window.__novelRelayInstalled)return;window.__novelRelayInstalled=true;
  const one=s=>document.querySelector(s);
  const editor=()=>one('#prompt-textarea, textarea[data-id="root"]');
  const stop=()=>one('[data-testid="stop-button"], button[aria-label="Stop streaming"], button[aria-label="停止生成"]');
  const send=()=>one('[data-testid="send-button"], button[aria-label="Send prompt"], button[aria-label="发送提示"]');
  const value=e=>e?.value??e?.textContent??'';
  const hasJob=id=>!!id&&[...document.querySelectorAll('[data-message-author-role="user"]')].some(x=>x.textContent.includes(`【小说自动接力｜${id}】`));
  function probe(id){
    // 仅观察操作控件、系统提示和自己发送的任务号；不采集assistant正文。
    const alerts=[...document.querySelectorAll('[role="dialog"], [role="alert"]')].map(x=>x.textContent||'').join('\n');
    const known=hasJob(id);
    if(/usage limit|message limit|reached.{0,30}limit|达到.{0,12}上限|使用限额|消息上限|too many requests/i.test(alerts))return {status:'LIMIT',hasJob:known};
    if(one('iframe[src*="challenges.cloudflare.com"], input[name="cf-turnstile-response"]'))return {status:'CHALLENGE',hasJob:known};
    if(stop())return {status:'BUSY',hasJob:known};
    const e=editor();if(!e)return {status:one('[data-testid="login-button"]')?'LOGIN':'UNKNOWN',hasJob:known};
    if(e.disabled||e.getAttribute('aria-disabled')==='true')return {status:'UNKNOWN',hasJob:known};
    return {status:value(e).trim()?'COMPOSER_DIRTY':'IDLE',hasJob:known};
  }
  chrome.runtime.onMessage.addListener((m,sender,respond)=>{
    if(sender.id!==chrome.runtime.id)return;
    if(m.type==='relay.probe'){respond(probe(m.id));return;}
    if(m.type!=='relay.send')return;
    (async()=>{
      const initial=probe(m.id);
      if(initial.hasJob)return {status:'ALREADY_SENT'};
      if(initial.status!=='IDLE')return {status:initial.status};
      if(typeof m.prompt!=='string'||m.prompt.length>30000||!m.prompt.startsWith(`【小说自动接力｜${m.id}】`))return {status:'INVALID'};
      const e=editor();e.focus();
      if(e.tagName==='TEXTAREA'){
        const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;setter.call(e,m.prompt);
      }else{
        const selection=getSelection(),range=document.createRange();range.selectNodeContents(e);selection.removeAllRanges();selection.addRange(range);
        if(!document.execCommand('insertText',false,m.prompt)){e.textContent=m.prompt;}
      }
      e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:m.prompt}));
      await new Promise(r=>setTimeout(r,350));
      const button=send();
      if(!button||button.disabled||button.getAttribute('aria-disabled')==='true')return {status:'PREPARED_NOT_SENT'};
      button.click();
      await new Promise(r=>setTimeout(r,800));
      const p=probe(m.id);return {status:p.hasJob?'SENT':'UNCERTAIN',view:p.status};
    })().then(respond).catch(()=>respond({status:'UNCERTAIN'}));
    return true;
  });
})();
