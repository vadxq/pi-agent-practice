# Pi Agent实战：17 虚拟模型与任务路由

本章配套项目：[projects/06-model-router](../../projects/06-model-router/README.md)。从课程目录进入这个项目，后面的命令都在项目根目录执行。同一项目的副本可以沿用，其他项目的依赖和副本不共享。

```bash
cd projects/06-model-router
npm ci --ignore-scripts --cache .pi/npm-cache
```

只读搜索用便宜些的模型，难一点的边界修复交给更强的模型，听起来很会过日子。不过，单次请求便宜了，返工几轮可能又花回来，连判断该找谁的分类器也要时间和 token。要知道这笔账划不划算，得记清每次选了谁，拿同一组 Eval 比总成本。

本例先把选择权交给用户：low 用 fast，high 用 strong。暂时不请分类器来判断任务难度，先把这条路由跑明白。

## 用户选中的模型与真正请求的模型

虚拟模型可以理解成模型列表里的一个接待窗口。用户选中这个入口，每次请求前由 route 函数决定具体找哪个物理模型、用什么 thinkingLevel。会话记下用户选的虚拟模型，assistant 消息记下实际干活的物理模型。两份记录对着看，就知道这次窗口把任务转给了谁。细节可看官方文档：[Pi 虚拟模型](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/virtual-models.md)

route 只能选物理模型，不能再转给另一个虚拟窗口。模型不存在、凭据缺失、route 抛错，都会让请求失败。本例就用 low/high 两档，出了问题容易看清是选择、路由实现，还是物理 provider 的事。自动判断难度暂且放一放，prompt 长短可不靠谱：“把这处边界修好”没几个字，里面却可能有不少坑。

## 注册 low/high 路由

从实际可用的模型列表中选择已评测的 fast 和 strong，它们必须属于同一个已配置 provider。三个环境变量分别填写 provider 名称和两个模型 ID，认证沿用已有 Pi 配置。少填一个变量，扩展就直接报错，不会替你猜。

完整扩展已提供在 `src/router.ts`，核心实现如下：

```typescript
import type {
  ExtensionAPI, ExtensionContext, ModelRoute, ModelRouteRequest,
} from "@earendil-works/pi-coding-agent";

function required(name: string): string {
  const value: string | undefined = process.env[name];
  if (!value) throw new Error("Missing routing variable: " + name);
  return value;
}

export default function register(pi: ExtensionAPI): void {
  const provider: string = required("COURSE_ROUTE_PROVIDER");
  const fast: string = required("COURSE_ROUTE_FAST");
  const strong: string = required("COURSE_ROUTE_STRONG");

  pi.registerVirtualModel({
    provider: "course",
    id: "auto",
    name: "Course Router",
    thinkingLevels: ["low", "high"],
    route(
      request: ModelRouteRequest<unknown>,
      ctx: ExtensionContext,
    ): ModelRoute<unknown> {
      const sticky = request.failed ?? request.previous;
      // 同一轮保持模型，避免工具后续意外切换。
      if (request.reason !== "user" && sticky) {
        return {
          model: sticky.model,
          thinkingLevel: sticky.thinkingLevel ?? "off",
        };
      }
      const id: string = request.thinkingLevel === "high" ? strong : fast;
      const model = ctx.modelRegistry.find(provider, id);
      if (!model) throw new Error("Routing model not found: " + provider + "/" + id);
      return { model, thinkingLevel: "off" };
    },
  });
}
```

用户发起新一轮时，route 根据 high/low 查找 strong/fast。工具后续和重试则优先沿用 failed/previous 中的选择，避免同一轮中途换模型。model 和 sticky 的类型交给固定版本 SDK 推导。真遇上 API 差异，就按接口处理，不用类型断言给它盖块布。

入口的 low/high 只负责选模型，传给物理模型的 thinkingLevel 都是 off，这样比较时就少一个变量。Pi 仍会按各模型的能力约束处理该值；同样写着 off，模型的推理能力也未必相同。

配置好三个变量后，从项目根启动：

```bash
npm start
```

分别选择 low 和 high，各发一个简单的只读请求。先看 session 中的虚拟选择，再看 assistant 消息的物理 provider/model，两次应按规则落到 fast 和 strong。course/auto 出现在模型列表里，说明入口已经注册；请求有没有按 route 分配，还得看这两次的实际记录。本项目用于只读路由实验；如需修改任务，先显式准备本项目内的受控业务副本。

## 工具后续为什么沿用原模型

route 的 reason 有 user、continuation、retry 和 direct。一次用户输入之后，模型可能调用工具，收到工具结果，再继续请求。此时换模型可能丢失 prompt cache，还会影响推理签名与上下文衔接，所以本例沿用 previous/failed。细节可看官方文档：[路由触发时机与状态](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/virtual-models.md)

沿用原模型的策略可以调整。比如服务过载时要改用另一个 provider，就把触发切换的错误、允许选择的模型写进规则，再验证切换后的上下文。把切换条件提前写清楚，重试时才不会临时改道，让你对着账单猜这回找了谁。

记录每次 route 的虚拟选择、reason、物理模型和最终用量，包括规划、工具后续与重试。模型 ID 没找到，请求可能压根没发出去。把这类路由错误和物理 provider 的失败分开，别让还没接到题目的模型替配置背锅。

## 排除配置错误，再比较成本

验证时可以耍个小花招：让 fast 和 strong 暂时指向同一个真实模型。low/high 在记录里不同，真正接单的却是同一位。结果即使有差别，也不能怪模型选择；得查扩展加载、会话残留和输入是否一致。把这层干扰排掉，再只换其中一个 ID，重跑相同样本。

遇到配置问题，可以按现象定位：

- course/auto 能列出却不能请求，先检查物理 provider 凭据。
- 模型查找失败，核对模型 ID 和 catalog。
- 实际物理模型不符合预期，同时看 reason 和 high/low；continuation 可能在沿用上一请求的选择。
- 恢复后虚拟入口消失，检查扩展是否仍被加载。虚拟模型不再注册时，Pi 会把最后响应的物理模型作为恢复选择，这也是升级时需要覆盖的情形。

配置确认以后，用第 15 章的六个样本比较 fast、strong 和 router。假设 fast 把 boundary 条件改成 >=，却同时误改了 expedited 分支，reviewer 因此拒绝通过。这次便宜的响应还没有完成修复，后续返工也要计入同一次任务。

路由的账要算到任务结束：通过了几项，全部尝试花了多少，连重试在内等了多久。长会话切进较小窗口，可能得先压缩，还会损失缓存；以后加分类器，它的费用和首 token 前的等待也归父任务。把这些零碎都算进去，再决定这位“会省钱的接待员”值不值得留下。

## 增加阶段状态前，先确定边界

如果需要 plan/build 路由，可以让 route 返回 JSON state 来保存阶段。state 随会话分支保存，直接请求则没有同样的状态语义。推进阶段时，宿主需要核验“计划已经确认”这类事实；模型回答里的一句“开始构建”，还不足以改变状态。

state 已经存好，接下来的模型请求仍可能失败，这两件事未必会一起回滚。因此要分别检查网络失败后的状态、长上下文触发的额外压缩，以及分支恢复后的模型选择和 state 是否属于当前分支。短问答覆盖不到这些条件，实验记录也要与基础路由检查分开。

路由前还要核对物理模型的输入能力和权限。包含图像证据的任务，不能交给不支持图像输入的低价模型继续作答；应拒绝该选择，或采用已声明的其他方案。路由器只负责选模型，不能借换人的机会扩大工具范围、改变工作区权限或绕过父任务预算。配置缺失时准确失败，取消后不再发送待发请求，都是这个入口需要满足的行为。

## 参考资料

- [Pi 1.4.0 Virtual Models](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/virtual-models.md)
- [官方 Jev Router 扩展](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/examples/extensions/jev-router.ts)
- [模型配置参考](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/models-configuration.md)
