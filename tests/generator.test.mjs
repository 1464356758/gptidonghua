import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {generate} from '../extension/core/generator.mjs';
import {zip} from '../extension/core/zip.mjs';
import {sha256} from '../extension/core/protocol.mjs';
const base=JSON.parse(await fs.readFile(new URL('../extension/assets/base-template.json',import.meta.url),'utf8'));
const protocol=await fs.readFile(new URL('../extension/assets/auto-protocol.md',import.meta.url),'utf8');
for(const platform of ['番茄小说','七猫小说','起点中文网','豆瓣阅读'])test(`${platform}重新匹配repo/分支/范围/学院且所有hash一致`,async()=>{
  const files=await generate(base,{id:'book1',title:'测试',repo:'new-owner/new-book',branch:'feature/test',platform,start:11,end:88,min:7000,max:9000},protocol);
  const db=JSON.parse(files['数据库入口.json']);assert.equal(db.repo_url,'https://github.com/new-owner/new-book');assert.equal(db.branch,'feature/test');assert.equal(db.platform,platform);assert.deepEqual(db.chapter_range,{start:11,end:88});assert.equal(db.academy_repo,'https://github.com/1464356758/xueyuan');
  const manifest=JSON.parse(files['生成清单.json']);assert.equal(Object.keys(files).length,manifest.total_files_in_zip);
  for(const f of manifest.files)assert.equal(await sha256(files[f.path]),f.sha256,f.path);
  const t=JSON.parse(files['模板/TASK.example.json']);assert.equal(t.chapter,11);assert.equal(t.body_word_range.min,7000);
  for(const [path,text] of Object.entries(files)){
    assert(!text.includes('qq1464356758-del/'),path);if(path.startsWith('角色指令/')){assert(text.includes('分支：feature/test'));assert(text.includes(`目标平台：${platform}`));assert(!text.includes('03_六平台评分'));assert(!text.includes('自动选题决策器/'));}
  }
  const a=zip(files);assert.equal(new DataView(a.buffer).getUint32(0,true),0x04034b50);
});
test('生成派生包不冒用原APP最终锁定声明',async()=>{const files=await generate(base,{id:'b',title:'测试',repo:'o/r',branch:'main',platform:'番茄小说',start:1,end:2,min:1,max:9},protocol);assert(!files['系统锁定/SYSTEM-LOCK-V4.3-FINAL.json']);assert.equal(JSON.parse(files['生成清单.json']).release,'RC1');});
test('无效平台、倒置范围在生成前拒绝',async()=>{const c={id:'b',title:'t',repo:'o/r',branch:'main',platform:'自动全平台',start:10,end:2,min:3,max:2};await assert.rejects(generate(base,c,protocol));});
