#!/usr/bin/env python3
"""Package source, or a complete delivery including the locally signed APK and PDF."""
from pathlib import Path
import hashlib,json,zipfile,subprocess,argparse
R=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--full',action='store_true');args=parser.parse_args()
for script in ['build_portable.py','build_manual_html.py']:subprocess.run(['python3',str(R/'tools'/script)],check=True)
out=R/'dist';out.mkdir(exist_ok=True)
items={}
for root in ['extension','portable','docs','tests','tools','android','.github/workflows']:
 for p in (R/root).rglob('*'):
  if p.is_file() and '__pycache__' not in p.parts:items[p.relative_to(R).as_posix()]=p
for name in ['README.md','package.json']:items[name]=R/name
manifest={'version':'AUTO-0.2.0-RC2','android_version':'1.0.0-RC2','release_status':'RELEASE_CANDIDATE','includes_signed_apk':args.full,'files':[]}
name='小说自动接力系统_AUTO_RC2_源码与教程.zip'
if args.full:
 name='小说匹配生成器与自动接力系统_RC2_完整交付包.zip'
 extras={'安卓APP/小说匹配生成器_Android_1.0.0_RC2.apk':out/'小说匹配生成器_Android_1.0.0_RC2.apk','说明书/小说自动接力系统_整合说明书与操作教程_RC2.pdf':R/'output/pdf/小说自动接力系统_整合说明书与操作教程_RC2.pdf','00_从这里开始.txt':R/'delivery/00_从这里开始.txt'}
 for dest,p in extras.items():
  if not p.is_file():raise SystemExit('Missing full-delivery file: '+str(p))
  items[dest]=p
for path,p in sorted(items.items()):manifest['files'].append({'path':path,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
with zipfile.ZipFile(out/name,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for path,p in sorted(items.items()):
  info=zipfile.ZipInfo(path,date_time=(2026,9,18,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16;z.writestr(info,p.read_bytes())
 info=zipfile.ZipInfo('交付清单.json',date_time=(2026,9,18,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16;z.writestr(info,json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
with zipfile.ZipFile(out/name) as z:
 assert z.testzip() is None
 for row in manifest['files']:assert hashlib.sha256(z.read(row['path'])).hexdigest()==row['sha256']
digest=hashlib.sha256((out/name).read_bytes()).hexdigest();(out/'SHA256_RC2.txt').write_text(digest+'  '+name+'\n','utf-8')
print(json.dumps({'zip':str(out/name),'bytes':(out/name).stat().st_size,'sha256':digest,'files':len(items)+1},ensure_ascii=False))
