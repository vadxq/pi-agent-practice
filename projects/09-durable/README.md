# Durable 持久任务

对应教程第 20 章。这个目录可以单独复制使用，不需要课程根目录或其他项目配合。

先准备 Node.js >=22.19.0，下面的命令都在本目录执行。

```bash
npm ci --ignore-scripts --cache .pi/npm-cache
npm run typecheck
npm run lint
npm run build
npm test
```

package-lock.json 固定本项目的依赖，运行记录放在本目录 .pi 内。要发送真实模型请求，还需配置自己有权使用的 provider 和模型凭据。

## 持久任务

准备好 OpenAI 认证，填入 COURSE_DURABLE_MODEL，再运行：

```bash
npm start
npm start
```

比较两次打印的 submissionId。程序使用 `.pi/session.sqlite` 和固定 requestId，重复提交应认回原任务。要试生成期间的中断，运行 `npm run recovery`，它使用独立的 `.pi/recovery.sqlite`；恢复时沿用同一份数据和请求，别拿着新档案找旧任务。

npm test 会实际打开、关闭、重开 SQLite storage/Harness，并核对 root.id，不请求模型。它确认的是存储能否重新打开，生成中断恢复和外部副作用幂等还要另外验证。这份 SQLite 存储仅供单 owner 使用。

## 验证边界

本地检查可以不带模型凭据运行。真实 provider、MCP 调用和容器隔离，要按对应实验实际跑过才有结论；没跑的部分就记未验证。
