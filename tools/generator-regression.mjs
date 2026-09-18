import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {generate} from '../extension/core/generator.mjs';
import {zip} from '../extension/core/zip.mjs';
const base=JSON.parse(await fs.readFile(new URL('../extension/assets/base-template.json',import.meta.url),'utf8'));
const protocol=await fs.readFile(new URL('../extension/assets/auto-protocol.md',import.meta.url),'utf8');
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'novel-regression-'));
try{
  for(const [i,platform] of ['番茄小说','七猫小说','起点中文网','豆瓣阅读'].entries()){
    const root=path.join(dir,'case'+i);await fs.mkdir(root);
    const files=await generate(base,{id:`book${i}`,title:'回归样本',repo:`sample/book${i}`,branch:i?'feature/test':'main',platform,academy_repo:'mirror-owner/rules',academy_branch:'rules/stable',start:i?11:1,end:i?88:100,min:i?7000:8000,max:i?9000:10000},protocol);
    for(const [p,t] of Object.entries(files)){await fs.mkdir(path.dirname(path.join(root,p)),{recursive:true});await fs.writeFile(path.join(root,p),t);}
    await fs.writeFile(path.join(root,'generated.zip'),zip(files));
    for(const script of ['validate.py','validate_contracts.py','validate_scoreboard.py','validate_stage.py','validate_stage_strict.py']){
      const out=execFileSync('python3',[path.join(root,'工具',script)],{encoding:'utf8'});console.log(platform,script,out.trim());
    }
    execFileSync('python3',['-c','import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; assert len(z.namelist())==int(sys.argv[2])',path.join(root,'generated.zip'),String(Object.keys(files).length)]);
  }
}finally{await fs.rm(dir,{recursive:true,force:true});}
