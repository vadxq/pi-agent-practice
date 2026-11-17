# Python RPC 客户端

对应教程第 21 章。这个目录可以单独复制使用，不需要课程根目录或其他项目配合。

先准备 Node.js >=22.19.0 和 Python >=3.11。Python 只用标准库，package.json 负责安装独立的本地 Pi CLI。下面的命令都在本目录执行。

```bash
npm ci --ignore-scripts --cache .pi/npm-cache
npm run typecheck
npm run lint
npm run build
npm test
```

package-lock.json 固定本项目的依赖，运行记录放在本目录 .pi 内。要发送真实模型请求，还需配置自己有权使用的 provider 和模型凭据。

## RPC

填好 COURSE_RPC_PROVIDER、COURSE_RPC_MODEL，并配置对应 provider 的认证，再运行 `npm start`。客户端在 `src/rpc_client.py`，Pi 子进程在自带 sample-repo 中运行。这次只做无工具问答，不修改仓库。

npm test 会启动真实 Pi RPC 子进程，按 ID 收齐两个 get_state 和一个 abort 响应，再回收进程，不发送 prompt。先确认双方能对上话、进程能正常收场。typecheck/lint/build 对 Python 做的是 AST 语法检查；命令虽然叫 typecheck，这里还没有执行 Python 静态类型分析。

## 验证边界

本地检查可以不带模型凭据运行。真实 provider、MCP 调用和容器隔离，要按对应实验实际跑过才有结论；没跑的部分就记未验证。
