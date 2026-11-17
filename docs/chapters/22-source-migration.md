# Pi Agent实战：22 源码导航与复杂迁移案例

本章配套项目：[projects/08-agent-core](../../projects/08-agent-core/README.md)。从课程目录进入这个项目，后面的命令都在项目根目录执行。同一个项目可以接着用原副本，其他项目的依赖和副本不共享。

```bash
cd projects/08-agent-core
npm ci --ignore-scripts --cache .pi/npm-cache
```

升级依赖，编译器突然指着 `shouldStopAfterTurn` 说“属性不存在”，这时候最诱人的办法，大概是找个类型断言把红线压下去。可红线不见了，行为未必还对。报错里的类型、固定版本的 Changelog、替代 API 的调用位置，正好能连成一条查证路线：旧选项为什么没了，新 hook 何时执行，错误响应会不会闯进原来的业务逻辑。

## 按出错的接口定位包

查源码前，先认一下各个包负责哪摊事：pi-ai 提供模型与流，agent-core 提供工具循环，coding-agent 提供编码会话与入口。服务身份、业务状态和队列还是宿主的事，不在这些包里代管。因此，AgentOptions 的类型错误先查 agent，AgentSession 的 prompt 行为先查 coding-agent，provider 请求格式先查 ai。

遇到“任务结束了，但进程还在工作”，则沿这几层继续追：循环退出了吗，session 还在恢复吗，宿主等到清理完成了吗？同一句“结束”，在不同层说的可能不是同一件事，得先认清是谁喊的。

在官方源码仓库根目录中，固定到 v1.4.0 后搜索：

```bash
rg -n 'waitForIdle|finishTurn|subscribe' packages/agent/src
rg -n 'agent_settled|abort|promptAndWait' packages/coding-agent/src
rg -n 'createAgentSession|SessionManager' packages/coding-agent/src
rg -n 'registerVirtualModel|ModelRouteRequest' packages/coding-agent/src/core
```

教程仓库没有把上游实现全搬过来。本地资料缓存有相应 src 文件，就直接搜；没有就看固定 tag 的网页。main 上即便已经修好了同一个问题，也不能拿来解释旧版本的行为。你查的是旧案卷，别不小心翻成了今天的新闻。

从公共导出找到类型声明，沿调用位置看实现，再翻相关测试。类型告诉你参数能传什么，实现告诉你什么时候生效，测试则交代上游试过哪些条件。应用自己的队列和业务关系未必在里面，还要带回本地验证。编译器画出的红线，正好可以当作往下查的路标。

## 案例：停止 hook 的迁移

Changelog 里能找到 shouldStopAfterTurn 的去向：它被移除了，替代入口是 finishTurn。读到这里就做全局替换，还是快了点。Agent hook 文档还提到，新 hook 会接收 error 和 aborted 响应。名字变了，接待的客人也多了两类，旧逻辑能不能照办，得再看一眼。细节可看官方文档：[迁移记录](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/CHANGELOG.md)、[Agent hook 说明](https://github.com/earendil-works/pi/blob/v1.4.0/packages/agent/README.md)

假设旧逻辑要求“看到普通回答就停止，不自动继续队列”，可以先把选项改为下面的片段：

```typescript
import type { AgentOptions } from "@earendil-works/pi-agent-core";

const stopAfterNormalTurn: NonNullable<AgentOptions["finishTurn"]> = (
  turn,
) => {
  // 失败与中止保持循环本身的退出语义。
  if (turn.message.stopReason === "error"
      || turn.message.stopReason === "aborted") {
    return undefined;
  }
  return { action: "end" };
};

export const options: Pick<AgentOptions, "finishTurn"> = {
  finishTurn: stopAfterNormalTurn,
};
```

这段代码属于 Agent 构造选项，尚不能独立运行。遇到 error 与 aborted，先返回 undefined，沿用循环本身的退出语义；正常 turn 返回 end，结束本次运行。finishTurn 要等本轮工具结果完成后才调用，再决定后面还要不要调度。它和直接 abort 的生效时机不同，不能只因为都能停下来就互换。

这样停止也可能截断工具后续：Agent 拿到工具结果后，就不再请求模型形成最终回答。采用前先确认应用是否需要这种行为，仓库修改任务尤其不能直接照搬。接着结合订阅等待和 waitForIdle 的实现，检查结束事件的消费者是否完成，让结果落库等收尾工作做完后再退出进程。

旧 predicate 也许还顺手记了账，这笔旧账可不能漏。迁移后没排除错误响应，就可能把失败也算成成功完成。编译器能查类型，却不知道你的记账规矩，所以正常回答、工具调用、错误、取消、队列五种场景都得本地跑一遍，对照停止和记账行为。

## 案例：旧模型导入与新装配

如果报错来自 pi-ai 根入口的旧全局 getModel/stream 导入，先检查安装版本与实际 package exports。当前推荐 createModels 加 provider 工厂，第 19 章给出了显式注册的完整例子。即使仍有兼容入口，新程序也应按当前公开 API 装配。细节可看官方文档：[pi-ai README](https://github.com/earendil-works/pi/blob/v1.4.0/packages/ai/README.md)

同一导入在扩展中能跑、普通 Node 程序中不能跑时，再查扩展加载器是否提供了兼容行为。两种环境要分别验证。扩展能跑，只能给扩展这一栏打勾，还证明不了 SDK 导入也正确。此时仍应使用公开入口；monorepo 的 src 私有路径没有公开契约，直接导入会增加下次升级的风险。

模型装配通过后，继续核对默认工具恢复与资源装配有没有变化。显式工具 allowlist 可能与恢复旧 session 的行为交叉，除了对配置文件，还要看 session 实际开放了哪些工具。名单写得对，现场也得对得上。

## 把源码结论变成回归条件

把每项 API 变化对应到应用中可观察的结果，回归检查才有明确目标。用户未必知道 hook 改了名字，却可能发现工具结果回来后没了下文；模型导入错了，程序会启动失败；资源恢复变了，能用的工具也可能跟着变。为这些结果写出断言，并在记录中先说明受影响的行为，再列“跑全部测试”等验证命令，读者就能判断检查是否覆盖了迁移风险。

先在独立副本中升级，保留 lockfile，再执行类型检查、对应集成验证和第 15 章任务集。session 或 storage 有变化时，在数据副本上检查读取与恢复。回退程序前，也先确认旧版本能读取当前数据；删掉 session 再跑，原本要验证的读取问题也被一起删了。病历没了，不能据此说病好了。

复现如果越绕越长，就把现场缩小：固定模型、移除扩展，不带工具或只留一个，再逐项加回。问题只在真实 provider 上出现，就收集脱敏请求元信息、错误状态和版本，沿外部调用继续查。光在本地策略里翻来覆去，解释不了远端实际返回了什么。

## 迁移记录要让别人能够复查

记录旧版本与新版本、触发错误、变更 API、受影响文件、验证命令、数据影响和回退方法。本例的依据应能沿这条线复查：属性类型错误，Changelog 移除说明，finishTurn 的类型与调用时机，五类场景的本地结果。读者既能找到修改依据，也能重跑验证。

记录中分别写出“官方行为依据”和“本应用验证”。官方测试覆盖它设定的输入与条件，应用接入扩展、队列和执行器后，还可能出现新的异步关系。前一份依据解释为什么要改，后一份结果才说明改完是否适合当前程序。无法调用真实 provider 时，保留类型检查和离线协议结果，同时标明模型集成尚未验证。

可以选择一次 hook 或模型装配迁移完成这份记录，至少保留正常与失败路径的本地结果，以及尚未验证的范围。源码解释接口差异，回归结果说明应用原有行为是否保住，后续维护依靠的是这两份依据。

## 参考资料

- [Pi 1.4.0 Changelog](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/CHANGELOG.md)
- [Agent 公共行为与迁移提示](https://github.com/earendil-works/pi/blob/v1.4.0/packages/agent/README.md)
- [Agent 源码](https://github.com/earendil-works/pi/blob/v1.4.0/packages/agent/src/agent.ts)
- [AgentSession 源码](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/src/core/agent-session.ts)
- [pi-ai API 与 provider 装配](https://github.com/earendil-works/pi/blob/v1.4.0/packages/ai/README.md)
