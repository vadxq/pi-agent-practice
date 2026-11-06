# Pi Agent实战：12 将 harness 做成受控服务

本章配套项目：[projects/04-service-lab](../../projects/04-service-lab/README.md)。从课程目录进入这个项目，后面的命令都在项目根目录执行。同一项目可以沿用已有副本，其他项目的依赖和副本各自独立。

```bash
cd projects/04-service-lab
npm ci --ignore-scripts --cache .pi/npm-cache
```

本地跑顺了，把提交按钮搬到浏览器上，事情立刻多起来。用户点了“修复满 50 元免运费”，页面没反应，又点一次。HTTP handler 要是来一条请求就开一个 session，两个 Agent 就可能挤进同一工作区改代码。用户只是有点着急，服务却给自己安排了双倍工作。要避免这场误会，得把任务登记和实际执行分开，让重发请求找回原任务。

本仓库还没有实现 HTTP server，下面的接口和 worker 流程是待建设的方案。目前能动手跑起来的，是独立的 SQLite 去重实验。服务需要自己接入身份验证、记录任务归属并维护业务队列，这些设施不包含在 [Pi SDK](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/sdk.md) 中。

## 先登记任务，再交给 worker

浏览器连接说断就断，任务不能跟着蒸发。提交接口验过身份和输入，把任务写入存储、返回 taskId，worker 只领取已经登记的任务。这样页面断线了，客户端仍能凭 taskId 查询状态、补读事件、下载产物：

| 接口 | 输入与输出 | 必须检查 |
|---|---|---|
| POST /tasks | workspaceRef、goal、requestId；202 返回 taskId | 身份、工作区授权、限额、重复提交 |
| GET /tasks/:id | TaskRecord 摘要 | owner 与当前主体一致 |
| POST /tasks/:id/cancel | 202 返回取消已受理 | 归属、终态、重复取消 |
| GET /tasks/:id/artifacts/:name | 固定名称的文件流 | 归属、文件白名单、长度限制 |
| GET /tasks/:id/events?after=42 | 编号递增的事件流 | 归属、补读起点、断线恢复 |

`workspaceRef: "shipping-lab"` 指向服务端预先授权的目录，由服务端解析，再决定模型、预算和工具权限。调用者不能借这个入口传入任意绝对路径、shell 命令或 owner。身份验证用现成组件，认证得到的 subject 直接交给任务层。身份得由认证结果说了算，不能让请求体自己填写来宾姓名。

## 让去重发生在副作用之前

用 `(owner_id, request_id)` 识别一次操作：同键同请求返回原任务，同键不同内容返回 409。比较之前，先校验输入、统一格式、展开默认值，再把工作区和其他所有执行字段一起算进请求摘要。只看 goal，任务换了执行条件也可能蒙混过关。

项目中的 `scripts/register_task.py` 用 Python 3 和 SQLite 观察登记过程，不需要模型或 HTTP 服务。从项目根目录执行：

```bash
npm run task:register
npm run task:register
```

连续执行两次，应该拿到同一个 taskId，第二次登记由唯一约束挡下来。这段代码只是让你看到“重复请求认回同一个任务”的效果，摘要字段放的是固定字符串，真实摘要计算和冲突比较还没实现。事务也只管登记，提交后才调用模型；没必要让数据库攥着写锁，陪模型慢慢思考。完整服务还得给锁竞争加有界重试，耗尽后明确报错，这个实验尚未加入应用级重试。细节可看官方文档：[SQLite 事务](https://www.sqlite.org/lang_transaction.html)

worker 保存领取结果后，才调用第 11 章的 harness，将 TaskRecord 与 SDK session 关联。每条运行事件带上 taskId、runId、seq，先存下来，再通知订阅者。推送失败了，浏览器还能按 seq 补读；只放在进程内数组里，一次重启就会把这段记忆清空。

## 认证不止发生在提交时

taskId 只是任务编号，拿到号码不等于拿到了钥匙。Bob 就算知道 Alice 的 taskId，也不该能查询、取消或下载她的任务，所以每条任务路由都要查归属。不存在和无权访问，可以统一返回 404。下载入口也得认清文件：名称匹配 `report.json`、`changes.diff` 等白名单后再映射存储引用，别把请求里的名字直接拼进磁盘路径。

封闭的本地实验可以使用静态 token，登录协议则复用成熟组件。比较固定 token 时，长度一致后再使用 `timingSafeEqual`，并单独检查周围的认证流程；这个函数比较得再稳，也不能替整条认证流程保证恒定耗时。细节可看官方文档：[Node.js Crypto](https://nodejs.org/api/crypto.html#cryptotimingsafeequala-b)

用户按下取消，服务收到请求，和 Agent 真正停下来，中间还隔着一段路。接口返回 202 时，用 `cancel_requested_at` 记下受理时间，等 Agent 和受管理子进程都停了，再写 `cancelled_at`。没被领取的任务可以直接取消；运行中的要触发 AbortSignal、停止新派发，清理结束才写终态。已经写进文件的改动会留下来，后面仍得核验。

## 从去重实验走向可调用的服务

可以沿一次任务经过的路径逐步接入服务。提交与查询接好后，暂停 worker，用真实 HTTP 请求检查 owner、规范化输入和去重摘要；随后加入单 worker，在独立目录调用现有 harness，并由服务端固定验收命令。接入事件和产物访问后，再试断线与取消。每次加一层、查一层，出错时才不用把整条链重新翻个底朝天。

Alice 提交 boundary 任务后，202 返回 taskId、queued 状态和查询地址，后续查询再反映 running、verifying、ready_for_review 等阶段。对外报告使用相对证据名称，隐藏宿主绝对路径和 session 认证配置。provider 错误转换为稳定类别，原始诊断留在受控日志中。

token 增量可以合并或丢弃，task_state_changed、validation_finished、artifact_created 则要保存并支持补读。订阅者读得太慢，缓冲达到上限就断开连接，让客户端按序号回来补读。不能让一个慢客户端拖着 worker 陪它等。即使事件流暂时不可用，客户端仍可查询 TaskRecord 确认业务状态。

报告也别写一半就摆到下载列表里。模型回答后，服务把产物写入临时文件，完整了再发布不可变引用和大小摘要。查询只列已经发布的产物，用户才不会下载到一份戛然而止的报告。

接口接通后，沿 Alice 的任务实际走一遍：重发相同请求，确认拿到同一 taskId；同键更换 goal，确认返回 409；换成 Bob 下载报告，确认访问被拒绝。事件断线后的补读应保持序号连续，重复取消也应只执行一次停止过程。再让 worker 领取后立即退出，查看重启后能否认出这项未正常收尾的任务，免得它永久挂着正常运行的状态。

这些请求也提供了排查线索：重发产生两个 session，去重可能放在了 SDK 创建之后；查询被拒绝而下载成功，产物路由可能漏了 owner；断线后任务消失，就查看状态是否还躺在 HTTP handler 的内存里。状态码与任务记录一起留作接口验收证据。现有 SQLite 实验只能证明数据库唯一约束这一环，HTTP 服务还得实现后再验收。

## 参考资料

- [Pi 1.4.0 SDK](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/sdk.md)
- [SQLite 事务与锁竞争](https://www.sqlite.org/lang_transaction.html)
- [Node.js timingSafeEqual](https://nodejs.org/api/crypto.html#cryptotimingsafeequala-b)
