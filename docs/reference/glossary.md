# 术语与职责边界

本表统一课程用词。术语描述结合 Pi 1.4.0 的使用方式；“任务”“预算”“业务验收”属于本教程宿主程序的设计概念。

| 术语 | 本教程中的含义 | 容易混淆的概念 |
|---|---|---|
| Model | 接收消息并生成文本、推理或工具调用的模型 | 模型本身不拥有仓库执行权限 |
| Provider | 模型请求协议、认证和模型目录的接入方 | 同一个模型名经过不同端点不保证能力或计费完全相同 |
| Agent | 模型及其工具、设置与持续推进任务的运行循环 | 不是单次聊天接口 |
| Harness | 将模型、工具、上下文、状态和执行环境组织起来的运行系统 | 不等于一段 system prompt |
| Session | Pi 管理的一段会话及其运行状态 | 不等于宿主业务任务；一个任务可关联多个 session |
| Task | 宿主定义的有输入、输出、状态和验收要求的工作 | 会话完成不能自动证明业务验收通过 |
| Tool | 模型可请求执行的具体操作 | 工具描述不是权限隔离机制 |
| Extension | 在 Pi 内执行、注册工具或事件行为的代码 | 加载扩展意味着加载可执行代码 |
| Skill | 按需加载的说明与资源集合 | 文本约束不能替代宿主强制控制 |
| Prompt template | 可重复展开的提示模板 | 不具有独立运行状态 |
| Context | 本次模型请求能看到的消息、工具和资料 | 不是全部持久会话历史 |
| Compaction | 将较早内容压缩为适合继续任务的摘要 | 不承诺完整保存每个约束或细节 |
| Steering | 对正在推进的任务追加方向调整 | 具体送达时机必须按当前接口理解 |
| Subagent | 被委派小任务、有独立上下文的 Agent | 独立上下文不等于独立操作系统安全边界 |
| RPC | 用 JSONL 协议控制独立 Pi 进程 | 需要处理进程、请求响应和异步事件 |
| MCP | 连接外部工具与资源的协议 | 连接成功不等于工具输出可信 |
| Codemode | 让模型编写脚本组合工具调用、筛选结果 | 脚本运行边界不能替代被调用工具的权限控制 |
| Eval | 在固定任务与判据上评估行为 | 模型自评和一次演示都不足以作为唯一判据 |
| Idempotency | 重复提交在业务约定下不产生额外副作用 | 捕获异常并重试不自动获得幂等性 |
| Recovery | 基于证据重新决定如何继续中断任务 | 不等于无条件重放全部调用 |
| Budget | 宿主对时间、调用、输出或费用估算施加的约束 | 缺少价格与结算证据时不能宣称硬性费用上限 |

Pi 的会话、模式与扩展边界可参见 [How Pi Works](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/how-pi-works.md)、[SDK](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/sdk.md) 和 [Security](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/security.md)。
