# SDK 与父子 Agent

对应教程第 09、10、11 章。可以把这个目录单独复制出去使用，不用连课程根目录和旁边的项目一起搬走。

先准备 Node.js >=22.19.0，下面的命令都在本目录执行。

```bash
npm ci --ignore-scripts --cache .pi/npm-cache
npm run typecheck
npm run lint
npm run build
npm test
```

package-lock.json 固定本项目的依赖，运行记录放在本目录 .pi 内。要发送真实模型请求，还需配置自己有权使用的 provider 和模型凭据。

## 运费练习

```bash
npm run lab:init
npm run lab:check
```

新副本会放在 `.pi/labs/shipping`。第一次 lab:check 应退出 1：国内 5000 分的普通和加急两项失败，其余 10 项通过。这正是练习要修的缺陷，先别急着怀疑安装。修好副本 src/shipping.ts 的阈值后，再跑同一检查，应该全部通过。

`fixtures/sample-repo/src/shipping.ts` 放参考实现，`starter/shipping.ts` 放带缺陷的起点。修的是练习代码，宿主验收保持原样。初始化不会覆盖已有副本，想重练就用 `npm run lab:init -- --name shipping-next`，后续检查对应指定 `lab:check -- --workspace .pi/labs/shipping-next`。

## SDK

```bash
npm run self-check
npm run lab:init -- --name shipping-demo
npm run example -- --workspace .pi/labs/shipping-demo --provider YOUR_PROVIDER --model YOUR_MODEL --mode single --goal "只读检查运费阈值"
```

从 `src/harness/index.ts` 的 runHarness 接入，相关类型在 types.ts。self-check 会创建并释放真实 SDK session，先确认对象能正常进出场，不发送模型请求。

要跑完整修复，使用 `--mode team --allow-write`：scout 只读探查，父 Agent 只改 src/shipping.ts，宿主执行固定验收，再由 reviewer 独立审查。写入只允许发生在本项目 .pi/labs 下带标记的独立 Git 副本中。

可选 `--models PATH`、`--retry-transient`、`--timeout-ms`、`--max-model-calls`、`--max-tool-calls`、`--scout-concurrency 1|2`。默认把费用记为未知；只有声明 `--cost-metadata-known` 后，才启用 `--max-cost-usd`。程序不会自动 commit/push。

## 验证边界

本地检查可以不带模型凭据运行。真实 provider、MCP 调用和容器隔离，要按对应实验实际跑过才有结论；没跑的部分就记未验证。
