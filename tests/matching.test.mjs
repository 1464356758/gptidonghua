import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {generate} from '../extension/core/generator.mjs';
import {zip,readStoredZipEntry} from '../extension/core/zip.mjs';
import {exportConfig,importConfig,importMatchingBytes} from '../extension/core/matching.mjs';
const base=JSON.parse(await fs.readFile(new URL('../extension/assets/base-template.json',import.meta.url),'utf8'));
const protocol=await fs.readFile(new URL('../extension/assets/auto-protocol.md',import.meta.url),'utf8');
const c={id:'book03',title:'迁移测试',repo:'new-owner/novel',branch:'novel/production',platform:'番茄小说',start:3,end:21,min:8000,max:10000,academy_repo:'https://github.com/new-academy/rules.git',academy_branch:'rules/2026',keywords:'城市 悬疑'};
for(const platform of ['番茄小说','七猫小说','起点中文网','豆瓣阅读'])test(`${platform}自定义学堂与独立分支贯穿全部匹配文件`,async()=>{
 const files=await generate(base,{...c,platform},protocol),db=JSON.parse(files['数据库入口.json']);
 assert.equal(db.academy_repo,'https://github.com/new-academy/rules');assert.equal(db.academy_branch,'rules/2026');assert.equal(db.branch,'novel/production');
 for(const [path,text]of Object.entries(files)){assert(!text.includes('1464356758/xueyuan'),path);if(path.startsWith('角色指令/')){assert(text.includes('学堂分支：rules/2026'),path);assert(text.includes('分支：novel/production'),path);}}
 const imported=importMatchingBytes(zip(files),'phone.zip');assert.equal(imported.academy_repo,'new-academy/rules');assert.equal(imported.academy_branch,'rules/2026');assert.equal(imported.platform,platform);assert.equal(imported.start,3);
});
test('导入匹配包只保留参数，不导入令牌/对话/状态',()=>{const data=exportConfig({...c,token:'secret',chats:{a:'url'},state:{}});data.config.token='secret';data.config.chats={a:'url'};const imported=importConfig(data);assert(!('token'in imported));assert(!('chats'in imported));assert(!('state'in imported));});
test('旧配置缺省学堂仍兼容，新配置不允许空地址或无效分支',()=>{const {academy_repo,academy_branch,...old}=c;assert.equal(exportConfig(old).config.academy_repo,'1464356758/xueyuan');for(const change of [{academy_repo:''},{academy_repo:c.repo},{academy_branch:''},{academy_branch:'../bad'},{academy_repo:'https://evil.example/a/b'},{keywords:{}}])assert.throws(()=>exportConfig({...c,...change}));});
test('损坏、重复入口和缺失配置的ZIP拒绝导入',()=>{const config=JSON.stringify(exportConfig(c));const bytes=zip({'自动化/控制台导入.json':config});const damaged=bytes.slice();const target=new TextEncoder().encode(config);const at=30+new TextEncoder().encode('自动化/控制台导入.json').length;damaged[at+target.length-1]^=1;assert.throws(()=>importMatchingBytes(damaged,'bad.zip'));assert.throws(()=>readStoredZipEntry(bytes.slice(0,-2),'自动化/控制台导入.json'));assert.throws(()=>importMatchingBytes(zip({'other.json':config}),'other.zip'));});
test('错误JSON schema或超大配置不会改变项目',()=>{assert.throws(()=>importConfig({schema:'other',config:c}));assert.throws(()=>importMatchingBytes(new Uint8Array(8*1024*1024+1),'big.zip'));});
