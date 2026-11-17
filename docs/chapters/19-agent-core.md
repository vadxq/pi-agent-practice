# Pi Agent实战：19 使用 agent-core 掌控循环

本章配套项目：[projects/08-agent-core](../../projects/08-agent-core/README.md)。从课程目录进入这个项目，后面的命令都在项目根目录执行。同一项目的副本可以沿用，其他项目的依赖和副本不通用。

```bash
cd projects/08-agent-core
npm ci --ignore-scripts --cache .pi/npm-cache
```

前面的 SDK 把循环接好了：模型要工具，执行器交回结果，模型接着回答。要是你想改“结果回来后还要不要继续请求模型”这类调度，就得往下一层看。@earendil-works/pi-agent-core 提供消息、工具、模型流和运行循环，会话、认证与工具装配留给应用接。这一层给了你更多动手的空间，也把更多接线工作交回你手里。

## 先确认要改的是循环

coding-agent SDK 已经替你装好会话、资源发现、编码工具和压缩。只想加个超时，用这一层就行，犯不着为换个门铃把整栋楼拆了。改用 agent-core，任务记录、仓库工具、认证存储、结果包都得重新接，还得长期维护。

要改 turn 完成后的调度、转换自定义消息，或研究工具怎么执行，再考虑往这一层走。固定版本的 Agent 提供 prepareRequest、finishTurn、beforeToolCall 和 afterToolCall 等边界，但持久化、预算和隔离仍由应用负责。细节可看官方文档：[Agent README](https://github.com/earendil-works/pi/blob/v1.4.0/packages/agent/README.md)

## 建立一个无工具循环

先运行无工具问答，检查模型请求、文本流和结束清理。完整程序已提供在 `src/main.ts`。它使用 Anthropic 官方 provider 工厂，凭据通过该 provider 支持的环境变量配置；COURSE_CORE_MODEL 必须填写实际有权限使用的模型 ID。

```typescript
import { Agent, type AgentEvent } from "@earendil-works/pi-agent-core";
import { createModels } from "@earendil-works/pi-ai";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";

const modelId: string | undefined = process.env.COURSE_CORE_MODEL;
if (!modelId) throw new Error("Missing COURSE_CORE_MODEL");

const models = createModels();
models.setProvider(anthropicProvider());
const model = models.getModel("anthropic", modelId);
if (!model) throw new Error("Unknown Anthropic model: " + modelId);

const agent: Agent = new Agent({
  initialState: {
    systemPrompt: "解释运费规则。没有工具执行证据时，不声称修改或测试通过。",
    model,
    tools: [],
  },
  streamFn: models.streamSimple.bind(models),
  toolExecution: "sequential",
});

const unsubscribe: () => void = agent.subscribe((event: AgentEvent): void => {
  if (event.type === "message_update"
      && event.assistantMessageEvent.type === "text_delta") {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});
const timeoutMs: number = 30_000;
const timer: ReturnType<typeof setTimeout> = setTimeout((): void => {
  agent.abort();
}, timeoutMs);

try {
  await agent.prompt("国内订单满5000分免基础运费，否则收500分；加急另加800分。国内订单5000分且加急，应收多少运费？");
  await agent.waitForIdle();
  const failed: boolean = agent.state.messages.some((message): boolean =>
    message.role === "assistant"
    && (message.stopReason === "error" || message.stopReason === "aborted")
  );
  if (failed) throw new Error("Agent response failed or was aborted");
  process.stdout.write("\n");
} finally {
  clearTimeout(timer);
  unsubscribe();
}
```

从项目根运行 `npm start`，应看到文本逐步输出，回答总运费 800 分。tools 为空，模型只能解释规则。答案算对了，也只说明这道口算题答对了；程序没有修改仓库，更没有执行行为测试。

代码先用 createModels 建立模型实例，再显式注册 provider。这是当前 pi-ai API 的装配方式；旧教程中的全局 getModel/stream 导入可能属于兼容入口，迁移时应对照固定版本文档。细节可看官方文档：[pi-ai 模型实例](https://github.com/earendil-works/pi/blob/v1.4.0/packages/ai/README.md)

接着将 COURSE_CORE_MODEL 改成不存在的 ID，检查程序是否在请求发出前失败；再移除 provider 凭据，观察实际错误状态。判断结果时，输出和 stopReason 都要看。没有输出，不能算作默默完成；error 或 aborted 都要报告失败。无效模型 ID 会在创建计时器和订阅前报错；进入 try 后，无论运行正常结束还是失败，都由 finally 释放这两项资源。

## 收到结束事件后，为什么还要等待

示例里的监听器只输出文本。如果换成异步写数据库，结束通知到了，后面的活可能还没做完。Agent.subscribe 会按注册顺序等待监听器；agent_end 表示低层循环不再发事件，等异步监听器全部完成才会 settle。一收到 agent_end 就退出进程，可能把最后一次写入截在半路，留下半份收尾。细节可看官方文档：[事件与低层 API](https://github.com/earendil-works/pi/blob/v1.4.0/packages/agent/README.md)

原始 agentLoop 的流主要供观察，异步消费者没有同样的等待保证。假设 message_end 的消费者负责写数据库，后续工具又要读这条记录，生产者可能已经进入下一阶段，数据库却还在埋头写上一条。这种依赖应使用 Agent 的等待语义，或者由应用设置提交屏障，等写入完成再往下走。

等待放错位置，还会把自己锁住。agent.waitForIdle 要是写在监听器里面，Agent 等监听器返回，监听器又等 Agent 空闲，两边客客气气地“你先请”，程序却谁也不走。示例把 waitForIdle 放在监听器外面，等整次运行收尾。

增加工具后，还要留意并发下的事件顺序。默认 parallel 允许工具并发完成，持久化的 toolResult 仍保留模型给出的来源顺序。收到第一个 tool_execution_end，只说明一个工具完工了，其他工具可能还在忙，不能替它们一起宣布下班。共享写操作应显式选择 sequential，或采用更细的宿主调度策略；上面的例子已设置 sequential。

## 加入一个计算工具

保留无工具版本作为对照，第一个工具只做运费计算：输入整数金额、枚举地区和显式加急标志，输出结构化金额及简短文本。执行前拒绝错误参数，完成后记录调用 ID 与结果。依次观察正确参数、错误参数、工具失败和取消，就能检查一次调用的完整契约。

刚开始把工具范围收小一点，出了问题才容易分清是循环没接好，还是执行器出了错。加入文件读取后，要处理路径和输出大小；加入写入后，还要处理基线检查和隔离。直接开放通用 bash 会把仓库执行风险一并带进来，难以观察单纯的循环行为。

加一个工具，也可能多出一次模型请求。常见过程是模型给出 toolCall，执行器返回 toolResult，再请求模型组织回答，至少走两次。你只发了一条 prompt，账单却可能分几轮记。第一轮已经用完预算，就留下工具结果停下；“再帮我总结一句”也得请求模型，不能当免费赠品。

## 区分请求上下文和任务记录

应用保存的消息，有些只供界面使用，比如排队百分比和工具面板开关。这类自定义消息可以通过 convertToLlm 过滤或转换，无需全部发送给模型。工具调用与结果则要保留协议要求的对应关系；为了省点请求长度随手删掉一个 toolResult，可能让调用和结果对不上，provider 也可能因此拒绝后续上下文。

transformContext 决定本轮发出哪些信息，宿主存储保留原始任务与证据。请求预算不足时可以裁掉旧文本，同时保留审计记录，继续遵守任务约束。分开保存这两份数据，之后既能查原始经过，也能还原模型当时看到了什么。

## 停止循环与停止工具

finishTurn 可以返回 end 或 continue，但必须先处理 error 和 aborted 响应。无条件 continue，会让循环一直转下去；只限制轮数，也管不住费用上限，每轮用量可能差不少。重试、工具输出大小、消息转换与外部副作用仍需各自的约束，这个 hook 无法代替它们。

取消要沿着调用链走到工具：工具响应传入的信号，资源退出后，waitForIdle 才应完成。如果工具忽略信号、外部进程仍在运行，即使已经调用 abort，Agent 也无法靠 JavaScript 状态强制结束它，回收工作仍由工具执行器负责。

想知道换这一层值不值，让它和 coding-agent SDK 都做无工具问答，再做相同的受限工具任务，输入和验收保持一致。别拿一句问答的耗时，去跟一次仓库修改比。少了默认装配，启动工作可能变少；把 session 持久化、压缩、工具、认证、资源发现和报告一项项补回来，也有成本。现有 SDK 已经管得住的事，继续用它通常更省维护代码。

## 参考资料

- [Pi 1.4.0 agent-core](https://github.com/earendil-works/pi/blob/v1.4.0/packages/agent/README.md)
- [Agent 实现](https://github.com/earendil-works/pi/blob/v1.4.0/packages/agent/src/agent.ts)
- [Agent loop 实现](https://github.com/earendil-works/pi/blob/v1.4.0/packages/agent/src/agent-loop.ts)
- [pi-ai 模型与 provider](https://github.com/earendil-works/pi/blob/v1.4.0/packages/ai/README.md)
