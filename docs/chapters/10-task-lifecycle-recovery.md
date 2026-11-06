# Pi Agent实战：10任务生命周期、预算与中断恢复

本章配套项目：[projects/03-sdk-harness](../../projects/03-sdk-harness/README.md)。从课程目录进入这个项目，后面的命令都在项目根目录执行。同一项目的副本可以接着用，其他项目的依赖和副本不共享。

```bash
cd projects/03-sdk-harness
npm ci --ignore-scripts --cache .pi/npm-cache
```

有一种收工最让人尴尬：代码刚改好，还没来得及验证，模型额度就用完了。Pi 只能停下，补丁却已经落盘了，总得有份报告交代干到哪儿了吧。更麻烦的是进程突然退出，连报告都没写完。把 SDK 接起来以后，这些半途停工的烂摊子就轮到宿主操心了。

## 10.1 控制任务生命周期与预算

探查花一点，修改花一点，重试再花一点，几个子任务还各自有账单。预算要是各算各的，根任务很容易到结账时才发现不够。这里让父 Agent 和子任务共用一本账，派发前就预留额度，也共用一个截止时间。不能等响应回来了才记账，否则几个并行请求可能都以为最后一个名额是自己的。

运行控制见 [control.ts](../../projects/03-sdk-harness/src/harness/control.ts)，任务流程与类型分别在 [index.ts](../../projects/03-sdk-harness/src/harness/index.ts) 和 [types.ts](../../projects/03-sdk-harness/src/harness/types.ts)。

### 业务任务比一次模型响应更长

收到 SDK 的 `agent_settled` 时，当前 session 已经没有自动后续工作了。但运费修复还没到能收工的时候：固定验收、独立审查和保存报告都得算进任务，等这些步骤有了结果，才能决定最终状态。细节可看官方文档：[SDK 事件与结束语义](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/sdk.md)

当前程序持久化 `running` 和最终状态，尚无提交队列或完整调度平台。报告使用以下主要终态：

| 状态 | 本程序何时写入 |
|---|---|
| `analysis_complete` | 只读分析的全部必需 Agent 结果符合契约 |
| `ready_for_review` | 写模式固定验收通过，且独立 reviewer 判定 acceptable |
| `failed` | 必需子任务、契约、证据、验证或审查失败；超时也在原因中明确记录 |
| `cancelled` | 外部取消信号已传播，当前运行完成清理 |
| `budget_exceeded` | 调用次数或已启用的费用阈值触发停止 |

这些终态都要靠收尾代码写进去。进程被强杀，收尾也一起没了，记录可能永远挂着 running，像办公室里亮着却没人管的灯。后续得盘点并确认旧执行器已经退出，才能把这次运行记成 `interrupted`。当前程序还没有自动识别入口，具体盘点方法放在第 10.2 节。

### 先限制能在执行前确定的量

`HarnessTaskSpec.budget` 包含四项：

```typescript
interface Budget {
  readonly timeoutMs: number;
  readonly maxModelCalls: number;
  readonly maxToolCalls: number;
  readonly maxCostUsd: number;
}
```

根任务持有一个 `RunControl`，root、两个 scout 和 reviewer 共用额度。调用 SDK 前，模型请求先同步通过 `admitModel()`，工具 preflight 先同步通过 `admitTool()`。额度当场预留，两个 scout 就不能同时用掉最后一次调用。细节可看官方文档：[Agent 的 stream 和工具 hook 定义](https://github.com/earendil-works/pi/blob/v1.4.0/packages/agent/src/types.ts)

`maxModelCalls` 统计进入 SDK 对话流函数的次数，网络层的全部 HTTP 尝试并不与它一一对应。示例默认关闭 Agent 自动重试、自动压缩和 cache warming；命令末尾显式增加 `--retry-transient` 后，才启用 Pi 内建 Agent retry：`maxRetries:5`、`baseDelayMs:1000`、`maxAgentDelayMs:10000`，provider 级保持 `maxRetries:0`。细节可看官方文档：[Settings：Retry](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/settings.md#network-and-retries)

成功响应会把内建重试计数归零，所以这个上限 5 管的是连续重试，整项任务累计重试仍可能超过 5 次。根 `maxModelCalls` 与截止时间会继续约束它：每次重进 stream 都计数，退避也占用时间预算。

重试也得留在原来的运行里。外面套个循环，“失败就整单重来”看起来干脆，已经写进文件的修改却可能被再做一遍。所选策略会存入 `TaskReport.retryPolicy` 和任务检查点，`retry_scheduled` / `retry_finished` 留下尝试次数、实际退避和错误摘要。根任务取消时，`abortRetry()` 会中断退避；重试继续使用原模型和服务，没有 fallback。

### 时间和取消要贯穿整条任务链

`createControl()` 将外部 `AbortSignal` 接到根 controller，并设置统一截止时间。各 session 订阅同一信号：触发后停止底层 Agent，退出时等待 `session.abort()`、取消订阅并 `dispose()`。根调用等子运行完成清理才返回。CLI 的 Ctrl+C 可按下面的方式接入根信号：

```typescript
const controller: AbortController = new AbortController();
const cancel: () => void = (): void => controller.abort(new Error("用户取消"));
process.once("SIGINT", cancel);
```

完整 CLI 已处理 SIGINT/SIGTERM。固定验收使用 `execFile` 的 `signal` 和独立进程超时，防止 Agent 停止后检查仍在运行。停得有多快，要看 Node 事件循环、工具和外部库是否配合；扩展要是对信号装聋作哑，清理就会被拖住。已经执行的 `edit`、文件写入和远端副作用都还在，取消按钮没有附带时光倒流功能。细节可看官方文档：[SDK 的 abort 与 waitForIdle](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/sdk.md#prompting)

### 费用阈值只能约束可知的估算

程序在每条 assistant 完成时读取 SDK usage，收尾再用 `getSessionStats()` 汇总各 session 的输入、输出、cache read 和 cache write。较完整的用量通常要等请求完成后才能得到；换算费用还需要可靠的模型 metadata 或服务账单。细节可看官方文档：[消息与 Usage 类型](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/message-types.md)

默认 `costEstimateAvailable:false`、`estimatedCostUsd:null`，`maxCostUsd` 不参与停止判断，任务仍受时间与调用次数约束。SDK 显示的 0 也无法说明服务免费。核实价格后再传 `--cost-metadata-known`；即使启用了费用阈值，停止时也可能还有并行请求没回来。它们后续结算的费用仍要入账，总额可能超支，阈值拦不住已经出门的账单。

### 分别触发预算、取消与超时

在本章项目根目录运行稳定契约检查：

```bash
npm test
```

下面的真实请求需要已经创建的 `.pi/labs/shipping-sdk` 副本与已验证的模型凭据。替换 provider/model 标识，自定义端点同时传入对应 `--models` 配置；实验只读，便于单独观察停止行为：

```bash
npm run example -- \
  --workspace .pi/labs/shipping-sdk --provider YOUR_PROVIDER --model YOUR_MODEL \
  --mode team --goal "只读检查运费边界及测试" \
  --max-model-calls 1 --max-tool-calls 8 --timeout-ms 300000
```

team 从两个 scout 开始，一次模型调用不足以让它们全部完成，报告应为 `budget_exceeded`，已收到的 usage 仍保留。把调用上限改为 24，运行中按 Ctrl+C，应得到 `cancelled`；再以很短的 `--timeout-ms` 发起一轮，检查错误是否为 `TaskTimeoutError`。对照三份报告的 `terminationReason`、Agent error、截止时间、用量与已有产物，事件条数无需相同。

上游错误也可能提前终止任务。已有真实运行中，code scout 完成后，tests scout 的后续请求返回 `temporarily unavailable`，关闭重试的任务随即停止，未进入写阶段，详见 [验证记录](../reference/validation.md)。Pi 1.4.0 的内建分类器识别 `The service is temporarily unavailable. Please retry later.`，却不识别裸 `upstream failed`，后者不会自动重试，原始错误会保留在报告中，匹配规则见 [重试源码](https://github.com/earendil-works/pi/blob/v1.4.0/packages/ai/src/utils/retry.ts)。这类错误来自服务请求，不能据此判断运费实现；若失败前已写入文件，重跑前仍须盘点现场。

### 停止后保留哪些结论

看到 `budget_exceeded`，眼下只能说这份额度不够，别急着给模型判“不会修”。需要加额度，就带着新配置重新提交，原记录留下，程序不会自己续费。更实用的办法是派发前给验证和审查留点余粮，别让前面的分析把预算吃光，改完代码却饿着肚子交差。

检查用量时，工具次数不包含模型自身推理，费用 0 要结合 `costEstimateAvailable` 解读。本例在 Agent 与验证阶段结束后关闭根计时器，随后采集最终 diff、构造并保存报告；这些后续步骤不受该计时器约束。取消时保留下来的 diff 是已发生的修改，须核验后再决定如何处置。

用一份正常分析报告与这些停止记录对照，就能看出差异发生在哪一阶段。启用重试的运行还要带上允许重试的错误、次数、幂等前提和根预算，解释同样的目标为何在不同配置下停止。

## 10.2 保存现场，处理中断

前面的取消和超时，都指望进程还有机会收拾东西。进程突然没了，`task-record.json` 可能还挂在 `running`，文件却早已改过。这时候把原 prompt 再发一遍，可能让同一处修改再来一次。恢复得从眼前的现场入手：旧进程还在不在，补丁写到了哪儿，检查有没有真正跑完。

当前实现会留下会话和任务检查点，方便你盘点后接着处理。自动重放中断任务和 durable execution 还没有实现，恢复这一步仍需要人判断。

### 从哪里找回任务的来龙去脉

现场的线索分在三个地方：session 里有对话和工具调用，任务记录里有身份和业务阶段，产物里有文件改动与验证结果。它们不一定同时更新。模型还没来得及说“改好了”，文件可能已经落盘；检查点也可能慢了一拍。把这些材料和当前 diff 对着看，才拼得出事情经过。

Pi 通过 `SessionManager` 保存条目树和当前 leaf。重新构建模型上下文时，它选择活动分支并应用压缩，因此持久化上下文以它为准。直接给 `session.agent.state.messages` 赋值，只改了内存里的消息视图，不能替换这份持久化来源。细节可看官方文档：[SDK Session Storage](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/sdk.md#session-management)

当前 harness 每个 Agent 都使用：

```typescript
SessionManager.create(workspace, path.join(directory, "sessions"))
```

这个调用为每个 Agent 建立独立的 sessionId 和会话文件。父子关系由宿主的 `parentTaskId` 记录，SDK 不会看一眼文件名，就主动接管这个子任务。

### 检查运行目录

一次第 09 章只读运行正常结束后，stdout 的 `artifacts.directory` 指向本次目录。这里的文件分别回答不同问题：

| 文件 | 用途与限制 |
|---|---|
| `task-record.json` | 任务启动和阶段检查点，正常结束时写终态与报告引用 |
| `sessions/*.jsonl` | 每个 session 的对话树；可能含文件内容和工具参数 |
| `events.jsonl` | 宿主的关键生命周期事件，不是完整 SDK 原始事件流 |
| `baseline.diff` | 启动时 Git 工作树相对 index 的差异 |
| `final.diff` | 收尾时同样口径的差异 |
| `report.json`、`report.md` | 结构化结果和便于审阅的说明 |

核对 `task-record.json` 与已有 `report.json` 的 taskId 后，再检查旧进程和工作目录归属。`running` 只是上次保存时的状态，不能当成进程还活着或已经退出的证明。确认旧写入者停止后再开新任务，否则两边可能同时改文件。

任务记录先写入同目录临时文件，再 rename 替换，避免正常读取时拿到半份 JSON。但实现没有逐项 fsync，会话、文件改动和报告也不在同一事务中，因此这些材料可用于调查进程崩溃，不能保证主机断电后的完整性。

会话 JSONL 中的 `id` 与 `parentId` 把条目连成分支，系统和工具变化、压缩、usage 也可能拥有各自条目。手工删掉中间几行，或者把不同 session 拼起来，都会切断这些引用。恢复时用会话接口处理，这份文件有自己的家谱，不能当普通聊天数组随手重排。细节可看官方文档：[Session File Format](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/session-format.md)

### 在只读任务中观察意外中断

Ctrl+C 经过程序的取消处理，session 停止后可以保存已有证据并写入 `cancelled`。`kill -9`、主机断电或运行时崩溃却可能跳过整条退出路径，最后请求没有完整响应，任务文件仍停在 running。工具可能已经执行，成功响应却还没保存。没找到回执，只能说明回执不在，不能据此断定事情没发生。

下面只在可信练习副本中演练，从本章项目根目录调用已创建的 `.pi/labs/shipping-sdk`，使用已验证的 provider/model 与环境凭据；自定义模型还需传入 `--models`。选择只读模式，可以先观察记录怎样中断：

```bash
npm run example -- \
  --workspace .pi/labs/shipping-sdk --provider YOUR_PROVIDER --model YOUR_MODEL \
  --mode team --goal "只读分析实现和测试，给出证据" --timeout-ms 300000
```

运行开始后记下 taskId，在另一个终端通过系统进程查看工具确认真实 PID，再终止该进程；无法确认时不要操作。保留原目录，后续运行使用新 taskId。程序拒绝覆盖已有任务目录，但这项保护不等于服务端请求去重，后者仍需另行实现。

写任务若中断于 `edit` 之后、固定验证之前，可能留下完整或部分补丁。先检查 diff 并运行宿主检查，再决定继续分析、重新修复还是只补验证。支付、邮件、生产发布等外部操作另需对应系统的幂等标识，这里不开放这些能力。

### 恢复先盘点，再开会话

在人工监督下，确认旧进程已停止、工作区归属明确后，对照 baseline、当前 diff、固定验证和会话最后完成的消息、工具结果，给新运行确定目标与预算。只读分析通常可以新建任务重跑，写任务必须先核验现有改动。

官方 `SessionManager.open()` 可以打开已知会话，SDK 示例还展示创建、继续、列举与 fork：[Sessions SDK Example](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/examples/sdk/11-sessions.ts)。组装时的核心变化是：

```typescript
const manager: SessionManager = SessionManager.open(
  sessionFile, sessionDirectory, workspace,
);
```

将 `manager` 传给新的 `createAgentSession()`，并显式提供当前模型、工具、资源和设置。加载个人全部扩展会改变原任务的权限范围。本书主 CLI 尚无 `--resume-task`，这里展示的是恢复入口所用 API，普通新任务不会自动恢复原任务。

打开会话后，通常根据持久化上下文发起新请求；原来未完成的网络调用未必能接续，已经发生的副作用也仍需逐项核对。任务级崩溃恢复、持久等待或安全重放需要另外的机制，第 20 章会评估 Pi Durable；单靠会话文件还做不到这些。细节可看官方文档：[Sessions and Context](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/sessions.md)

### 记录恢复决定和未知项

某个 Agent 在产生消息前就失败时，目录中可能没有完整 session 文件，对象建起来了，对话却未必已经写进文件。会话能打开但工具不符，就比较恢复时资源与记录中的 loadout。若 diff 为空，只能按该比较口径记为无差异，测试结果仍要另找执行记录。找不到的证据一并留在恢复记录的未知项中。

下一次运行需要的交接，得让人看完就知道怎么接手：哪个任务、哪段会话、哪个工作区，最后确认了什么，有哪些副作用还说不准，以及决定怎么恢复、给多少新预算。只读分析能否重跑、已有改动怎样复验、哪里还需要人判断，也在这里交代。旧产物和没执行的检查一起留下，别让新记录把旧现场盖掉。真实演练范围见 [验证记录](../reference/validation.md)。

## 参考资料

- [SDK 生命周期与控制，v1.4.0](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/sdk.md)
- [Agent Hook 类型，v1.4.0](https://github.com/earendil-works/pi/blob/v1.4.0/packages/agent/src/types.ts)
- [Settings 与重试，v1.4.0](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/settings.md)
- [Message Types 与 Usage，v1.4.0](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/message-types.md)
- [内建暂态错误分类与退避，v1.4.0](https://github.com/earendil-works/pi/blob/v1.4.0/packages/ai/src/utils/retry.ts)
- [Session File Format，v1.4.0](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/session-format.md)
- [Sessions SDK Example，v1.4.0](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/examples/sdk/11-sessions.ts)
- [Sessions and Context，v1.4.0](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/sessions.md)
