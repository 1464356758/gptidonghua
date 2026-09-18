#!/usr/bin/env python3
"""Bundle the shared generator for both Android assets and an offline HTML file."""
import json,re
from pathlib import Path
R=Path(__file__).resolve().parents[1]
parts=[]
for name in ['protocol.mjs','zip.mjs','matching.mjs','generator.mjs']:
    source=(R/'extension/core'/name).read_text('utf-8')
    source=re.sub(r'^import .*?;\n','',source,flags=re.M)
    parts.append(re.sub(r'\bexport (?=(?:async )?function|const|class)','',source))
base=json.loads((R/'extension/assets/base-template.json').read_text('utf-8'))
protocol=(R/'extension/assets/auto-protocol.md').read_text('utf-8')
payload='\nconst portableBase='+json.dumps(base,ensure_ascii=False).replace('<','\\u003c')+';\nconst portableProtocol='+json.dumps(protocol,ensure_ascii=False).replace('<','\\u003c')+';\n'
script='\n'.join(parts)+payload+(R/'portable/generator-ui.js').read_text('utf-8')
assert '</script' not in script.lower()
html=(R/'portable/generator.template.html').read_text('utf-8').replace('__BUNDLE__',script)
out=R/'portable/手机匹配文件生成器.html';out.write_text(html,'utf-8');print(out)
