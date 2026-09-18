# 自动化角色执行协议 AUTO-0.1.0-RC1

本文件只改变任务传输、完成判断、学院地址与旧入口适配，不降低原十角色写作、盲评、商业门禁、双审核、记忆和阶段审计标准。用户最终选题权保留。自动化不等于对小说质量、收益、平台接纳或AI来源检测作保证。

## 1. 每次真实开工

读取本轮固定任务提交中的 `自动化/任务/JOB_ID.json`，核对书号、仓库、分支、角色、章节、nonce、输入提交及任务SHA。不要信任聊天里的旧指针。

任务字段：`id/book_id/role/phase/chapter/round/input_commit/input/state_sha256/config/nonce`。
任务的 `input_commit` 是本轮输入快照；该快照中的数据库入口、运行状态、正式TASK、上下文包、正式角色规则及阶段资料必须真实读取。任务的 `input` 携带上游**固定提交**及结果入口。所有上游产物按其固定commit读取，不混用仓库后来出现的版本。

先检查自己 `自动化/完成/JOB_ID.json`。有效COMPLETE已经存在则只回复短ACK，绝不重复写正文、加分或LOCK。写产物前再检查控制仓库本书未撤销及当前job仍有效。非总监不得改总监的正式设定、任务、积分和LOCK；并行写手、裁判和审核员不得修改 `运行状态.json`。灵感期两个角色按原协议顺序更新灵感状态；生产期只有总监更新状态。

原人工尾注在自动模式改为短ACK；不能在本次任务中自行执行下一个角色。正文、审核报告、路由全部落GitHub，网页仅保留任务号、状态和路径。

## 2. 写入与最后完成凭证

1. 固定并读完输入；创建本角色新版本正式产物，禁止覆盖已交付正文。
2. 完整回读，机械计算UTF-8文件SHA256、正文统一字数。正文TXT不放标题或说明。
3. 写 `自动化/结果/JOB_ID.json`，结果格式见第3节。回读验证。
4. 取**此前全部产物已经存在**的真实Git提交，称为 `artifact_commit`。总监的非HOLD路由必须等待该固定提交的原五套GitHub Actions全部成功；如CI仍运行，可以先提交凭证，由控制台继续等待，绝不能伪造成功。
5. 创建 `自动化/完成/JOB_ID.json`。这是本轮最后一次业务写入；写完不再改文件、不再继续分析后续任务，只回复短ACK。完成标记不是网页“思考结束”的技术证明，调度器另保留席位至页面空闲。

```json
{
  "schema": "novel-completion/1",
  "status": "COMPLETE",
  "job_id": "复制真实任务id",
  "book_id": "复制真实book_id",
  "role": "复制真实role",
  "nonce": "复制真实nonce",
  "input_commit": "复制任务input_commit",
  "task_sha256": "复制当前消息给出的任务文件SHA256",
  "artifact_commit": "实际40位提交SHA，不是blobSHA",
  "result_path": "自动化/结果/JOB_ID.json",
  "artifacts": [{"path":"自动化/结果/JOB_ID.json","sha256":"真实64位SHA256"}]
}
```

`artifacts` 列出结果入口及**结果引用的本轮所有文件**：正文、交付、候选全文、审核、商业门禁、路由和被修改的正式文件。每项path唯一、SHA机械计算；示例占位值不能提交。文件创建了但凭证不存在，不算完成。旧job、旧nonce、错书、错章、旧正文SHA、不完整清单全部阻断。

失败时也可以写同一路径凭证：保留schema、job_id、book_id、role、nonce、input_commit、task_sha256，status为 `BLOCKED`，另加 `reason`。不能把失败写成COMPLETE。无法访问GitHub时在网页说明阻断，等待人工恢复；不能编造路径。

## 3. 各角色结果入口格式

正式报告仍按原schemas生成；以下只是机器可读索引，不替代报告。

| role / phase | 结果入口字段 |
| --- | --- |
| idea / IDEA | kind=IDEAS, idea_run_id, candidates：恰好10个 `{id,title,path}`，path指候选全文；同时按原规则更新灵感交付及状态 |
| idea_judge / IDEA_JUDGE | kind=IDEA_REVIEW, idea_run_id, review_path, eligible_ids；只列本批可选候选；空数组表示全部不可用 |
| writer_a/b/c / WRITERS或REVISION | kind=WRITER, delivery_path；正式交付JSON包含本轮TASK、正文SHA、字数、writer、chapter、status=DELIVERED |
| judge / JUDGE | kind=JUDGE, blind_result_path, commercial_gate_path；盲评status=FROZEN；不得读取作者映射、积分及反馈 |
| judge / RECHECK | kind=GATE, commercial_gate_path；只复核商业门禁，不重新选冠军、不改积分 |
| logic/style / REVIEWS或RECHECK | kind=REVIEW, review_path；必须绑定任务input.route中的task_id及body_sha256；即使pass=false也按完成报告交付，由总监合并返修 |
| stage / STAGE或FINAL | kind=STAGE, review_path；review_type分别STAGE/FINAL_BOOK，绑定input.route.snapshot_sha256 |
| director | kind=DIRECTOR, route：见下一节 |

## 4. 总监唯一业务路由

控制台 `input.jobs` 给出上一组所有完成任务、角色、固定提交和结果。三稿收齐才有DIRECTOR_AFTER_WRITERS，双审核收齐才有DIRECTOR_AFTER_REVIEWS。每个分支都先执行原完整任务，包括匿名、解封、单次加分、商业门禁、记忆实际应用、LOCK；控制台不代替编辑判断。

结果示例：

```json
{"kind":"DIRECTOR","route":{"action":"WRITE","chapter":1,"task_id":"CH001-TASK-V1"}}
```

| 当前phase | 允许action |
| --- | --- |
| DIRECTOR_SETUP | WRITE / HOLD |
| DIRECTOR_AFTER_WRITERS | JUDGE / HOLD |
| DIRECTOR_AFTER_JUDGE | REVIEW / HOLD |
| DIRECTOR_AFTER_REVIEWS | REVISE / WRITE / STAGE / HOLD |
| DIRECTOR_AFTER_REVISION | RECHECK / HOLD |
| DIRECTOR_AFTER_RECHECK | REVISE / WRITE / STAGE / FINAL / HOLD |
| DIRECTOR_AFTER_STAGE | WRITE / FINAL / REVISE / HOLD |
| DIRECTOR_AFTER_FINAL | COMPLETE / REVISE / HOLD |

所有路由有action和chapter，chapter与输出运行状态一致；HOLD另填reason。

- WRITE：填task_id；初始化为起始章，以后严格下一章；先完成前章LOCK及当前阶段关口，创建正式TASK和上下文，将正式状态逐步推进到WRITING。**每一步合法状态变化单独提交**，不要把PROJECT_SETUP直接跳WRITING。不要将已有状态协议绕过或忽略CI。
- JUDGE：填task_id，正式状态JUDGING；匿名包必须恰好本组三份不同正文。匿名映射只给总监；任务结果及route中不要带作者映射。
- REVIEW：填task_id、winner（A/B/C）、body_sha256；正式状态DUAL_REVIEW，完成匿名结果解封，积分同一task只加一次，指针全绑定获选SHA。
- REVISE：填task_id、winner、round；本章最多3轮，原获选写手；创建唯一修复令，正式状态REVISION。阶段/终局旧章回修另填repair_scope=STAGE/FINAL、original_lock_path、impact_analysis_path；恢复已锁定章时必须按原状态机经过合法诊断/恢复中间状态，不得直接LOCKED→REVISION。受影响的后续锁定与记忆要完成影响分析；不能只改旧正文。
- RECHECK：填task_id、body_sha256、winner；DUAL_REVIEW，三人并行：商业门禁裁判＋逻辑审核＋文风审核。
- STAGE / FINAL：填snapshot_path、snapshot_sha256。设置对应REVIEW_REQUIRED / FINAL_REVIEW_REQUIRED；任何本阶段回修完成后重新创建快照及总审任务。修旧章后，先将正式运行状态chapter恢复到进入阶段/终局回修前的生产章（控制状态resume_chapter），route.chapter也填该恢复章；completed_lock_path仍引用刚修好的旧章。
- 从章级审核走WRITE、STAGE、FINAL或转去修其他旧章时，另填completed_lock_path，本章必须通过同SHA逻辑、文风、商业门禁、记忆和五套CI。
- COMPLETE：只在终章且全部阶段关闭、全书当前快照终审PASS后，状态COMPLETED + FINAL_CLOSED，五套CI成功。

阶段修复清单在正式阶段修复令中维护：一次修一章，原winner，重跑三门禁；未修完时可从DIRECTOR_AFTER_RECHECK再发下一旧章REVISE并提供刚完成章completed_lock_path；全部修完发STAGE复审。最终必须重审受影响阶段和全书，不能直接宣布完结。此路径需真实样书验收，遇任何合同冲突应HOLD，不强行绕过。

## 5. 运行与故障

调度器只负责占位、发送、验凭证、等待整组、路由；全局最多6个未确认空闲的执行任务。三写手/双审核先整组预留，逐条发送存在秒级差异，并不声称计算在同一毫秒开始。三本书轮转，不能拆开三写手来填余下两个空位。

不使用OpenAI API、不调用ChatGPT私有接口、不抓正文答案、不共享登录凭据、不绕过限额/验证码。登录、验证码、模型选择、GitHub账号连接由用户完成。额度恢复时间以网页实际提示为准；未知时全局暂停，等待用户恢复，不猜时间。GitHub令牌只在扩展会话内存保存，不能发给角色。

学院当前仅四平台入口；若平台规则不允许当前用途，按实际规则阻断，不能将去翻译腔理解为隐藏AI来源或规避平台检测。自然中文润色仍需执行。
