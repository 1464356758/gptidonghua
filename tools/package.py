#!/usr/bin/env python3
"""Create deterministic ZIP plus hashes. No credentials, caches or .git data."""
from pathlib import Path
import hashlib,json,zipfile,subprocess
R=Path(__file__).resolve().parents[1]
subprocess.run(['python3',str(R/'tools/build_portable.py')],check=True)
out=R/'dist';out.mkdir(exist_ok=True)
items=[]
for root in ['extension','portable','docs','tests','tools']:
    items.extend(p for p in (R/root).rglob('*') if p.is_file() and '__pycache__' not in p.parts)
items += [R/'README.md',R/'package.json']
manifest={'version':'AUTO-0.1.0-RC1','release_status':'RELEASE_CANDIDATE','files':[]}
for p in sorted(items):manifest['files'].append({'path':p.relative_to(R).as_posix(),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
name='小说自动接力系统_AUTO_RC1_完整交付包.zip'
with zipfile.ZipFile(out/name,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for p in sorted(items):
        info=zipfile.ZipInfo(p.relative_to(R).as_posix(),date_time=(2026,9,18,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16;z.writestr(info,p.read_bytes())
    info=zipfile.ZipInfo('交付清单.json',date_time=(2026,9,18,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16
    z.writestr(info,json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
with zipfile.ZipFile(out/name) as z:assert z.testzip() is None
digest=hashlib.sha256((out/name).read_bytes()).hexdigest()
(out/'SHA256.txt').write_text(digest+'  '+name+'\n','utf-8')
print(json.dumps({'zip':str(out/name),'bytes':(out/name).stat().st_size,'sha256':digest,'files':len(items)+1},ensure_ascii=False))
