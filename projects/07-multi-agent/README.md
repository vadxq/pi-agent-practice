# 多 Agent 计划实验

对应教程第 18 章。这个目录可以单独复制使用，不需要课程根目录或其他项目配合。

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

新副本放在 `.pi/labs/shipping`。第一次 lab:check 应退出 1：国内 5000 分的普通和加急两项失败，其余 10 项通过。这是准备好的缺陷起点。修好副本 src/shipping.ts 的阈值，再跑同一检查，应该全部通过。

`fixtures/sample-repo/src/shipping.ts` 放参考实现，`starter/shipping.ts` 放故障起点，宿主验收保持原样。初始化不会覆盖已有副本，重练时用 `npm run lab:init -- --name shipping-next`，后续检查对应指定 `lab:check -- --workspace .pi/labs/shipping-next`。

## 计划校验

```bash
npm run plan:check
```

`plans/shipping.json` 定义代码、说明和整合节点。校验会拒绝未知依赖、环、重复节点、未授权路径和超限节点，再输出哪些节点可以先做、哪些得等一等。它负责检查排班表，还不会真的派出 Agent。

工作区快照、模型调用、补丁整合、预算和失败恢复，还需要按第 18 章的设计实现。计划校验只是其中一步，完整 DAG 调度器尚未接好。

## 验证边界

本地检查可以不带模型凭据运行。真实 provider、MCP 调用和容器隔离，要按对应实验实际跑过才有结论；没跑的部分就记未验证。
