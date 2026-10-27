# 运费边界练习

对应教程第 01、02、03、04 章。本目录可以单独复制使用，不依赖课程根目录或兄弟项目。

需要 Node.js >=22.19.0。所有命令在本目录执行。

```bash
npm ci --ignore-scripts --cache .pi/npm-cache
npm run typecheck
npm run lint
npm run build
npm test
```

依赖由本目录 package-lock.json 固定，运行记录保存在本目录 .pi 内。真实模型请求需要自行配置有权使用的 provider 与模型凭据。

## 运费练习

```bash
npm run lab:init
npm run lab:check
```

新副本位于 `.pi/labs/shipping`。第一次 lab:check 应退出 1：国内 5000 分的普通和加急两项失败，其余 10 项通过。修复副本 src/shipping.ts 的阈值后，同一检查应全部通过。

`fixtures/sample-repo/src/shipping.ts` 参考demo的实现，`starter/shipping.ts` 是bug的点。不要改宿主验收。已有副本不会覆盖，重练用 `npm run lab:init -- --name shipping-next`，并对应指定 `lab:check -- --workspace .pi/labs/shipping-next`。

## 验证边界

本地检查不需要模型凭据。真实 provider、MCP 调用或容器隔离必须按对应实验实测；未运行的结果不能写成通过。
