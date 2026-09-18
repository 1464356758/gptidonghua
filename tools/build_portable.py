#!/usr/bin/env python3
"""Build a self-contained mobile/desktop matching-file generator (no server)."""
import json,re
from pathlib import Path
R=Path(__file__).resolve().parents[1]
parts=[]
for name in ['protocol.mjs','generator.mjs','zip.mjs']:
    source=(R/'extension/core'/name).read_text('utf-8')
    source=re.sub(r'^import .*?;\n','',source,flags=re.M)
    parts.append(re.sub(r'\bexport (?=(?:async )?function|const|class)','',source))
base=json.loads((R/'extension/assets/base-template.json').read_text('utf-8'))
protocol=(R/'extension/assets/auto-protocol.md').read_text('utf-8')
payload='\nconst portableBase='+json.dumps(base,ensure_ascii=False).replace('<','\\u003c')+';\nconst portableProtocol='+json.dumps(protocol,ensure_ascii=False).replace('<','\\u003c')+';\n'
ui=r'''
const $=id=>document.getElementById(id);
async function makeFile(){
 const c={id:$('id').value.trim(),title:$('title').value.trim(),repo:$('repo').value.trim(),branch:$('branch').value.trim(),platform:$('platform').value,start:+$('start').value,end:+$('end').value,min:+$('min').value,max:+$('max').value,keywords:$('keywords').value.trim()};
 const files=await generate(portableBase,c,portableProtocol);
 return new File([zip(files)],c.id+'_小说匹配文件_AUTO_RC1.zip',{type:'application/zip'});
}
function download(file){const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),20000);}
async function run(share){
 $('message').textContent='正在生成并核对文件哈希…';
 try{if(!globalThis.crypto?.subtle)throw new Error('当前文件预览器不支持安全计算，请用Chrome/Edge浏览器打开，或使用电脑扩展中的生成器。');const f=await makeFile();if(share&&navigator.canShare?.({files:[f]}))await navigator.share({files:[f]});else download(f);$('message').textContent='已生成自动化匹配ZIP。学院已设为1464356758/xueyuan。';}
 catch(e){$('message').textContent=e.message;}
}
$('generate').onclick=()=>run(false);$('share').onclick=()=>run(true);
'''
html='''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>小说匹配文件生成器 AUTO RC1</title><style>
body{font:16px/1.65 system-ui,"Microsoft YaHei",sans-serif;color:#173c32;background:#f1f5f0;margin:0}main{max-width:700px;margin:24px auto;padding:24px;background:white;border-radius:16px}h1{font-size:25px;margin:0}.tag{font-size:12px;background:#e7eee7;border-radius:20px;padding:4px 12px;display:inline-block}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:24px 0}label{display:flex;flex-direction:column;gap:5px;font-size:14px}.wide{grid-column:1/-1}input,select,textarea{font:inherit;width:100%;box-sizing:border-box;border:1px solid #bdccbf;border-radius:6px;padding:10px;color:#193c32}button{font:inherit;background:#17664e;color:white;border:0;border-radius:8px;padding:12px 20px;margin:8px 8px 8px 0;cursor:pointer}.secondary{background:#e9f0e9;color:#17664e}small{color:#637669}#message{padding:12px;background:#fff9e8;overflow-wrap:anywhere}footer{margin-top:20px;font-size:13px;color:#708075}@media(max-width:600px){main{margin:0;padding:20px;border-radius:0}.grid{gap:12px}h1{font-size:22px}}
</style></head><body><main><span class="tag">离线生成 · AUTO RC1</span><h1>小说匹配文件生成器</h1><small>按你的项目生成完整ZIP；接力执行在电脑扩展中进行。</small><div class="grid">
<label>书号<input id="id" value="book01"></label><label>项目名<input id="title" value="第一部小说"></label>
<label class="wide">1. 小说平台<select id="platform"><option>番茄小说</option><option>七猫小说</option><option>起点中文网</option><option>豆瓣阅读</option></select></label>
<label class="wide">2. GitHub小说仓库根链接<input id="repo" placeholder="https://github.com/你的用户名/小说仓库"></label>
<label class="wide">3. 分支<input id="branch" value="main"></label>
<label>4. 起始章<input id="start" type="number" value="1" min="1"></label><label>5. 最后章<input id="end" type="number" value="100" min="1"></label>
<label>6. 最少字数<input id="min" type="number" value="8000" min="1"></label><label>7. 最多字数<input id="max" type="number" value="10000" min="1"></label>
<label class="wide">灵感关键词（可选）<textarea id="keywords" rows="2"></textarea></label></div>
<button id="generate">8. 生成压缩包</button><button id="share" class="secondary">9. 分享压缩包</button><p id="message">无需联网。新学院：1464356758/xueyuan。</p>
<footer>原Android APK保持原样。本文件是自动化派生版HTML生成器，不能作为原APK升级安装；如果系统文件预览器不运行脚本，请用浏览器打开。</footer></main><script>'''+ '\n'.join(parts)+payload+ui+'</script></body></html>'
out=R/'portable/手机匹配文件生成器.html';out.parent.mkdir(exist_ok=True);out.write_text(html,'utf-8')
print(out)
