# Pi 工作流包

对应教程第 05、06、07、08 章。可以把这个目录单独复制出去使用，不用连课程根目录和旁边的项目一起搬走。

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

## 加载工作流

```bash
COURSE_PROJECT="$PWD"
(cd .pi/labs/shipping && "$COURSE_PROJECT/node_modules/.bin/pi" -e "$COURSE_PROJECT" --no-mcp --tools read,shipping_contract)
```

`extensions/` 负责源码取证和事件提醒，`prompts/` 和 `skills/` 保存审查步骤，省得每次开工都重新交代。工具从 Pi 的 cwd 读取 src/shipping.ts；输出 not_run 就是还没执行行为验收，拿到源码不能顺手给测试盖章。

第 07 章的 MCP 实验另需 Node >=24。将 mcp.example.json 复制到练习副本 .pi/mcp.json，并建立 project trust。npx 会启动固定的 filesystem server 2.0.0。包设置为 private=true，不会自动发布。

`npm run self-check` 会用真实资源加载器检查两个 Extension、一个 Skill 和一个 Prompt Template。这一步只查资源加载，不需要模型凭据。

## 验证边界

本地检查可以不带模型凭据运行。真实 provider、MCP 调用和容器隔离，要按对应实验实际跑过才有结论；没跑的部分就记未验证。
