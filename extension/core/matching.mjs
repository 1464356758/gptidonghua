import {validateBook,VERSION,assert} from './protocol.mjs';
import {readStoredZipEntry} from './zip.mjs';

// 只导入项目参数；令牌、角色对话、运行状态和小说正文永不从匹配包导入。
export function exportConfig(config) {
  const c=validateBook(structuredClone(config),false);
  const keys=['id','title','repo','branch','platform','start','end','min','max','keywords','academy_repo','academy_branch'];
  return {schema:'novel-relay-import/1',version:VERSION,config:Object.fromEntries(keys.map(k=>[k,c[k]??'']))};
}
export function importConfig(raw) {
  const doc=typeof raw==='string'?JSON.parse(raw):raw;
  assert(doc?.schema==='novel-relay-import/1'&&doc.config,'请选择本版APP生成的匹配ZIP或控制台导入.json');
  return exportConfig(doc.config).config;
}
export function importMatchingBytes(bytes,name='') {
  assert(bytes.byteLength<=8*1024*1024,'导入文件过大，请选择本版APP生成的匹配包');
  const text=/\.zip$/i.test(name)?readStoredZipEntry(bytes,'自动化/控制台导入.json'):new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  return importConfig(text);
}
