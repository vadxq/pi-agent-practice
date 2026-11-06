# 任务评测与证据

对应教程第 15 章。可以把这个目录单独复制出去使用，不用连课程根目录和旁边的项目一起搬走。

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

## 评测

```bash
npm run evaluate -- --workspace .pi/labs/shipping
```

结果保存在 `.pi/evals/latest.json`。评测会执行 12 项真实行为断言，再对照初始化时存入 Git 元数据的树，检查修改有没有越界，staged 和 untracked 文件也会一起核对。

带缺陷的副本应该失败；正确修复且只改了 src/shipping.ts，才应该通过。建立初始 Git 树不会创建 commit。报告分别记录行为检查、修改范围，以及未运行的模型/reviewer。这个项目负责验卷，还没有接入自动调用模型的批量评测流程。

## 验证边界

本地检查可以不带模型凭据运行。真实 provider、MCP 调用和容器隔离，要按对应实验实际跑过才有结论；没跑的部分就记未验证。
