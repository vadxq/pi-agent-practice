# Pi Agent实战：15 评测与运行证据

本章配套项目：[projects/05-evaluation](../../projects/05-evaluation/README.md)。从课程目录进入这个项目，后面的命令都在项目根目录执行。同一项目可以沿用已有副本，其他项目的依赖和副本不通用。

```bash
cd projects/05-evaluation
npm ci --ignore-scripts --cache .pi/npm-cache
```

忙到这儿，难免想问：请了 scout，又加 reviewer，到底比一个 Agent 强在哪儿？两种方案各修好一次，还真看不出来。它们得从相同缺陷出发、接受相同验收，失败尝试也照样算成本，才分得清 reviewer 帮忙揪出了问题，还是只是让大家多等了一会儿。

第 09–11 章 `03-sdk-harness` 项目的 single 模式只做只读分析，写入仅支持 team。该项目的 CLI 可以比较两者的分析证据、耗时与用量；本章的 `05-evaluation` 独立项目负责本地验收，不导入前者的源码或依赖。要比较修复成功率，还得实现具有相同写入范围和验收条件的单 Agent 基线。single 保持文件原样是在遵守只读限制，不能记作修复失败。

## 从边界错误构造任务集

这次不用请模型给自己打分了，运费规则就能直接拿来检查：国内订单 subtotalCents 大于等于 5000 时基础费为 0，否则为 500；国际基础费 2000，加急另加 800。这些规则给出了判据。不过话说回来，几道运费题只能看出部分能力，还撑不起对全部研发工作的评价。

建立以下任务表，每个任务保留独立、干净的初始副本：

| 样本 | 输入目标 | 预期判据 |
|---|---|---|
| boundary | 修复 5000 分临界点 | 4999、5000、5001 的结果正确 |
| expedited | 检查免基础费是否仍收加急费 | 国内 5000 加急为 800 |
| international | 确认国际订单不套国内免邮 | 国际 5000 为 2000 |
| conflict | 同时要求 5000 免邮且收 500 | 指出冲突，不擅自选规则 |
| evidence | 请求报告未运行的验证 | 明确未运行，不能写“通过” |
| cancellation | 在验证前取消 | cancelled、保留 diff、停止子任务 |

前三道题看金额，后三道看它怎么做事。boundary 算对边界就算达标，用不着把参考答案逐字默写；conflict 遇上自相矛盾的规则，可能就应该停下追问，一行也别改。若统一按“有没有补丁”给分，认真指出题目有问题的那位，反倒得了零分。

在本项目根目录运行 `npm run fixture:test` 和 `npm run fixture:check` 可确认正确参考实现及行为检查。下面为 boundary 创建独立的含缺陷副本，名称中的 single 用来标记待比较的方案，并不赋予任何写入能力：

```bash
npm run lab:init -- --name ch24-boundary-single-01
npm run evaluate -- --workspace .pi/labs/ch24-boundary-single-01
```

先确认检查能抓到初始缺陷，再修复、重跑同一检查。尺子得先证明自己量得出差别，后面的分数才有意义。任务工作目录和验收 workspace 都必须指向 `.pi/labs/ch24-boundary-single-01`，避免修改一个副本、检查另一个。

`evaluate` 执行 12 项真实行为断言，并用初始化时保存在 `.git/pi-course-baseline` 的树 ID 核对修改范围，包括 staged 与 untracked 文件。报告写入 `.pi/evals/latest.json`；模型调用、reviewer 和费用分别记为未运行或未知。行为和修改范围检查通过了，也不能顺手替这几项打勾。

其他方案和尝试使用新名称，例如 `ch24-boundary-team-01`、`ch24-expedited-single-01`，同步初始化 name、验收 workspace 与任务目录。已有同名目录就换尝试编号，保留旧现场。每次都从干净缺陷开始；若把 single 修过的文件交给 team，两者面对的就已经是不同任务。

## 每次运行保存什么

每次保存 caseId、attempt、基线版本、harness 配置、物理模型、起止时间、终态、验证状态、费用估算、父子用量与证据路径。以下 JSON 是格式示意，不是实测数据：

```json
{
  "caseId": "boundary",
  "attempt": 1,
  "outcome": "unverified",
  "validation": {"status": "not_run", "exitCode": null},
  "usage": {"inputTokens": null, "outputTokens": null, "costUsd": null},
  "reason": "provider_credentials_unavailable"
}
```

这条记录只表示未运行，没有藏着一个“默认通过”。实际检查缺 npm 依赖，归为 environment_error，补丁对错还不知道；not_run、timeout、assertion_failed 也各记各的。费用不知道，就留 unknown 或 null。填个 0 看着整齐，却会让最缺数据的方案莫名其妙赢下省钱冠军。估算用的价格、缓存信息从哪来，也随结果保存。

让两种方案重复做相同的任务，初始状态、验收条件和时间窗都固定下来，正常样本与故障样本分开报告。小样本写 4/5，比只写 80% 更清楚；每次尝试都有编号，才能核对完整分母。

## 用 trace 找到耗时的位置

一次根任务对应一个 trace，探查、模型请求、工具、验证和 reviewer 分别对应 span。span 的父子关系交代谁触发了谁，taskId/childId/runId 则把相关记录串起来。两个 scout 并行时，墙钟耗时要看父任务实际等了多久，把两者直接相加会重复计算重叠的时间。Trace 与 span 可采用 OpenTelemetry，接入工作由运行 harness 的应用完成。细节可看官方文档：[OpenTelemetry Traces](https://opentelemetry.io/docs/concepts/signals/traces/)

拿一组假设数字算算：单 Agent 用了 8 秒，父子方案用了 15 秒。后者两个 scout 各跑 4 秒、互相并行，父修改 3 秒，reviewer 6 秒，排队 2 秒，墙钟时间就是 4 + 3 + 6 + 2。探查确实省了时间，审查和排队又花回去了；reviewer 要是也没发现额外问题，这类任务就未必值得委派。token 的账也一样，父级总计已经含了子任务，就别再加一次，账单可经不起这么热情的统计。

trace 中只记录工具名、状态、耗时、输出字节数等必要元数据。源文件、prompt、工具参数和完整响应放进受控证据存储，调查时再取用。HTTP 遥测同样要限制采集范围，避免默认收集全部请求头；请求头、URL 查询参数和错误文本都可能含有敏感内容。细节可看官方文档：[HTTP 遥测约定](https://opentelemetry.io/docs/specs/semconv/http/http-spans/)

## 固定成功判据与统计分母

每个样本预先约定自己的 success 判据，单独记录在 `TaskReport.status` 之外。修复样本要求行为检查、修改范围和必需子任务都通过；取消样本正确停止并保留现场，就可以通过评测，任务本身仍记为 cancelled；conflict 则看它是否指出冲突、保持文件不变，初始缺陷可以保留。

检查没执行，就记 unverified；明确没达到样本判据，才记 failed。算总成功率时，把全部计划执行的尝试放进分母，再单独列出环境故障。这样既能看服务能不能用，也能看环境正常时模型做得怎么样。

向 Agent 公开业务规则、允许路径和常规检查，独立边界样本留给运行程序核对最终补丁。验收范围提前冻结；模型若修改测试文件，就记录并单独审查，最终判断还要有修改后测试之外的依据。

核对 conflict 时，不能看见“冲突”二字就给分。还要看它有没有保持仓库不变、指出哪两条规则不兼容，以及哪一条需要澄清。关键词到场了，不代表分析也到场了。evidence 则把报告中的验证状态与执行记录放在一起，看回答是否描述了实际发生的事。

预算紧，就让各方案都跑相同的两个任务，失败现场留着，能看出明显退化也有价值，样本有多小照实说。别让 A 做口算、B 做应用题，再拿平均成本分高下。任务集扩充以后更新版本，旧结果仍归旧版，免得题目换了，却把变化记成模型进步。

路由方案更便宜却失败增多时，把通过任务的成本与全部尝试的成本并列，看看是不是只挑成功请求算账，才显得省钱。模型报表与宿主金额对不上时，则核对缓存价格、失败请求、重试与子任务是否都已计入。日志一旦出现密钥，先停止传播并修复采集范围，处理到采集环节，不能只删 UI 上的一行；跨服务 baggage 也要排除凭证。细节可看官方文档：[上下文传播](https://opentelemetry.io/docs/concepts/context-propagation/)

用现有 CLI 可以从两种模式都支持的只读样本开始，等同等能力的可写单 Agent 基线准备好，再比较完整任务集。成功数、总费用和墙钟耗时都从逐次记录计算，未执行项单列；缺少模型凭据时，先验证 fixture 与结果格式，模型比较保留为 unverified。上面的耗时数字演示了计算方法，实际运行结果见[验证记录](../reference/validation.md)。

## 参考资料

- [Pi 使用量与模型抽象](https://github.com/earendil-works/pi/blob/v1.4.0/packages/ai/README.md)
- [OpenTelemetry Trace 与 Span](https://opentelemetry.io/docs/concepts/signals/traces/)
- [HTTP 遥测敏感字段](https://opentelemetry.io/docs/specs/semconv/http/http-spans/)
- [上下文传播与 Baggage](https://opentelemetry.io/docs/concepts/context-propagation/)
