# Pi Agent实战：07 MCP与Codemode

本章配套项目：[projects/02-workflows](../../projects/02-workflows/README.md)。从课程目录进入这个项目，后面的命令都在项目根目录执行。同一个项目可以沿用上一章的副本，其他项目的依赖和副本要各自准备。

```bash
cd projects/02-workflows
npm ci --ignore-scripts --cache .pi/npm-cache
COURSE_PROJECT="$PWD"
```

首次使用本项目时运行 `npm run lab:init` 创建自己的 `.pi/labs/shipping`；已有副本时不要重复初始化。本项目不读取第 02 章项目中的副本。

前面的工具是咱们自己写的，遇到已经有人做好的能力，就用不着重新造轮子了。文件读取和目录列举都有现成的 MCP 服务，可以直接接给 Pi 用。接好后，用 Codemode 把两个调用塞进一段脚本：一边读源码，一边列目录，各自保留结果。读文件出了错？目录也不用陪着交白卷。

## MCP 接入服务，Codemode 组合调用

Pi 1.4.0 已经内建 MCP 支持了，不用再搞旧的社区 adapter：stdio 配置用来启动本地进程，HTTP 配置用来连接远端服务。服务接好后，模型可以把 JavaScript 交给 Codemode，让脚本去调工具、整理结果，再把要的输出交回来。MCP 和 Codemode 也能各玩各的，用不着捆绑销售。细节可看官方文档：[Pi MCP](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/mcp.md)、[Codemode](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/codemode.md)

这段 JavaScript 住在 QuickJS 里，手边没有 Node 文件系统，也没有直接网络 API。它想读文件？得向外部工具开口要。本例用的是 tools，Codemode 还提供 models.classify、models.generateImages 等模型接口。不过，脚本在里面待得再规矩，也不代表外面的服务被关进了同一个房间；服务还是按自己的操作系统权限干活。细节可看官方文档：[Codemode 全局 API](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/codemode.md#globals)

## 配置一个受控服务

本例固定使用 `@modelcontextprotocol/server-filesystem@2.0.0`。它要求 Node >=24，比 Pi 自身的下限更高，接入前需要确认本机版本；课程使用的 Node 26.12.1 满足这个条件。细节可看官方文档：[服务官方说明](https://www.npmjs.com/package/@modelcontextprotocol/server-filesystem/v/2.0.0)

从本章项目根目录将配置放进练习副本：

```bash
mkdir -p .pi/labs/shipping/.pi
cp mcp.example.json .pi/labs/shipping/.pi/mcp.json
```

完整配置在 [mcp.example.json](../../projects/02-workflows/mcp.example.json)：

```json
{
  "mcpServers": {
    "coursefs": {
      "command": "npx",
      "args": ["--yes", "@modelcontextprotocol/server-filesystem@2.0.0", "."],
      "env": { "npm_config_cache": ".pi/npm-cache" },
      "timeout": 30,
      "exposure": "hidden",
      "toolExposure": {
        "read_text_file": "codemode",
        "list_directory": "codemode",
        "list_allowed_directories": "codemode"
      }
    }
  }
}
```

配置中的点号把当前练习仓库设为允许目录，npm 缓存则留在副本 `.pi` 内。`exposure: hidden` 先隐藏整个工具集，toolExposure 再向 Codemode 开放三个读取工具。这份配置只决定客户端能看到 coursefs 的哪些工具，整个 session 的工具范围和服务进程的操作系统权限都没跟着缩小。服务本身还带着写工具，只是这里没有把它们开放出来。细节可看官方文档：[工具暴露规则](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/mcp.md#control-tool-exposure)

审阅好配置，用下一节的交互启动命令进入 Pi，执行 `/trust` 保存对当前练习目录的信任决定，再用 `/quit` 退出。下面的独立检查要用到这个已保存的决定。回到本章项目根目录执行：

```bash
(cd .pi/labs/shipping && "$COURSE_PROJECT/node_modules/.bin/pi" mcp list --json)
```

list 应报告 coursefs 的连接与工具，失败时返回非零。首次 npx 需要联网下载，列出服务本身则不要求模型认证。这里 `pi mcp` 会独立解析参数，不接受 `--approve`，所以前一步必须保存信任决定，临时信任还不够。若列表里出现个人服务，说明用户配置也在加载，可以用第 08 章的独立 agent 目录排除干扰。

能在列表里看见服务，说明连接和协议这段路通了。至于模型找不找得到工具、脚本叫不叫得动、拿回来的内容对不对，还得实际走一遍。课程已经测到哪里，可以对照[验证记录](../reference/validation.md)。

## 发现后再调用

连接检查以后，再启用本次所需的内建扩展：

```bash
(cd .pi/labs/shipping && "$COURSE_PROJECT/node_modules/.bin/pi" --approve --no-extensions -e builtin:mcp -e builtin:codemode --no-skills --no-prompt-templates --tools codemode,'mcp__coursefs__*')
```

进入 Pi 后，先让它用 `searchTools` 或 `describeTool` 读取接口定义，确认 path、head 等参数。工具名采用 `mcp__服务__工具` 的格式，本例读文件的工具是 `mcp__coursefs__read_text_file`。启动参数中的 `mcp__coursefs__*` 用来筛选 MCP 工具；如果 `--tools` 只列普通内置工具，并不会因此拒绝全部 MCP 调用。细节可看官方文档：[CLI 工具筛选](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/cli.md#mcp-tools)

下面是交给 Codemode 工具的原始 JavaScript，不是 JSON 参数，也不包含 Markdown 围栏：

```javascript
const outcomes = await Promise.allSettled([
  tools.mcp__coursefs__read_text_file({ path: "src/shipping.ts", head: 50 }),
  tools.mcp__coursefs__list_directory({ path: "src" }),
]);
for (const [index, outcome] of outcomes.entries()) {
  if (outcome.status === "rejected") {
    text({ index, state: "failed", error: String(outcome.reason) });
    continue;
  }
  const reply = outcome.value;
  text({ index, isError: reply.isError === true, content: reply.content });
}
```

把脚本交给 Pi，通过 codemode 工具执行，结果应包含源码与目录；只粘贴到普通对话里，它还不会运行。脚本用了两层检查：`allSettled` 区分 Promise 的 fulfilled 与 rejected，随后再看已兑现的 CallToolResult 中是否有 isError。MCP 工具可能把错误装在这一字段里返回。Promise 兑现，只说明答复送到了；拆开一看，里面也可能是报错。细节可看官方文档：[Codemode 调用返回值](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/codemode.md#call-tools)

## 选择暴露方式与读取范围

工具有四种暴露方式：

| 方式 | 发现与调用 |
|---|---|
| direct | 直接声明给模型，适合少量、常用接口 |
| codemode | 由脚本发现并调用 |
| deferred | 经 tool_search 按需声明 |
| hidden | 保持不可达 |

本例选择 codemode，先隐藏全部，再开放三项。服务账户与操作系统权限仍另行决定实际访问能力。

相对路径要从真正的启动目录算起，读取前先调用 list_allowed_directories，确认服务允许读取哪些目录。记录结果时，把路径错误、文件缺失、服务超时和工具 isError 分开，排错时就不用把配置、文件和参数挨个审一遍。

`head: 50` 只拿文件前 50 行。关键条件要是写在第 51 行，它就不会出现在结果里；这时候该接着读，不能直接宣布“没实现”。失败状态也别筛掉：文件没读到，目录却列出来了，上层还能沿这条线继续找。眼下这些读取需求已有官方服务，真遇到缺少的业务接口，再考虑自己开发。

## 失败、取消与输出边界

接下来，把第一项改成不存在的文件，目录列举保持不变，检查输出能否同时留下读取失败和目录内容。这里两次读取互不依赖，适合并行；写入动作，或需要前一项结果才能执行的动作，应当串行。

若卡在连接，先看 `mcp list` 和 `/mcp` 的错误，再核对 Node 版本、npx 下载、允许目录与 project trust。服务超时或协议报错，就沿着连接查；提示词写得再体贴，也叫不醒一个没连上的服务。准备重试时，还要确认调用有没有副作用，尤其不能盲目重复写操作。

模型只会看到脚本交回的输出，所以可以在 text 前把内容筛一筛，少搬些无关材料。执行状态却不能跟着省略：脚本后来报错，已经完成的外部调用不会撤销；没 await 的工作，也不能指望它可靠地在后台继续干。

练习结束时，把连接、正常读取和部分失败的结果留下来，核对工具范围，确认文件没有变化，再记下额外耗时。和普通读取放在一起比一比：组合与筛选省下的事，值不值得多走这一道工序。

## 参考资料

本章按 Pi 1.4.0 核对，资料核对日期为 2026-10-23。

- [Pi MCP：配置、暴露、错误和 SDK 边界](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/mcp.md)
- [Codemode：QuickJS、工具结果与并发](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/codemode.md)
- [CLI：MCP 筛选与内建扩展](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/cli.md)
- [官方 filesystem 服务固定版本](https://www.npmjs.com/package/@modelcontextprotocol/server-filesystem/v/2.0.0)
