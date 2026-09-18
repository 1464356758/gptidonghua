#!/usr/bin/env python3
"""Render the versioned Chinese manual to a single offline HTML."""
from pathlib import Path
import html,re
R=Path(__file__).resolve().parents[1]
def inline(s):
    s=html.escape(s)
    s=re.sub(r'https://[^\s&lt;&gt;]+',lambda m:'<a href="'+m.group()+'">'+m.group()+'</a>',s)
    return s
lines=(R/'docs/06_整合系统说明书与操作教程.md').read_text('utf-8').splitlines();out=[];i=0
while i<len(lines):
    line=lines[i].strip()
    if not line:i+=1;continue
    if line.startswith('|'):
        rows=[]
        while i<len(lines) and lines[i].strip().startswith('|'):
            cells=[c.strip() for c in lines[i].strip().strip('|').split('|')]
            if not all(re.fullmatch(r'[:\- ]+',c) for c in cells):rows.append(cells)
            i+=1
        out.append('<div class="tablewrap"><table>'+''.join('<tr>'+''.join(('<th>' if j==0 else '<td>')+inline(c)+('</th>' if j==0 else '</td>') for c in row)+'</tr>' for j,row in enumerate(rows))+'</table></div>');continue
    if line.startswith('## '):out.append('<h2>'+inline(line[3:])+'</h2>')
    elif line.startswith('# '):out.append('<h1>'+inline(line[2:])+'</h1>')
    elif line.startswith('> '):out.append('<blockquote>'+inline(line[2:])+'</blockquote>')
    elif line.startswith('- '):out.append('<p class="item">• '+inline(line[2:])+'</p>')
    else:out.append('<p>'+inline(line)+'</p>')
    i+=1
style='''body{font:16px/1.85 system-ui,"Microsoft YaHei",sans-serif;color:#183b35;background:#f3f5ee;margin:0}main{max-width:840px;margin:auto;padding:24px;background:white}h1{font-size:30px;line-height:1.35;margin:8px 0}h2{font-size:22px;border-top:1px solid #d8e2d9;padding-top:26px;margin-top:32px}p{margin:12px 0;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;font-size:14px}td,th{border:1px solid #d8e2d9;padding:10px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#e6ede4}a{color:#16654e;overflow-wrap:anywhere}.tablewrap{overflow:auto}blockquote{margin:16px 0;border-left:3px solid #bd8f3a;padding:12px;background:#f8f5e9}.item{margin:6px 0}.tag{font-size:12px;color:#63796f}@media print{body{background:white}main{max-width:none}h2{break-after:avoid}tr{break-inside:avoid}}'''
page='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>整合系统说明书与操作教程</title><style>'+style+'</style></head><body><main><p class="tag">使用指南 / RC2</p><a href="手机匹配文件生成器.html">返回匹配生成器</a>'+''.join(out)+'</main></body></html>'
p=R/'portable/整合系统说明书与操作教程.html';p.write_text(page,'utf-8');print(p)
