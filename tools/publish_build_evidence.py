#!/usr/bin/env python3
"""Publish non-secret build outputs on an isolated, unique evidence branch."""
from pathlib import Path
import subprocess,os,json,hashlib,base64
R=Path(__file__).resolve().parents[1]
files={}
for name in ['unsigned.apk','apksigner.jar','manual-font.ttf','font-license.txt']:
 p=R/'build/android'/name
 if p.exists():files[name]=p
for directory in ['build/android-evidence','test-results']:
 for p in (R/directory).glob('*'):
  if p.is_file() and p.suffix in ['.png','.zip','.txt']:files[p.name]=p
assert 'unsigned.apk' in files and 'apksigner.jar' in files
raw=files['apksigner.jar'].read_bytes()
for index,start in enumerate(range(0,len(raw),512000)):
 p=R/'build/android'/f'apksigner.part{index+1:02d}.b64';p.write_text(base64.b64encode(raw[start:start+512000]).decode());files[p.name]=p
manifest={'source_commit':os.environ['GITHUB_SHA'],'files':[]}
lines=[]
for name,p in sorted(files.items()):
 blob=subprocess.check_output(['git','hash-object','-w',str(p)],cwd=R,text=True).strip();lines.append(f'100644 blob {blob}\t{name}\n');manifest['files'].append({'path':name,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'blob':blob})
b=json.dumps(manifest,ensure_ascii=False,indent=2).encode();sha=subprocess.check_output(['git','hash-object','-w','--stdin'],cwd=R,input=b).decode().strip();lines.append(f'100644 blob {sha}\tmanifest.json\n')
tree=subprocess.check_output(['git','mktree'],cwd=R,input=''.join(lines).encode()).decode().strip()
env={**os.environ,'GIT_AUTHOR_NAME':'github-actions[bot]','GIT_AUTHOR_EMAIL':'41898282+github-actions[bot]@users.noreply.github.com','GIT_COMMITTER_NAME':'github-actions[bot]','GIT_COMMITTER_EMAIL':'41898282+github-actions[bot]@users.noreply.github.com'}
commit=subprocess.check_output(['git','commit-tree',tree,'-m','RC2 unsigned Android build and verification evidence'],cwd=R,env=env).decode().strip()
branch='builds/rc2-'+os.environ['GITHUB_RUN_ID']
subprocess.run(['git','push','origin',f'{commit}:refs/heads/{branch}'],cwd=R,check=True)
print('Evidence branch:',branch)
