# Agent 循环与迁移

对应教程第 19、22 章。这个目录可以单独复制使用，不需要课程根目录或其他项目配合。

先准备 Node.js >=22.19.0，下面的命令都在本目录执行。

```bash
npm ci --ignore-scripts --cache .pi/npm-cache
npm run typecheck
npm run lint
npm run build
npm test
```

package-lock.json 固定本项目的依赖，运行记录放在本目录 .pi 内。要发送真实模型请求，还需配置自己有权使用的 provider 和模型凭据。

## 运行与迁移

配置好 Anthropic 认证和 COURSE_CORE_MODEL，再运行 `npm start`。`src/main.ts` 从无工具问答开始，演示循环、文本流、截止时间和清理，先把这几根线接明白。npm test 只检查本地装配和 idle，真实模型请求另行运行。

`src/finish_turn.ts` 保存第 22 章的迁移选项片段。它会参与编译，自己不会发起模型请求。

## 验证边界

本地检查可以不带模型凭据运行。真实 provider、MCP 调用和容器隔离，要按对应实验实际跑过才有结论；没跑的部分就记未验证。
