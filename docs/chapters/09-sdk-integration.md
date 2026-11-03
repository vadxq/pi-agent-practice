# Pi Agent实战：09选择集成方式，建立可控的SDK闭环

本章配套项目：[projects/03-sdk-harness](../../projects/03-sdk-harness/README.md)。从课程目录进入这个项目，后面的命令都在项目根目录执行。同一项目可以沿用已有副本，换项目则需要各自的依赖和副本。

```bash
cd projects/03-sdk-harness
npm ci --ignore-scripts --cache .pi/npm-cache
COURSE_PROJECT="$PWD"
```

在终端里用顺手了，多半会想把 Pi 接进自己的程序。每天分析一次运费函数，拿到最终文本就够了；要做成网页，就得让人看见进度，还得给取消按钮找个真正管用的接头。任务还是那个任务，程序和 Pi 打交道的方式却得换一换。

## 9.1 选择程序需要的集成接口

以下实验使用 Pi 1.4.0、Node.js 26.12.1 和 TypeScript strict，资料核对日期为 2026-10-23。先完成第 01 章的模型认证，命令从本章项目根目录执行。

### 按通信方式选择接口

Pi 的 interactive、print、JSON、RPC 共用 Agent、会话、资源和工具。print 返回最终文本，JSON 输出事件，RPC 允许客户端在进程运行期间继续发命令。SDK 则把 session 放进 Node.js/Bun 宿主进程，不属于 CLI 模式。细节可看官方文档：[官方 CLI Integration](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/cli-integration.md)

| 接口 | 输入和输出 | 生命周期 | 课程中的用途 |
|---|---|---|---|
| print | 启动参数进入，最终文本退出 | 单次进程 | Shell 管道、简短解释 |
| JSON | 启动参数进入，JSONL 事件退出 | 单次进程 | 一次任务的进度采集 |
| RPC | stdin 命令，stdout 响应与事件 | 长驻子进程 | Python、桌面客户端等双向控制 |
| SDK | TypeScript 方法和回调 | 宿主拥有 session | 本书主线 harness |

课程 harness 本来就用 TypeScript，还要一起管理工作区、工具、验收函数和父子 session，SDK 接起来最顺手。换成跨语言客户端，可以选 RPC；只想每晚让 Shell 脚本解释一次变更，print 就够用了。接口不用选得最隆重，能接住程序需要的信息就行。

### 用同一任务观察三种 CLI 输出

先创建一个带运费边界缺陷的副本，各种接口都对它做只读分析：

```bash
npm run lab:init -- --name shipping-interfaces
npm run lab:check -- --workspace .pi/labs/shipping-interfaces
```

第二条命令应失败，留下缺陷起点。接下来的请求只解释代码，不会修好它，业务验收因而仍应失败。`lab:init` 拒绝覆盖已有目录；同名目录存在时，换一个 name，并同步后续 workspace。进入副本，分别运行 print 和 JSON 请求：

```bash
cd .pi/labs/shipping-interfaces
"$COURSE_PROJECT/node_modules/.bin/pi" --print --no-session \
  --no-extensions --no-mcp --no-skills --no-prompt-templates --tools read,grep,find,ls \
  "只读解释 src/shipping.ts 的免运费边界，列出需要核验的测试"
"$COURSE_PROJECT/node_modules/.bin/pi" --mode json --no-session \
  --no-extensions --no-mcp --no-skills --no-prompt-templates --tools read,grep,find,ls \
  "只读解释 src/shipping.ts 的免运费边界" > ../../runs-shipping-events.jsonl
```

print 把最终文本留在终端，JSON 把事件写入项目 `.pi` 内的 JSONL 文件。JSONL 每行是一个 JSON object，解析时逐行交给 `JSON.parse()`，而非一次塞入整个文件。这里的 JSON 约束事件封装，模型正文仍可以是自然语言。

接收器按 LF 分帧，凑齐一行再解析，末尾没收完的片段留到下次。一条事件可能分几个 chunk 送来，一个 chunk 也可能装着好几条事件；一次 `data` 回调只是送来一批字节，没保证刚好是一条记录。Node `readline` 还会识别额外的 Unicode 分隔符，官方不建议直接用它解析这份 JSONL。细节可看官方文档：[JSON Event Stream](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/json.md)

错误判断也要随接口调整。print 对错误、取消和输出长度截断有相应的非零退出语义；JSON 中的 assistant response 失败却不一定导致进程非零退出，因此必须检查事件状态，不能只看 `$?`。界面可用 `message_update` 显示增量，保存结果则取完成的 `message_end`。

### RPC 的响应不是完成通知

在独立终端进入同一副本，执行：

```bash
COURSE_PROJECT=/填写该独立项目的绝对路径
cd "$COURSE_PROJECT/.pi/labs/shipping-interfaces"
"$COURSE_PROJECT/node_modules/.bin/pi" --mode rpc --no-session \
  --no-extensions --no-mcp --no-skills --no-prompt-templates --tools read,grep,find,ls
```

通过 stdin 逐行发送：

```json
{"id":"explain-1","type":"prompt","message":"只读解释 src/shipping.ts 的阈值边界"}
```

响应用相同的 `id` 对上命令。这里的成功响应，更像叫号机吐出来的取号单：命令被接纳、排队或处理了，活却未必已经干完。客户端还得继续读事件，等 `agent_settled` 后检查最终消息。取消等命令的字段见 [RPC Protocol](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/rpc.md)。哪怕界面暂时不更新，stdout 也要持续消费，管道缓冲区装满了会堵住 Pi。

客户端要分别确认三件事：命令收到了吗，自动工作停下了吗，业务验收通过了吗。前两件由接口通知，第三件得由启动任务的程序实际运行检查。最终消息里的“已修复”还得等固定验收盖章，任务才能记为 `ready_for_review`。

### 在宿主进程内使用 SDK

切回前面完成 print 和 JSON 请求的终端，返回本章项目根目录，运行无需模型的生命周期检查。不要把 shell 命令输入仍在运行的 RPC 进程：

```bash
cd ../../..
npm run example -- --self-check
```

入口和装配分别在 [main.ts](../../projects/03-sdk-harness/src/harness/main.ts)、[sdk.ts](../../projects/03-sdk-harness/src/harness/sdk.ts)。self-check 创建真实的 `ModelRuntime` 和 `AgentSession`，检查只读工具后释放资源。输出 `modelRequests:0` 表示没有发送模型请求；这项检查覆盖本地装配，尚不涉及 provider 连接、生成质量和子任务。

发送真实请求前，将下面的 `YOUR_PROVIDER`、`YOUR_MODEL` 替换成已经验证的标识；自定义 provider 还需传入 `--models <配置文件路径>`。认证由所选 provider 的环境变量提供，本例不读取个人 `auth.json`，密钥不写进命令：

```bash
npm run example -- \
  --workspace .pi/labs/shipping-interfaces \
  --provider YOUR_PROVIDER --model YOUR_MODEL \
  --mode single --goal "只读分析运费阈值与验收覆盖"
```

这次结果直接从 session 返回给宿主。程序不读取个人 Pi 资源目录，装配方式见第 9.3 节，SDK 接口见 [官方文档](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/sdk.md)。

### 失败由谁收尾

上述 CLI 命令禁用了扩展、MCP、Skills 和模板，只开放同一组只读工具，避免额外能力干扰比较。普通工具 allowlist 不会移除 MCP 的所有可达能力；`--no-session` 只关闭会话持久化，不限制文件访问或计费。写入权限仍须单独授权。

print 和 JSON 退出后，启动它们的程序保存日志与退出原因。RPC 子进程意外死亡时，客户端将未完成请求记为未知或失败，检查副作用后再决定重连。SDK 异常发生在宿主进程内，应用要释放 session 等资源、写下业务终态；重试、幂等与分布式恢复也需要应用自行实现。

排查时可以沿数据经过的位置缩小范围：print 有文本而 JSON 解析失败，常需要查看 stdout 是否混入日志、分帧是否完整；RPC 响应成功却一直等待，可能是事件未被消费，或客户端还在等待不存在的第二个响应 ID。SDK 与 CLI 表现不同时，provider、工作目录、工具及资源加载应当先对齐，之后才有条件讨论生成差异。

比较接口时，再实际取消一次请求，记录停止通知、错误和输出的位置。它能检验客户端是否正确处理失败，无需为四种接口分别实现一套业务逻辑。

## 9.2 跑通 SDK 的最小闭环

选好 SDK，就把那次只读运费分析搬进程序里。Agent 跑完，宿主得接住结果、检查内容，再把占用的资源收拾好。这一小段调用接完整了，后面加任务管理才有着落。

### 一个 session 管一段对话

`createAgentSession()` 创建的 `AgentSession` 保存对话，协调模型、工具、队列、压缩状态和扩展运行时。模型调用工具、接收工具结果并继续回答的循环由 SDK 执行，宿主无需再套一层 `while(true)`。细节可看官方文档：[SDK 生命周期](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/sdk.md)

下面的函数接收已经装配好的 session，订阅事件后发送请求：

```typescript
import type { AgentSession, AgentSessionEvent } from "@earendil-works/pi-coding-agent";

export async function ask(session: AgentSession, prompt: string): Promise<string> {
  const unsubscribe: () => void = session.subscribe((event: AgentSessionEvent): void => {
    if (event.type === "agent_settled") {
      process.stderr.write("automatic work stopped\n");
    }
  });
  try {
    await session.prompt(prompt, { expandPromptTemplates: false });
    return session.getLastAssistantText() ?? "";
  } finally {
    await session.abort();
    unsubscribe();
    session.dispose();
  }
}
```

`prompt()` 返回后，`ask()` 读取最后一条 assistant 文本，并释放 session。模型和工作区在函数外装配，所以不同角色可以复用这段运行逻辑。完整实现对应 [sdk.ts](../../projects/03-sdk-harness/src/harness/sdk.ts) 的 `createExplicitSession()` 与 `runAgent()`。

这里的顺序不能随便换。订阅晚于 `prompt()`，请求要是结束得够快，完成事件已经发走，界面还在苦等一个错过的通知。清理也一样，放进 `finally` 才能让正常返回、请求抛错和后续结果校验失败都走过 `abort()`、取消订阅、`dispose()` 这条收尾路径。

### 先验证对象生命周期

本地需要已安装的课程依赖与上述 Node 环境。下面三条命令在本章项目根目录执行，均无需模型凭据：

```bash
npm run typecheck
npm test
npm run example -- --self-check
```

最后一条应输出一行包含以下字段的 JSON，ID 每次不同：

```json
{"check":"real-sdk-lifecycle","passed":true,"modelRequests":0,"tools":["read","grep","find","ls"],"sessionId":"每次运行生成的ID"}
```

`passed:true`、`modelRequests:0` 和 `tools` 分别表示生命周期检查通过、没有模型请求、实际工具名单；`sessionId` 每次生成。检查直接创建真实对象，没有使用 fake model；认证、输出契约和真实工具调用留给下一步验证。细节可看官方文档：[官方最小 SDK 示例](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/examples/sdk/01-minimal.ts) 展示了同样的订阅和释放方式。

### 运行一个有契约的真实任务

真实运行前，需要第 01 章已验证的 provider 与模型标识，替换下面的 `YOUR_PROVIDER`、`YOUR_MODEL`。自定义模型配置加 `--models .pi/provider-models.json`，认证由所选 provider 的环境变量注入，密钥不写进命令：

```bash
npm run lab:init -- --name shipping-sdk
npm run example -- \
  --workspace .pi/labs/shipping-sdk \
  --provider YOUR_PROVIDER --model YOUR_MODEL \
  --mode single --goal "只读找出国内订单恰好5000分时的运费边界问题，并给出文件行号"
```

程序运行时将进度写到 stderr，最终 `TaskReport` 写到 stdout，并保存到 `.pi/runs/<taskId>/`。脚本就能直接接住报告，不用在一堆进度文字里捞结果。本轮没有 `--allow-write`，完成分析后的业务终态应为 `analysis_complete`。

模型最终回答必须符合课程的 `AgentAnswer`：

```typescript
interface Evidence {
  readonly path: string;
  readonly line: number;
  readonly reason: string;
}

interface AgentAnswer {
  readonly summary: string;
  readonly evidence: readonly Evidence[];
  readonly unknowns: readonly string[];
  readonly verdict: "acceptable" | "changes_required" | "inconclusive";
}
```

`evidence` 交代文件、行号和判断理由，没查明白的留在 `unknowns`。收到回答后，`parseAgentAnswer()` 检查 JSON 字段、枚举、条目数和体积，`validateEvidence()` 接着查路径范围、文件是否存在、行号有没有越界。这相当于确认答卷填全了、引用的页码也找得到；那一页究竟能不能证明结论，还得审阅或运行固定业务检查。

### 从 SDK 结束走到业务完成

这次请求经过三个文件：`main.ts` 解析命令、建立取消信号并选择固定验收，`index.ts` 管理业务阶段，`sdk.ts` 执行 Agent。等各阶段的结果收齐，任务层再判断终态；服务入口也可以复用 `runHarness()`。

异步工作结束，`Promise<AgentResult>` 才把结果交回来。解析出的数据从 `unknown` 开始，object、数组、字符串都逐项检查。直接写 `JSON.parse(raw) as AgentAnswer` 倒是省事，可这个断言只是告诉 TypeScript“相信我”，模型少填的字段不会被它揪出来。

模型出错，可以记成该 Agent 的失败结果，再由业务任务汇总。但目录没建成、报告没写进去，宿主调用本身就可能抛错，完整报告也未必来得及留下。CLI 会输出结构化诊断并设置非零退出码；嵌入 SDK 的应用也需要同时处理返回值里的业务失败和调用异常。

终端进度只显示任务标识、角色、时间、事件类型与简短说明，完整工具参数和逐 token 文本都不进入这条进度流。调查失败时，可沿 session 引用查看完整历史。进度能告诉你任务走到哪儿了，却不适合拿来数工作量：一次请求可能调了好几个工具，也可能只回了一句话。终端热闹，不等于干活更多。

结束事件有不同范围：`message_end` 结束一条消息，`agent_end` 结束一次底层循环，`agent_settled` 表示当前 session 没有自动后续工作。重试或排队工作可能在第一轮之后继续，因此不能收到第一个 `agent_end` 就释放 session。程序等待 `session.prompt()` 完整返回，再取最终消息与使用量。细节可看官方文档：[SDK 事件说明](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/sdk.md#subscribing-to-events)

`prompt()` 返回后，程序检查最终 assistant 的 `stopReason`，拒绝 `error`、`aborted` 与 `length`，随后运行契约和证据校验。这些步骤通过后，`AgentResult` 才成为 `completed`。本例到此完成的是分析：文件仍保持原样，报告也按分析完成记录。

### 结果不符合预期时从哪里查

从报错的位置往回查，通常比重新改一遍 prompt 更有用。找不到模型，就核对 provider/model 是否来自同一配置；认证失败，就用最小请求检查 provider 连接。解析阶段的 `Unexpected token` 通常意味着最终文本仍含 Markdown 或自然语言，失败 session 会保留下来。`evidence.line` 超界则需要回到当前源码，区分旧文件引用、幻觉和外部修改。

这次的 `report.json` 和 session 能帮你把 taskId、sessionId、工作目录、模型、文件证据对起来。拿它们确认正常路径以后，还可以故意把目标改成“只输出一句话”，试试契约校验会怎么处理。不符合契约，就看失败诊断、终态和资源释放是否正确；模型要是仍按宿主要求交了合法 JSON，也别勉强算成格式拒绝路径已经测过。没有凭据，这两次真实请求就都留作待验证。

## 9.3 明确组装模型、工具与资源

“我这里明明能跑”，到了 SDK 集成也一样常见。同一段代码换台机器，工作目录、个人配置和资源发现都可能不同，工具和指令自然跟着变。光盯着 prompt 找原因，很可能找错了地方。服务进程要把这些来源显式装配起来，才能知道每次到底给了 Agent 什么。

主 harness 由 [sdk.ts](../../projects/03-sdk-harness/src/harness/sdk.ts) 装配，可选的 MCP 入口在 [mcp-session.ts](../../projects/03-sdk-harness/src/harness/mcp-session.ts)。两者分开，是因为加入外部工具会改变 session 实际拥有的能力。

### 将默认来源改为显式输入

直接调用 `createAgentSession()` 时，工作目录、个人设置、模型凭据和资源发现会进入默认装配。开发者安装过的扩展可能存在于本机，却不存在于服务运行账户下。SDK 为这些来源提供独立注入点：`modelRuntime`、`settingsManager`、`sessionManager`、`resourceLoader` 与工具选择。细节可看官方文档：[SDK 配置边界](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/sdk.md#configuring-a-session)

本例要求 `workspace` 真实存在，由调用者传入 provider/model；模型配置路径可以为 `null`。会话和产物写入本次任务目录，个人扩展、Skills、Prompt Templates 和 AGENTS 均不自动加载。指令由宿主提供的 system prompt 决定，工具按角色选择：

```typescript
const canWrite: boolean = role === "root" && spec.allowWrite;
const tools: string[] = canWrite
  ? ["read", "grep", "find", "ls", "edit", "write"]
  : ["read", "grep", "find", "ls"];
```

只有 `role === "root"` 且 `spec.allowWrite` 时，名单才包含 edit 和 write；其他角色均只有四个只读工具。Pi 1.4.0 的 `createAgentSession({ tools })` 在这里接收名称或名称模式，`createReadTool()` 返回的对象数组不适用于此处。需要实际工具对象的接口才使用工具构造函数，位置见 [官方工具配置示例](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/examples/sdk/05-tools.ts)。

### 固定资源发现

`explicitResources()` 实现官方 `ResourceLoader` 接口，返回空扩展、空 Skills、空模板和本程序的 system prompt。需要保留标准目录发现时，可使用 `DefaultResourceLoader` 覆盖特定项目，无需复制加载器或修改私有字段。细节可看官方文档：[Full Control 示例](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/examples/sdk/12-full-control.ts)

这样装配后，交互式 Pi 里装过的 package、副本中的 AGENTS，都不会自己跑进上下文。任务确实需要项目规则，就先读过内容，再通过明确的 `ResourceLoader` 输入加入并留下来源。进入 system prompt 的规则具有约束效力，仅供分析的仓库材料则按材料处理，整份文件不必无条件获得同样的地位。

在本章项目根目录运行 self-check：

```bash
npm run example -- --self-check
```

看看只读 session 的名单，应该恰好是 `read,grep,find,ls`。要是多出了 `bash`、`write` 或委派工具，就得回头查工具和资源输入。工具已经递到手里，再在 prompt 上贴一句“请勿写入”，可收不回来。

### 自定义 endpoint 也要显式配置

模型也从显式配置进入。可信配置放在 `.pi/provider-models.json`，通过 `--models` 传入。下面仅为字段示意，使用前需要按服务实际情况替换地址和模型 ID：

```json
{
  "providers": {
    "course-provider": {
      "baseUrl": "https://YOUR_ENDPOINT/v1",
      "api": "openai-completions",
      "apiKey": "$COURSE_API_KEY",
      "models": [{
        "id": "YOUR_MODEL", "name": "Course model",
        "reasoning": false, "input": ["text"],
        "contextWindow": 32768, "maxTokens": 4096
      }]
    }
  }
}
```

`apiKey` 中的 `$COURSE_API_KEY` 执行环境变量插值，去掉 `$` 后的 `COURSE_API_KEY` 会成为字面值。示例的 `contextWindow:32768` 与 `maxTokens:4096` 是教学保守配置，使用时仍须不高于服务真实支持范围。价格未知时省略 `cost`，报告对应 `estimatedCostUsd:null`；目录里填着默认 0，不能当成服务商请客的凭证。细节可看官方文档：[Models Configuration](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/models-configuration.md)

这里的 runtime 不读取个人 `auth.json`，也不刷新远程模型目录，已配置 provider 的认证可以从环境解析。现有失败记录主要保留 SDK 返回的错误摘要，未单独采集原始 HTTP 状态。排查 endpoint 兼容差异时，补充能取得的状态码和脱敏响应，对照服务文档设置 `compat`；环境、请求头和密钥留在日志之外。兼容开关逐项调整，才容易看出是哪项配置起了作用。

### 加入 MCP/Codemode 的正确位置

CLI 内置加载 MCP、Codemode 和 tool_search，SDK session 不自动装载它们。`mcp-session.ts` 演示显式引入三个 factory：

```typescript
extensionFactories: [
  createCodemodeExtension({ mode: "on" }),
  createToolSearchExtension(),
  createMcpExtension(),
]
```

factory 注册之后还没有建立 MCP 连接。`await loader.reload()` 加载资源，创建 session 后的 `await session.bindExtensions({})` 才触发 `session_start`，进而开始连接。工具激活由 `settings.defaultTools` 声明；额外传入只含本地名称的 SDK `tools` allowlist，可能改变 MCP 工具的可达范围。完整装配见 [官方 MCP SDK 示例](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/examples/sdk/14-codemode-mcp.ts)。

课程可选 factory 关闭项目信任，只读取显式 `agentDir` 的 MCP 配置，不自动加载文件扩展。外部工具会带来新的能力与预算需求，因此它没有接入默认主 harness，也不会交给 scout/reviewer。Codemode VM 限制脚本自身，注入工具仍可能访问网络、磁盘和凭据；加入它们后，需要重新核对权限，原来四个只读工具的判断已不够用。

### 按装配顺序缩小问题范围

装配出了问题，用不着每回都请模型修一次 bug。创建对象都失败了，就查本地接口和依赖；工具名单不对，就查资源发现和工具选择；目录里没有目标模型，就回到模型配置。把这些本地环节接通，再发一条最小真实请求检查认证、连接与生成，错误会好找得多。

可选 MCP factory 的本地记录实际覆盖了创建、`bindExtensions()` 与释放，名单中出现了本地只读工具、codemode 和 tool_search。当次没有配置 server，模型请求也为 0，因此只能确认装配。连接实验需要按第 07 章准备受控 server，把配置放入实验 `agentDir/mcp.json`，由可选 factory 创建 session，确认连接后请求一个实际只读工具；factory、连接状态、暴露模式和调用结果共同构成这次实验记录。

长期连接跟着 session 启动，也要跟着它释放，免得任务已经散场，连接还在占座。多个任务可以复用明确的模型访问配置；扩展里会变化的状态，则要留意是否被无意间共用了。共用 runtime 也并不意味着对话、凭据范围和文件权限相同，这些仍需分别核对。

加了模型、工具或资源，原来的预算和审查结论也得重新核对。比如让只读子 Agent 复用带 MCP 的 factory，它可能顺带拿到一批原先没算进去的工具。角色叫“只读”也没用，名字又不能替你没收工具。

CLI 正常、SDK 却找不到 MCP，就依次检查 factory、`reload()`、`bindExtensions()`、激活设置与配置路径。模型找不到则回到 `--models` 指向的配置。工具读出了范围，就查路径护栏和授予的资源。cwd 只告诉工具从哪里算相对路径，并没有替工作区围上一圈墙。

回头看 MCP 实验，factory 装配、server 连接、实际工具调用各有一项结果，做到哪儿一目了然。没有配置 server 的那次，就只记装配成功，后两项仍是未验证。这样接下来补实验时，不必再猜上次到底通了哪一段。

## 参考资料

- [CLI Integration，v1.4.0](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/cli-integration.md)
- [JSON Event Stream，v1.4.0](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/json.md)
- [RPC Protocol，v1.4.0](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/rpc.md)
- [SDK，v1.4.0](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/sdk.md)
- [Minimal SDK Example，v1.4.0](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/examples/sdk/01-minimal.ts)
- [SDK 实现，v1.4.0](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/src/core/sdk.ts)
- [AgentSession 实现，v1.4.0](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/src/core/agent-session.ts)
- [Tools SDK Example，v1.4.0](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/examples/sdk/05-tools.ts)
- [Full Control SDK Example，v1.4.0](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/examples/sdk/12-full-control.ts)
- [Codemode/MCP SDK Example，v1.4.0](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/examples/sdk/14-codemode-mcp.ts)
- [Models Configuration，v1.4.0](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/models-configuration.md)
