export const VERSION = 'AUTO-0.2.0-RC2';
export const SUPPORTED_PROTOCOLS = [VERSION,'AUTO-0.1.0-RC1'];
export const ACADEMY = '1464356758/xueyuan';
export const CONTROL_PATH = '自动化控制/控制台.json';
export const ROLES = {
  idea: '01_灵感员', idea_judge: '02_灵感裁判', director: '03_总监',
  writer_a: '04_写手A', writer_b: '05_写手B', writer_c: '06_写手C',
  judge: '07_章节裁判', logic: '08_逻辑审核员', style: '09_中文文风审核员', stage: '10_阶段总审员',
};
export const PLATFORMS = {'番茄小说':'番茄', '七猫小说':'七猫', '起点中文网':'起点', '豆瓣阅读':'豆瓣'};
export const CI_NAMES = ['Novel System CI','Novel Contract CI','Writer Scoreboard CI','Stage Integrity CI','Strict Stage Gate CI'];
export const copy = x => structuredClone(x);
export const encode = x => JSON.stringify(x, null, 2) + '\n';
export const uid = () => crypto.randomUUID();
export function assert(ok, message) { if (!ok) throw new Error(message); }
export function repoName(value) {
  const s = String(value).trim().replace(/^https:\/\/github\.com\//, '').replace(/\.git\/?$/, '').replace(/\/$/, '');
  assert(/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(s), '请输入仓库根地址：owner/repo');
  assert(!s.split('/').some(x => ['.','..'].includes(x)), '仓库名不合法');
  return s;
}
export function safePath(p) {
  assert(typeof p === 'string' && p.length > 0 && p.length <= 500 && !p.startsWith('/') && !/[\\\x00-\x1f?#]/.test(p), '文件路径不合法');
  assert(!p.split('/').some(x => !x || x === '.' || x === '..' || x.toLowerCase() === '.git'), '文件路径越界');
  return p;
}
export function chatURL(value) {
  const u = new URL(value);
  assert(u.origin === 'https://chatgpt.com' && /^\/(?:g\/[^/]+\/)?c\/[a-zA-Z0-9-]+\/?$/.test(u.pathname), '请绑定已创建的 ChatGPT 普通对话完整地址');
  return u.origin + u.pathname.replace(/\/$/,'');
}
export function validateBook(b, requireChats = true) {
  assert(/^[a-zA-Z0-9_-]{1,40}$/.test(b.id), '书号只能包含英文、数字、下划线和连字符');
  b.repo = repoName(b.repo);
  b.academy_repo = repoName(b.academy_repo ?? ACADEMY);
  b.academy_branch = b.academy_branch ?? 'main';
  assert(b.academy_repo !== b.repo, '小说仓库与学堂仓库必须分开');
  assert(typeof b.academy_branch === 'string' && b.academy_branch.length > 0 && !/[\s~^:?*\[\\]/.test(b.academy_branch) && !b.academy_branch.includes('..') && !b.academy_branch.includes('@{') && !b.academy_branch.endsWith('/') && !b.academy_branch.endsWith('.') && b.academy_branch !== '@' && !b.academy_branch.split('/').some(x => !x || x.startsWith('.') || x.endsWith('.lock')), '学堂分支名称不合法');
  assert(typeof b.branch === 'string' && b.branch.length > 0 && !/[\s~^:?*\[\\]/.test(b.branch) && !b.branch.includes('..') && !b.branch.includes('@{') && !b.branch.endsWith('/') && !b.branch.endsWith('.') && b.branch !== '@' && !b.branch.split('/').some(x => !x || x.startsWith('.') || x.endsWith('.lock')), '分支名称不合法');
  assert(PLATFORMS[b.platform], '请选择番茄、七猫、起点或豆瓣阅读');
  for (const k of ['start','end','min','max']) assert(Number.isSafeInteger(b[k]) && b[k] > 0, k+'必须为正整数');
  assert(b.end >= b.start && b.end <= 9999 && b.max >= b.min && b.max <= 100000, '章节或字数范围不合法');
  assert(typeof b.title === 'string' && b.title.trim().length > 0 && b.title.length<=120, '请填写120字以内的书名或项目名');
  assert(b.keywords===undefined || (typeof b.keywords==='string' && b.keywords.length<=8000), '灵感关键词必须为8000字以内的文字');
  if (requireChats) {
    const urls = Object.keys(ROLES).map(r => b.chats[r] = chatURL(b.chats[r]));
    assert(new Set(urls).size === 10, '同一本书的十个角色必须绑定十个不同对话');
  }
  return b;
}
export async function sha256(text) {
  const data = typeof text === 'string' ? new TextEncoder().encode(text) : text;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map(x => x.toString(16).padStart(2,'0')).join('');
}
export const isSHA = x => typeof x === 'string' && /^[0-9a-f]{40}$/.test(x);
export const isHash = x => typeof x === 'string' && /^[0-9a-f]{64}$/.test(x);
// 与333基线一致：汉字逐字，连续英文/数字各一词。正文文件不放标题。
export function countWords(s) { return (s.match(/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g)||[]).length + (s.match(/[A-Za-z0-9]+/g)||[]).length; }
export const taskPath = id => `自动化/任务/${id}.json`;
export const resultPath = id => `自动化/结果/${id}.json`;
export const receiptPath = id => `自动化/完成/${id}.json`;
export function promptFor(job, publishedCommit) {
  return `【小说自动接力｜${job.id}】\n你是【${ROLES[job.role].slice(3)}】，只执行这个任务。\n小说仓库：https://github.com/${job.repo}\n分支：${job.branch}\n任务文件：${taskPath(job.id)}\n任务固定提交：${publishedCommit}\n任务文件SHA256：${job.task_sha256}\n必须实际读取上述固定任务及其中的输入快照、角色指令、自动化协议。所有正式产物与交接写入小说仓库。先检查本任务完成凭证，已存在且有效则不重复执行。不得把网页文字当作交付。最后一次业务写入必须是 ${receiptPath(job.id)}，其后仅回短ACK，不再修改产物。不要自行接下一任务。遇限额、权限、文件或状态问题写BLOCKED凭证，不能假装完成。\n网页最多回复：任务编号、完成/阻断、GitHub路径；自动化模式无需用户复制尾注。`;
}
