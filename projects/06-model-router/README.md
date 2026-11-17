# 虚拟模型路由

对应教程第 17 章。这个目录可以单独复制使用，不需要课程根目录或其他项目配合。

先准备 Node.js >=22.19.0，下面的命令都在本目录执行。

```bash
npm ci --ignore-scripts --cache .pi/npm-cache
npm run typecheck
npm run lint
npm run build
npm test
```

package-lock.json 固定本项目的依赖，运行记录放在本目录 .pi 内。要发送真实模型请求，还需配置自己有权使用的 provider 和模型凭据。

## 路由

填好 COURSE_ROUTE_PROVIDER、COURSE_ROUTE_FAST、COURSE_ROUTE_STRONG，告诉路由器去哪里找模型，再运行：

```bash
npm start
```

扩展在 `src/router.ts`：low 找 fast，high 找 strong；工具后续和重试沿用上一物理模型，不在半途换人。npm test 检查的是真实本地模型目录，路由有没有把请求送到指定模型，还要另外发起真实请求来确认。

## 验证边界

本地检查可以不带模型凭据运行。真实 provider、MCP 调用和容器隔离，要按对应实验实际跑过才有结论；没跑的部分就记未验证。
