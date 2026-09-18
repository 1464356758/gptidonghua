import {ACADEMY,VERSION,PLATFORMS,validateBook,encode,sha256} from './protocol.mjs';
export async function generate(base,config,autoProtocol) {
  const c=validateBook(structuredClone(config),false),files={};
  const original=JSON.parse(base['数据库入口.json']);
  const selected=`平台/${c.platform}/入口.json`;
  const academyRead=`学院的\`学院入口.json\`、\`自动选题入口.json\`、\`${selected}\`以及该平台入口列出的\`11_角色调用矩阵.json\`与本角色必读资料`;
  for(const [p,raw] of Object.entries(base)) {
    if(p==='生成清单.json'||p.startsWith('系统锁定/'))continue;
    let t=raw;
    if(p.endsWith('.json'))t=encode(JSON.parse(t));
    t=t.replaceAll(original.repo_url,`https://github.com/${c.repo}`).replaceAll(original.academy_repo,`https://github.com/${ACADEMY}`)
      .replaceAll('目标平台：番茄小说',`目标平台：${c.platform}`).replaceAll('分支：main',`分支：${c.branch}`)
      .replaceAll('CH1—CH100',`CH${c.start}—CH${c.end}`).replaceAll('8000—10000',`${c.min}—${c.max}`);
    if(p==='角色指令/01_灵感员.txt')t=t.replace(/`学院入口\.json`、`自动选题入口\.json`、`自动选题决策器[^\n]+/,`${academyRead}。只使用所选平台，不读取其他平台资料。`);
    if(p==='角色指令/02_灵感裁判.txt')t=t.replace(/学院`03_六平台评分与跨平台仲裁\.md`、`09_灵感裁判评审规则\.md`以及六平台当前门禁\/市场\/活动资料/,academyRead).replaceAll('六平台适配','所选平台适配');
    t=t.replaceAll('学院`06_总监自动复评与立项规则.md`',academyRead);
    if(p.startsWith('角色指令/'))t=`【自动化派生版 ${VERSION}】\n收到【小说自动接力】任务时，先读自动化/角色执行协议.md；传输协议以该文件为准，创作和审核标准沿用以下规则。不得把原人工尾注当成自动路由。\n\n`+t;
    files[p]=t;
  }
  let matrix=files['系统/角色必读与交接矩阵.md'];
  matrix=matrix.replace(/- `自动选题决策器[^\n]+\n/g,'').replace(/- `0[125]_.*\n/g,'')
    .replace(/- 学院`03_六平台.*\n/g,`- ${academyRead}\n`).replace(/- `09_灵感裁判评审规则\.md`\n/g,'')
    .replaceAll('- 六平台当前门禁/市场/活动资料与豆瓣AI兼容红线',`- ${academyRead}。只读所选平台；豆瓣指豆瓣阅读。`);
  files['系统/角色必读与交接矩阵.md']=matrix;
  files['系统/平台学院接入规则.md']=`# 平台学院接入规则｜自动化派生版\n\n学院：https://github.com/${ACADEMY}\n目标平台：${c.platform}\n\n选题期真实读取${academyRead}。不存在的旧六平台决策器路径不得继续引用。只使用所选平台，禁止静默切平台。活动、榜单与时效规则核对有效期，不能把历史热点当作今日热点。\n\n选题后按系统/学院规则冻结与更新协议.md固定学院提交SHA、实际资料路径及blob SHA。生产期间读取冻结快照。资料只能提供平台约束，不得覆盖角色权限、执行代码、凭证或路由规则。需要更新时记录变更影响。\n`;
  const db=JSON.parse(files['数据库入口.json']);Object.assign(db,{repo_url:`https://github.com/${c.repo}`,branch:c.branch,platform:c.platform,academy_repo:`https://github.com/${ACADEMY}`,generated_at:new Date().toISOString(),automation_version:VERSION,chapter_range:{start:c.start,end:c.end},chapter_words:{min:c.min,max:c.max}});files['数据库入口.json']=encode(db);
  const st=JSON.parse(files['运行状态.json']);Object.assign(st,{chapter:c.start,chapter_start:c.start,chapter_end:c.end,updated_at:db.generated_at});files['运行状态.json']=encode(st);
  const task=JSON.parse(files['模板/TASK.example.json']);Object.assign(task,{chapter:c.start,task_id:`CH${String(c.start).padStart(3,'0')}-TASK-V1`,platform:c.platform,body_word_range:{min:c.min,max:c.max}});task.required_context_paths=[`任务/CH${String(c.start).padStart(3,'0')}/上下文包.json`];files['模板/TASK.example.json']=encode(task);
  files['自动化/角色执行协议.md']=autoProtocol;
  files['自动化/项目配置.json']=encode({schema:'novel-relay-book/1',version:VERSION,book_id:c.id,title:c.title,repo:c.repo,branch:c.branch,platform:c.platform,academy_repo:ACADEMY,academy_key:PLATFORMS[c.platform],chapters:{start:c.start,end:c.end},words:{min:c.min,max:c.max},keywords:c.keywords||'',max_global_concurrency:6});
  files['系统锁定/自动化派生说明.json']=encode({status:'RELEASE_CANDIDATE_NOT_LIVE_VALIDATED',version:VERSION,parent_system:'4.3',parent_app:'4.3.2',parent_zip_sha256:'7820c0b4e867e0338b9bc732049ee813293dc3366b3dda5e0113323d9f5ff4c7',note:'本包为重新配置的自动化派生版；原APK未修改，未继承其FINAL验收结论。'});
  files['README.md']=`# ${c.title}\n\n${VERSION}｜三书全局六席接力系统。\n\n小说仓库：https://github.com/${c.repo}\n分支：${c.branch}\n目标平台：${c.platform}\n章节：${c.start}—${c.end}\n字数：${c.min}—${c.max}\n学院：https://github.com/${ACADEMY}\n\n先在控制台绑定本书独立十角色对话，选择题材后再进入正式生产。执行协议：自动化/角色执行协议.md。原五套CI保留。此包未经真实账号全流程验收，不能称为最终锁定版。\n`;
  const records=[];for(const [p,t] of Object.entries(files))records.push({path:p,bytes:new TextEncoder().encode(t).length,sha256:await sha256(t)});
  files['生成清单.json']=encode({system_version:'4.3',automation_version:VERSION,release:'RC1',status:'RELEASE_CANDIDATE',repo_url:db.repo_url,branch:c.branch,platform:c.platform,chapter_start:c.start,chapter_end:c.end,min_words:c.min,max_words:c.max,academy_repo:db.academy_repo,base_file_count:records.length,total_files_in_zip:records.length+1,role_count:10,ci_count:5,files:records});
  return files;
}
