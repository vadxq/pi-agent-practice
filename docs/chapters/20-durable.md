# Pi Agent实战：20 Pi Durable 与长任务

本章配套项目：[projects/09-durable](../../projects/09-durable/README.md)。从课程目录进入这个项目，后面的命令都在项目根目录执行。同一个项目可以沿用已有副本，其他项目的依赖和副本各自独立。

```bash
cd projects/09-durable
npm ci --ignore-scripts --cache .pi/npm-cache
```

session 留下了聊天记录，却不能靠聊天记录把没干完的活儿接着跑。进程一退，正在等的模型请求和工具调用都得重新安排。Pi Durable 接过这部分工作：把它们组织成持久任务，让进程重启后能找回任务、恢复调度。

Durable 1.4.0 明确标为 Experimental，API 可能在版本间无预告变化。一个 storage 同时只能由一个进程拥有，而且没有跨进程锁。让两个副本挤进同一个数据库，凑出来的是两个 owner，可不是什么高可用。细节可看官方文档：[Durable README](https://github.com/earendil-works/pi/blob/v1.4.0/packages/durable/README.md)

## 从保存历史到恢复工作

普通 session 保存已经发生的事，下一步由外层任务管理。Durable 把会话、模型生成、工具调用和自定义状态也纳入持久任务，通过提交与 checkpoint 来恢复工作。它基于 pi-ai 和 Chord，使用自己的 Harness、Conversation、Submission 与 storage API。迁移时，工作和状态都得按这套 API 重新安排。只把 AgentSession 的类名换个样，就像只换门牌号，屋里的水电管线还没接上呢。

最难接的，往往是”事儿做了，账还没记”的那一刻。工具已经改了外部系统，进程却来不及保存结果，数据库里空着一格，也不能据此认定啥都没发生。只有声明 replay: safe 的工具才会在中断后重跑。转账、发消息能不能再来一次，还得证明外部服务有操作级幂等；给工具贴个 safe 标签，可不会让收件箱自动认出重复邮件。细节可看官方文档：[工具 replay 语义](https://github.com/earendil-works/pi/blob/v1.4.0/packages/durable/README.md#tools)

## 先检查提交去重

先安装固定版本。从项目根执行，依赖和数据库都留在实验目录：

```bash
npm ci --ignore-scripts --cache .pi/npm-cache
npm test
```

配置 OpenAI provider 的认证，并把 COURSE_DURABLE_MODEL 设为实际可用的模型 ID。程序已提供在 `src/main.ts`，核心实现如下：

```typescript
import { mkdir } from "node:fs/promises";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { AssistantEntry, createRegistry, Harness } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";

const modelId: string | undefined = process.env.COURSE_DURABLE_MODEL;
if (!modelId) throw new Error("Missing COURSE_DURABLE_MODEL");
const context = BACKGROUND_CONTEXT;
const models = createModels();
models.setProvider(openaiProvider());
await mkdir(".pi", { recursive: true });
const storage = await openNodeSqliteStorage(".pi/session.sqlite");
const harness = await Harness.open(
  storage, { models, registry: createRegistry() }, context,
);

try {
  const root = await harness.root(context, {
    agent: { model: { provider: "openai", modelId } },
  });
  harness.resume();
  const submission = await root.submit({
    type: "input",
    content: "解释国内订单5000分免基础运费、加急另加800分的规则。",
    requestId: "shipping-rule-001",
  }, context);
  console.log({ submissionId: submission.id });
  const settled = await submission.wait(context);
  if (settled.status !== "done" || settled.type !== "input") {
    throw new Error("Durable input unanswered: " + JSON.stringify(settled));
  }
  const answer = await root.commit(
    (tx) => tx.entry(AssistantEntry, settled.answer), context,
  );
  if (!answer) throw new Error("Committed answer entry is missing");
  console.log(answer.model?.[0]);
} finally {
  await harness.close(context);
}
```

从本章项目根目录运行 `npm start` 两次，比较打印出的 submissionId。相同 requestId 应找回原 submission，不能追加第二份输入。输入内容变了，宿主就得先做比较，不能拿旧 key 来给新请求冒名登记。

这次程序打开的仍是同一个 root，沿用第一次创建时的模型配置。后来再改环境变量，已有配置不会跟着改。重开会话时先看清用的是哪份配置，别以为改了变量，老会话就已经换了模型。

## 在生成期间终止进程

去重检查已经完成的 submission 不会再次生成回答。做中断实验时，使用已提供的 `src/recovery.ts`，其中的数据库路径为独立的 `.pi/recovery.sqlite`，保留前一节的数据库。

从本章项目根目录运行 `npm run recovery`。第一次打印 submissionId、模型尚未完成时终止进程，确认进程已退出，再运行这份程序。恢复时保持 storage、registry 和 requestId 不变，resume 才能找回已接纳的工作并重新调度。记录两次 PID、submissionId、终态和请求用量；如果终止前回答已经完成，这次就没截到生成中途，需要换一个新的独立数据库再试。任务都做完了才终止进程，自然测不到做到一半会怎样。

进程中断，也不代表 provider 跟着停工。它可能已经处理了请求，恢复时又发一次，模型费用就可能多一笔。这个程序没带工具，实验覆盖的是生成和提交的恢复。重启后没动静，就查 resume 有没有调用、registry 里原任务定义还在不在、storage 是不是仍指向上次那个文件。

启动本身失败时，可以先脱离模型排查存储：创建 SQLite storage 和 Harness，取得 root.id，关闭后重开同一文件，再比较 root.id。这一步只查路径、存储初始化和重新打开。存储能打开，不等于模型任务能续上，后者还得靠上面的请求中断实验。

## 工具重放需要什么前提

工具实验先从固定文件读取开始，再换成一个外部计数器：计数已经加一，结果尚未提交，此时让进程退出。如果没有幂等 key，重放会再加一次，这就能看出声明 safe 前需要解决什么。副作用更复杂时，还要约定如何记录操作、如何向外部系统查询结果。

requestId 用于提交去重，具体结果取决于请求是否已被接纳。客户端没收到响应时，请求可能尚未被接纳，重试便会新建 submission；也可能已经持久化，此时相同 key 应找回原记录。接入实际服务时，还要把 key 和用户身份、业务任务关联起来，免得不同用户拿着同一个全局 key 认领了彼此的任务。

等很久再继续，也不能只靠一个 setTimeout：进程没了，这段等待状态也没保存。Durable 可以通过 checkpoint 进入持久睡眠，到截止时间再恢复。但它不是给程序按了一个“原地暂停键”，同一任务阶段恢复时可能从头执行。所以睡醒后的工作放到下一阶段；同一阶段已经做过的外部写入，也得按可能重跑安排，别指望总能从 await 下一行接着走。

## 取消等待、停止会话与关闭存储

“我不等了”和“你别干了”，在这里是两个动作。Chord Context 取消 wait，调用方可以先走，持久任务却可能还在后台忙。要停会话，得调用文档规定的 conversation.abort，再等到空闲。父函数返回，只说明调用方等完了；后台工作有没有停，要查任务自己的状态。

关闭 Harness 又是另一个动作。close 会等待正在执行的任务代码返回，忽略取消信号的工具会拖延关闭；强制终止进程则没有机会清理。分别尝试优雅关闭和进程崩溃，记录关闭耗时、最终任务状态，以及重开后是否发生新的 provider 请求。两种实验都会产生可恢复状态，但证明的内容不同。

持久子任务也有归属：任务拥有的子任务会参与取消和失败传播，后台任务则有不同边界。增加子任务前，阅读官方 child-tasks 示例，再与第 11 章的宿主父子管理逐项对照。字段名字看着相似，也不能直接认亲，两套生命周期要逐项接好。

遇到存储错误，Harness 会失败并关闭，须重新打开才能恢复，不会自动无限重试。若发现两个进程打开了同一个数据库，先修正所有权安排：SQLite 虽有文件锁，Durable 仍不支持多 owner。SQLite 后端的 WAL 和 synchronous=NORMAL 对进程崩溃与主机掉电也有不同保证，本机 kill 实验只能说明它测到的中断情形，证明不了掉电也零丢失。细节可看官方文档：[存储与错误](https://github.com/earendil-works/pi/blob/v1.4.0/packages/durable/README.md#storage)

升级时在数据库副本上核对包类型、registry 定义和存储内容，原实验文件保留，避免被新版运行过的数据覆盖。连同精确包清单和恢复日志一起保存，下次出错时便能分辨问题来自迁移还是重放策略。

记录里把单 owner、执行环境和没测过的故障写清楚。实验结果只覆盖这些条件，生产可用性和高可用还要另外验证。

## 参考资料

- [Pi Durable 1.4.0 完整文档](https://github.com/earendil-works/pi/blob/v1.4.0/packages/durable/README.md)
- [Durable 规范](https://github.com/earendil-works/pi/blob/v1.4.0/packages/durable/docs/spec.md)
- [Durable 官方测试示例目录](https://github.com/earendil-works/pi/tree/v1.4.0/packages/durable/test/examples)
