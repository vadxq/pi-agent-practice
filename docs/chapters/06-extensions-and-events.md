# Pi Agent实战：06用工具扩展与事件组织研发流程

本章配套项目：[projects/02-workflows](../../projects/02-workflows/README.md)。从课程目录进入这个项目，后面的命令都在项目根目录执行。上一章用的也是这个项目，就继续用原副本；其他项目的依赖和副本不通用。

```bash
cd projects/02-workflows
npm ci --ignore-scripts --cache .pi/npm-cache
COURSE_PROJECT="$PWD"
```

首次使用本项目时运行 `npm run lab:init` 创建自己的 `.pi/labs/shipping`；已有副本时不要重复初始化。本项目不读取第 02 章项目中的副本。

指令和检查方法有地方放了，可 Pi 每次算运费时，还是得去翻源码、找规则、整理行号。这种熟门熟路的活儿，完全可以做成一个工具，让它一次把材料拿齐。顺便再加上停工提醒和验收清单，少干几回重复劳动。至于运费到底算对没有？扩展可不会抢着盖章，真实验收还得单独跑。

## 6.1 把取证步骤做成工具

这个工具叫 `shipping_contract`，干的活儿其实挺朴素：把课程业务契约和源码预览一股脑儿送回来，带上路径、行号，顺便告诉你预览有没有被截断。普通 read 也能读文件，只是材料怎么整理，每回都得让模型临场发挥。这里把路径规则和输出字段定好，以后取证就省心多了。工具不改代码、不跑 shell，行为验证还是交给 `lab:check` 来办。

### Extension 的加载方式

Pi Extension 是一个默认导出工厂函数的 TypeScript 模块。工厂接收 ExtensionAPI，在其中注册能力；本地 TypeScript 可以由 Pi 直接加载，无需先单独编译。加载前要审阅代码，因为扩展就运行在 Pi 进程里，拥有相同的操作系统权限。细节可看官方文档：[扩展加载](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/extensions.md#create-and-load-an-extension)

工具的完整实现见 [shipping-contract.ts](../../projects/02-workflows/extensions/shipping-contract.ts)，约八十行，沿用官方 [hello 工具示例](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/examples/extensions/hello.ts) 的注册方式，增加输出 schema、取消信号与有界预览。

### 固定输入与输出结构

这个工具只接受空对象作为输入，额外属性会被拒绝，因此调用方不能临时传入 path，要求它改读其他文件。下面展示输出字段；实际路径和预览由读取结果生成：

```json
{
  "sourcePath": "当前练习仓库的src/shipping.ts绝对路径",
  "numberedSource": "带行号的源码预览",
  "truncated": false,
  "expectedRules": ["国内满5000基础费0", "国际基础费2000", "加急额外800"],
  "verification": "not_run"
}
```

实现中，TypeBox schema 约束 parameters 与 outputSchema，注册定义则写明名称、label、模型说明和 execute。返回时，`content` 给模型阅读，`details` 保存结构化附加信息，`structuredContent` 对应输出 schema。宿主直接读 verification 就能知道验证到了哪一步，省得对着一段措辞漂亮的报告猜谜。细节可看官方文档：[工具定义](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/extensions.md#custom-tools)

文件位置固定在 `ctx.cwd` 下的 `src/shipping.ts`，也就是随任务目录解析，而非随扩展代码的位置变化。返回的预览最多 80 行、6000 字符，由 truncated 标明是否截断。取消信号会传给 Node readFile；若读取失败，工具保留带路径的原生错误，不用空结果遮住问题。

### 加载和使用

使用本项目中初始化的 shipping 副本，已修复的版本也可使用。副本尚不存在时才运行 `npm run lab:init`，随后从本章项目根目录执行：

```bash
(cd .pi/labs/shipping && "$COURSE_PROJECT/node_modules/.bin/pi" --no-extensions --no-mcp --no-skills --no-prompt-templates --extension "$COURSE_PROJECT/extensions/shipping-contract.ts" --tools read,shipping_contract)
```

显式扩展路径在 `--no-extensions` 下仍加载，其他自动发现的扩展被关闭；`--tools` 中列出了本次要用的两个工具。细节可看官方文档：[CLI 资源规则](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/cli.md#resources)

在 Pi 输入：

```text
调用shipping_contract，给出国内5000分边界的源码证据。
明确工具没有执行测试；不要修改文件，也不要commit/push。
```

调用出现后，对照输出检查：sourcePath 应指向 `.pi/labs/shipping/src/shipping.ts`，预览应与文件一致，verification 应为 not_run。即使源码里的边界看起来正确，报告也只能写源码判断。测试还没上场，不能提前把通过的奖状发了。

在本章项目根目录运行 `npm run typecheck` 可检查扩展接口，运行时加载与模型是否选用工具则由 Pi 交互验证。没有模型凭据时，记录静态检查结果，并将交互部分标为未验证。

### 错误 cwd 必须暴露为失败

咱们故意站错地方试一回：从本章项目根目录直接加载并调用。这里可没有 `src/shipping.ts`，工具应该老老实实报错，把缺失的路径告诉你。要是它自作主张翻出正式 fixture，表面上看材料递过来了，实际上已经偷偷换题了。这个实现没有什么后备方案，cwd 错了就让错误露出来，方便当场纠正。

一抛出错误，工具结果就会标成失败；要是返回个普通对象，宿主可读不出你想表达失败的意思。数据类工具要保留结构化错误，就按当前 API 的 isError 约定来。千万别在成功消息里写一段报错，那相当于信封上印着喜讯，拆开却是张故障单。细节可看官方文档：[错误与输出约定](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/extensions.md#tools)

`readOnlyHint` 说明的是用途，操作系统权限并没有因此收窄。即使文件名固定，它也可能指向符号链接，实际读取仍使用当前进程权限。因此，本例只用于自己创建的受控副本，不承诺能安全读取任意巨大或恶意文件。接入不可信仓库时，还要处理文件大小、链接和执行边界。

### 分开保存规则、源码与验证状态

为什么要把这三个字段拆开？expectedRules 来自课程作者定义的契约，numberedSource 来自当前文件，verification 交代验证做到哪儿了。要是拿源码里的条件反推业务规则，那个漏掉的等号就可能摇身一变，成了“需求本来如此”。换到真实项目，规则得找维护者确认，课程常量可不能原封不动带过去。

同一版本的源码已经放在请求里，就无需重复调用；文件改过后再重新取证。本实现不保存长期缓存，每次调用都读当前文件，省去缓存版本的判断。前面设置的预览上限只控制传回模型的体积，不能充当文件读取的安全边界。

正常 cwd 和错误 cwd 两次调用放在一起，工具的脾气就看清了：找对地方时，拿回路径、行号和截断状态；找错时，老实报错，文件都不应变化。额外字段也该被 schema 拒绝，或明确判为不符合接口。工具行为对了，报告还混淆规则来源或测试状态，就保持权限不变，只改说明来比较，别急着加更多能力。

## 6.2 用事件和命令接好流程

材料拿齐了，人却未必一直盯着屏幕。加两个小入口会方便不少：想查验收要求？输入 `/shipping-checklist`；Pi 自动干活停下了？让事件处理器吆喝一声。这个提醒相当于”活儿干到这儿了，过来瞧瞧”，至于修复成没成功，还得等验收说了算。

### 用 agent_settled 触发提醒

Pi 在输入、模型请求、工具执行、会话切换和空闲等位置提供事件。要拦截尚未执行的调用，可以用 tool_call；要处理结果，可以用 tool_result。本例的通知选 agent_settled，因为 agent_end 之后还可能有重试、恢复、压缩或排队任务，提醒容易发早。细节可看官方文档：[生命周期与选型表](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/extensions.md#understand-the-runtime-lifecycle)

到了 agent_settled，自动延续已经停止，但运费验收未必执行过。因此通知只写“请检查”，业务完成状态留给第 10 章的宿主判定。细节可看官方文档：[JSON 停止语义](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/json.md#agent-and-turn-events)

### 最小事件处理器

完整可运行文件是 [workflow-reminder.ts](../../projects/02-workflows/extensions/workflow-reminder.ts)。下面是其工作逻辑的独立最小版本，类型来自固定安装包：

```typescript
import type {
  AgentSettledEvent,
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

export default function reminder(pi: ExtensionAPI): void {
  pi.on("agent_settled", (event: AgentSettledEvent, ctx: ExtensionContext): void => {
    if (ctx.hasUI) {
      ctx.ui.notify(
        event.aborted ? "已中止，请检查现场改动。" : "请审阅diff并执行真实验收。",
        "info",
      );
    }
  });
}
```

aborted 决定显示哪条提醒：中止后检查现场，正常停下则审阅 diff、运行验收。`hasUI` 将 notify 限定在有交互界面的场合；JSON/RPC 客户端应读取结构化事件，由宿主记录状态。这里没有发送用户消息，也就不会触发额外模型请求。细节可看官方文档：[ExtensionContext 与 UI](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/extensions.md#use-extension-context)

完整版本还注册了 `/shipping-checklist`，用于显示从本章项目根目录执行的验收命令，以及禁止自动 commit/push 的要求。这个命令本身不执行 shell，没有交互 UI 时会返回具体错误。因此，要分别确认命令有没有调用、清单有没有显示、验收有没有真的运行。显示清单这一步，并没有替你执行验收。

### 加载并观察

沿用前一节已经准备好的 shipping 副本，从本章项目根目录执行：

```bash
(cd .pi/labs/shipping && "$COURSE_PROJECT/node_modules/.bin/pi" --no-extensions --no-mcp --no-skills --no-prompt-templates -e "$COURSE_PROJECT/extensions/shipping-contract.ts" -e "$COURSE_PROJECT/extensions/workflow-reminder.ts" --tools read,shipping_contract)
```

依次观察三条路径：输入 `/shipping-checklist` 应直接显示清单，不请求模型；调用 shipping_contract 解释国内边界，停止后应有审阅提醒；另一次只读分析中按 Escape，应显示中止文案，再检查现场。细节可看官方文档：[命令与资源加载](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/cli.md)

只读任务可能结束得很快，按下取消时已经运行完了，这次就还没有验证到取消路径。如实留下观察结果，再选一次正常的只读分析尝试即可，无需让模型循环空转来等取消。

### 避免重入与资源泄漏

别顺手把 notify 改成自动发送“继续检查”。新任务结束又触发处理器，处理器又派新任务，程序就成了一个永远不肯下班的监工。本例只发 UI 通知；真要自动追加任务，钩子在什么时候触发、最多追加几次、什么条件下停，都得一起想好。

工具可能同时开工，一个“上一个工具”变量装不下这么多来宾，结果要按调用 ID 配对。处理器如果需要共享状态，就先想清楚：并行时谁来用，会话切换时谁来清，再决定把状态放在哪里。

资源创建的位置同样要随生命周期安排。有些调用只加载扩展，并不启动 session；若在工厂里创建长期进程、socket 或 watcher，就会留下没有所属会话的资源。因此，工厂只注册能力，资源放到 session_start 或实际命令中创建，再由可重复调用的 session_shutdown 清理。`/reload` 会替换运行时，旧状态也就不再代表当前 session。细节可看官方文档：[资源生命周期](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/extensions.md#understand-the-runtime-lifecycle)

人能看懂一声提醒，机器却不能靠这句话结账。认证失败会进入空闲，只读分析也会，界面甚至可能已经关了，不同 session 还可能显示同样的文字。机器客户端需要的是结构化数据：运行了哪条验收命令、退出状态是什么、对应哪个执行版本、证据存在哪里。

事件日志可以用任务与调用标识串起记录，以阶段和时间交代顺序，再用结果类型区分成功、失败或中止。文件内容与完整参数可能含敏感信息，记录时要选择必要字段，不能无条件整份写入。

### 边界与排错

没收到提醒，先查扩展有没有加载、当前是不是交互模式、agent_settled 有没有到。任务还没停下，就继续检查模型请求或自动恢复。提醒出现多条时，则查重复加载、多个 session 和多次运行，直接吞掉重复通知会把原因一起藏住。

清单上写着“不允许危险操作”，还不等于工具调用已被拦截。以后即使用 tool_call 阻止某些名称，也要考虑其他执行路径，它无法提供完整隔离。这个扩展的职责止于通知，企业权限控制需要的边界留到后续执行环境章节处理。细节可看官方文档：[扩展权限](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/security.md)

这两个小入口接好以后，再跑一遍四类 Eval，看看它们有没有干扰原来的任务。正常和取消通知都留下记录，清单命令不该请求模型，通知不该又派新活，也不能冒充测试结果或留下后台资源。提醒做到恰好够用，才省得后面还要专门管理提醒本身。

## 参考资料

本章按 Pi 1.4.0 核对，资料核对日期为 2026-10-23。

- [Extensions：注册、工具结果与权限](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/extensions.md)
- [官方 hello 工具示例](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/examples/extensions/hello.ts)
- [固定版本 Extension 类型](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/src/core/extensions/types.ts)
- [CLI：显式扩展加载](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/cli.md)

- [JSON Events：agent_settled 与 agent_end](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/json.md)
- [Security：扩展执行权限](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/security.md)
