// Synthetic local DOM only. This does NOT log into or test a real ChatGPT account.
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import http from 'node:http';
const root=path.resolve('.');await fs.mkdir('test-results',{recursive:true});
const browser=await chromium.launch({headless:true});
let checks=0;
try{
 const page=await browser.newPage();
 await page.setContent('<div id="prompt-textarea" contenteditable="true"></div><button data-testid="send-button">Send</button>');
 await page.evaluate(()=>{
   window.chrome={runtime:{id:'fixture',onMessage:{addListener:f=>window.receiver=f}}};
   document.querySelector('button').onclick=()=>{
     const e=document.querySelector('#prompt-textarea'),msg=document.createElement('div');msg.dataset.messageAuthorRole='user';msg.textContent=e.textContent;document.body.append(msg);e.textContent='';const stop=document.createElement('button');stop.dataset.testid='stop-button';document.body.append(stop);
   };
 });
 await page.addScriptTag({path:'extension/content.js'});
 const call=m=>page.evaluate(m=>new Promise(resolve=>window.receiver(m,{id:'fixture'},resolve)),m);
 assert.equal((await call({type:'relay.probe'})).status,'IDLE');checks++;
 assert.equal((await call({type:'relay.send',id:'t1',prompt:'【小说自动接力｜t1】\n测试任务'})).status,'SENT');checks++;
 assert.equal((await call({type:'relay.probe',id:'t1'})).status,'BUSY');checks++;
 assert.equal((await call({type:'relay.send',id:'t1',prompt:'【小说自动接力｜t1】\n测试任务'})).status,'ALREADY_SENT');checks++;
 await page.locator('[data-testid="stop-button"]').evaluate(e=>e.remove());
 await page.locator('#prompt-textarea').fill('用户未发草稿');assert.equal((await call({type:'relay.send',id:'t2',prompt:'【小说自动接力｜t2】'})).status,'COMPOSER_DIRTY');checks++;
 await page.evaluate(()=>{const a=document.createElement('div');a.role='alert';a.textContent='You have reached the message limit';document.body.append(a);});assert.equal((await call({type:'relay.probe'})).status,'LIMIT');checks++;
 const server=http.createServer(async(req,res)=>{
   const p=path.join(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!p.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
   try{const data=await fs.readFile(p);res.setHeader('Content-Type',p.endsWith('.js')||p.endsWith('.mjs')?'text/javascript':p.endsWith('.css')?'text/css':'text/html; charset=utf-8');res.end(data);}catch{res.writeHead(404);res.end();}
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
 try{
   const dash=await browser.newPage({viewport:{width:1440,height:1050}});
   const errors=[];dash.on('pageerror',e=>errors.push(e.message));
   await dash.addInitScript(()=>{window.chrome={runtime:{sendMessage:async()=>({ok:true,value:{hasToken:false,lastState:{paused:true,pause_reason:'尚未启动',books:[],jobs:{},events:[]}}})}};});
   await dash.goto(origin+'/extension/dashboard.html');await dash.locator('summary').filter({hasText:'②'}).click();await dash.waitForSelector('#chatFields input');assert.equal(await dash.locator('#chatFields input').count(),10);assert.deepEqual(errors,[]);checks++;
   await dash.screenshot({path:'test-results/dashboard.png',fullPage:true});
   const mobile=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});await mobile.goto(origin+'/portable/手机匹配文件生成器.html');
   await mobile.locator('#repo').fill('https://github.com/example/novel');const download=mobile.waitForEvent('download');await mobile.locator('#generate').click();const f=await download;await f.saveAs('test-results/browser-generated.zip');assert((await fs.stat('test-results/browser-generated.zip')).size>10000);checks++;
   await mobile.screenshot({path:'test-results/mobile-generator.png',fullPage:true});
 }finally{await new Promise(r=>server.close(r));}
 console.log(`Browser fixture checks passed: ${checks}; no live ChatGPT account tested.`);
}finally{await browser.close();}
