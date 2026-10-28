# Pi Agent实战：03理解 Agent 运行、上下文与会话控制

本章配套项目：[projects/01-shipping-lab](../../projects/01-shipping-lab/README.md)。从课程目录进入对应项目，后文命令均在该项目根目录执行；相同项目内可以沿用上一章的副本，其他项目的依赖与副本互不共享。

```bash
cd projects/01-shipping-lab
npm ci --ignore-scripts --cache .pi/npm-cache
```

上一章补上了那个等号，Pi 也在界面上交了差。但你知道吗，从发出任务到拿到回答，中间其实是一场看不见的小型接力赛——模型可能请求了好几轮，读过一堆文件，中途还可能来一波上下文压缩，或者收到新消息在队列里等候。这节课我们就拿事件流这个透视镜看清这一切，然后试试保存会话、换个思路、关掉程序后接着做的魔法。会话就像你的工作笔记，保留着讨论和操作的完整记录；至于文件现在长什么样，那还得去磁盘上瞧一眼，会话可改变不了。

## 3.1 模型与工具怎样完成一次运行

这次仍让 Pi 只读分析运费条件，把输出换成 JSON 事件流。我们从记录里找到读取源码的那一步，看看这次读取怎样成为后续回答的依据。

### 请求、工具执行与停止事件

Pi 把系统指令、当前分支的会话历史、工具定义和模型配置一起打包成请求。模型看了一眼，回消息说帮我读这个文件吧——这时文件其实还没动。然后轮到 Pi 执行读取，把结果写进会话，下一次才会把源码一起带给模型。把一次模型响应和它触发的工具执行合起来，就算一个 turn；再请求模型一次，就进入下一个 turn。听起来像接力赛？没错，就是这么个感觉。官方文档的[运行机制](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/how-pi-works.md)讲得更细。

看事件流记录时要留意——系统喊”结束”的地方不止一个。模型流结束了，工具可能才要开始干活；出现 `agent_end`，Pi 还可能重试、压缩恢复，或者继续处理排队消息。等到 `agent_settled` 才真正能确认当前 session 的这次运行不会再自动继续。不过，它忙完了也不代表运费算对了啊，业务验收还得照常跑。具体术语可以瞅瞅[JSON 事件语义](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/json.md)。

### 保存真实事件流

完成第 02 章并确认练习副本存在后，在本章项目根目录执行下面的命令。这次只开放 read，把 stdout 的事件和 stderr 的诊断信息分开保存：

```bash
mkdir -p .pi/runs/ch05
npx --no-install pi --no-extensions --no-mcp --no-skills --no-prompt-templates --tools read --mode json "调用read读取.pi/labs/shipping/src/shipping.ts，说明国内免邮条件；不要修改，不宣称已测试。" > .pi/runs/ch05/events.jsonl 2> .pi/runs/ch05/stderr.log
rg 'agent_start|tool_execution_start|tool_execution_end|agent_end|agent_settled' .pi/runs/ch05/events.jsonl
```

events.jsonl 每行是一条 JSON 记录，记录之间用 LF 分隔。解析时按 LF 拆开，逐条处理；直接对整个文件调用一次 `JSON.parse`，就会把多条记录当成一个对象，按任意 Unicode 换行符切分也不符合这里的格式。最终回答也放在事件里，其中的内容仍可以是普通文本。排错时再看 stderr，解析事件时别把诊断信息混进来。关于流格式可以看文档：[流格式](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/json.md#framing-and-process-io)

同一次 read 的开始和结束靠 toolCallId 对应。下面只展示部分字段的样子，不是实跑记录，实际 ID、时间、文本和数量都以你的输出为准：

```json
{"type":"tool_execution_start","toolCallId":"call-example","toolName":"read","args":{"path":".pi/labs/shipping/src/shipping.ts"}}
{"type":"agent_settled","aborted":false}
```

如果找不到读取事件，结合 stderr 和完成消息，看看这次停在了哪里。模型可能没有调用工具，也可能还没发出首次请求就认证失败了。光看退出码还判断不了：JSON 模式下，即使模型响应失败或运行取消，进程也不保证返回非零。如果细研究可以看[输出模式差别](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/cli-integration.md)

### 从事件核对工具契约

一个读文件的动作，看起来简单，其实暗藏着好几件需要约定清楚的事：`src/shipping.ts` 相对于哪个目录解析？读到的内容会不会突然断掉？出了问题返回什么？这些约定就是工具契约，不能含糊。参数 schema 要明确，结果里也得能看出读到了什么、有没有截断、是否失败。想象一下，要是工具只甩回一个空对象，两眼一抹黑——你根本分不出文件是空的还是服务坏了。

读到条件所在的那一行，这才有了解释源码的依据；但要说边界测试通过了，你还得拿实际运行测试的记录来说话。bash 工具也是这个道理——跑了格式检查，你就只能报告格式检查的结果，别把它吹成全面验证。所以最好的做法是：把用了什么工具、查了什么范围、拿到什么结果全部记下来，这样后面对账时才能对上。

扩展可以在 `tool_call` 阶段阻止调用，在 `tool_result` 阶段处理结果；工具自己的 execute 抛错时，会产生失败工具结果。多个工具并行运行，事件可能穿插出现，配对时就要靠 toolCallId，不能只看相邻行。遇到嵌套调用，还要看清父调用关系。参考[扩展生命周期与工具](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/extensions.md)

### 观察文件不存在的路径

再运行一次前面的 JSON 命令，把任务里的目标文件换成 `.pi/labs/shipping/src/not-present.ts`，输出另存为一个文件，比如 `missing-file.jsonl`。这次要求 Pi 只尝试读取这个明确不存在的文件并报告错误，不要自作聪明地创建文件或绕道搜索。接着看看工具失败后，模型是否说明了文件缺失、有没有试图搜索别的文件，还是照样宣称读到了源码。

这一回工具理应报错，模型也该坦白说没读到源码。如果文件都不存在，模型反而讲得头头是道，那就有点像对着空盘子点评厨艺的感觉了。如果它转去搜索别的文件，可以留下这次记录备查，但这还不能证明预设的文件缺失路径已经测到。对比两份记录时，重点关注工具的错误有没有真的传到回答里去，不必强求事件条数完全一样。

参数不合法、文件不存在、权限被拒绝、远端模型出错——这些情况的处理办法各不相同，不能一股脑儿都用一个空字符串打发掉。要是那样做，等你排查问题时，就彻底没了线索。而且外部请求还多一层麻烦：没收到结果，但上一次操作其实可能已经生效了，重试前得先确认有没有副作用。所以错误处理要讲究——给模型和后续的人留下足够的信息。

### 流中断与排错

工具已经开始了，结果却迟迟不见。单靠这一段记录，你根本分不清是它还没做完，还是做完了但响应丢了。这时候的正确做法是保留原始事件和错误日志，把这次运行标记为证据不完整，别替它胡乱补上一个猜出来的结束事件。程序要分别记录开始、结束和业务判定，这样恢复时你才知道哪一步有证据，哪一步只能写这里还不知道。

排错时的思路也很重要：沿着输出往回找。events 文件是空的？先看 stderr 和 provider。已经有消息却没有工具事件？检查工具是否启用、模型有没有调用。格式看起来不像 JSONL？核对 `--mode json`，看看 stdout 是否混入了调试信息。要把记录发给别人，记得检查源码和会话内容，把敏感信息处理掉。

拿正常读取和文件缺失的两份记录放在一起对比，两边都可能出现 `agent_settled`，但一边读到了源码，另一边空手而归。把调用 ID、工具状态、最终停止情况、业务结论和未验证项都记下来，以后就能顺着这些记录查下去。

## 3.2 上下文如何进入下一次请求

文件改过了，会话里却可能还躺着旧源码和失败日志。上下文压缩能给下次请求减负，却改变不了一个事实：它不会顺便核实哪份源码才是最新的。我们先把目标、约束和证据位置写进交接记录，压缩后再读当前文件，看看能不能接着干下去。

### 磁盘、历史与请求上下文

Pi 构造请求时，会从会话的当前分支重建历史，再加入系统提示、上下文文件和工具定义。有些 Skill 只把名称和描述放进提示，等真的用上了才读完整内容；Prompt Template 则会直接展开成用户消息。它们进入请求的方式不同，如果都笼统地叫记忆，就容易搞不清模型这次到底看到了什么。参考可以看[上下文组装](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/how-pi-works.md#context)。

模型手里那份源码，就像读取时拍下的一张照片。你后来改了文件，照片可不会自己刷新啊。所以继续干活时，既要确认材料有没有进入请求，也得核对它是不是当前版本。上下文窗口再大，也没法把昨天的照片变成今天的直播。

压缩以后，后续请求会用摘要替换较早的消息，近期消息继续保留。原始条目仍在会话树里，项目文件也不会被删除。不过，摘要这种东西有个坏毛病——它可能漏掉只改练习副本这样的关键约束。自动压缩由 token 预算阈值触发；手动执行 `/compact` 时，可以明确要求保留哪些内容。参考可以看[会话与压缩](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/sessions.md#manage-conversation-context)。

### 建立交接记录并手动压缩

在本章项目根目录用只读工具启动 Pi：

```bash
npx --no-install pi --no-extensions --no-mcp --no-skills --no-prompt-templates --tools read,grep,find,ls
```

让 Pi 先读当前实现和验收定义，再按下面的要求建立交接记录。这样做的目的是把讨论和决策都记下来，免得压缩后有人糊涂：

```text
请建立运费练习的短交接记录：
目标：国内满5000分免基础费。
不可改变：国际基础费2000、加急额外800；只改练习副本。
证据：给当前实现与验收入口的文件位置。
下一步：列出待执行检查；不要把未执行写成通过。
不要读取node_modules或完整历史日志。
```

拿 4999、5000、5001 三个输入核对边界，写清楚结论来自手算，还是实际检查输出。这样回头看摘要时，才不会把推导误认成测试通过。审阅记录后执行：

```text
/session
/compact 保留任务目标、不可改变的规则、练习路径、已执行检查及失败结果；明确下一步。
/session
```

记下两次 `/session` 的实际使用量，看看压缩前后差了多少。历史本来就短，压缩后用量变化不大也正常；要是 provider 不可用，压缩请求也可能失败。把实际结果记下来就好，不必为了凑效果塞进去一堆无关的长文。

压缩后重新读一遍当前实现，对着交接记录核对目标、修改范围和待运行的检查。记录里的路径可以帮你找到文件，源码则以这次读到的内容为准，行号有变化也一并校正。

压缩也要请求模型，所以认证、网络、模型窗口或摘要请求本身出了问题，都可能卡在这里。直接关掉自动压缩继续聊，只是把问题往后拖而已。如果摘要漏了条件，就补好交接记录、重读相关文件；回答突然换了口径，就查当前分支、模型和实际加载的项目指令。把交接内容、使用量变化和重读结果一起留下，哪一步没做成也要写明原因。

### reserveTokens 与 keepRecentTokens

下面这段完整配置可用于练习项目的 `.pi/settings.json`，我们借它看看两个常见预算，不用为此改动个人全局设置：

```json
{
  "compaction": {
    "enabled": true,
    "reserveTokens": 16384,
    "keepRecentTokens": 20000
  }
}
```

reserveTokens 影响何时预留空间、触发压缩；keepRecentTokens 决定保留多少近期历史，让刚读取的源码和讨论细节还能继续使用。这两个值都不是费用上限，也不能把模型窗口撑大。配置可以针对精确的 provider/model 覆盖，预算仍要对照各模型的真实窗口来设。参考可以看：[Settings](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/settings.md#compaction)、[压缩实现说明](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/compaction.md)

写好配置后，还要看 Pi 从哪个目录启动、是否信任项目资源。你在本章项目根目录启动 Pi，只在提示里提到练习副本，cwd 可不会跟着切换，副本里的 `.pi/settings.json` 也未必会加载。第 06 章会给出从练习目录启动的命令。如果改了设置却没变化，先核对配置作用的目录和 trust 条件，看看是不是仍在沿用全局设置。

### 长日志保留原文，按需提供片段

测试日志太长了？别全部扔给模型。把完整日志留在磁盘，只将失败用例、断言、关键堆栈和原日志位置交给模型。同时注明筛选或截断了哪些部分，免得模型把这段没看到错误当成整份日志都没错误。

搜索时先限定练习路径和符号，读取时集中看相关段落；第 07 章的 Codemode 还能在结果进入模型前做组合、筛选。交接记录保留目标、约束、证据位置和未决问题，修复理由另存决策记录。这样继续讨论时，就不用把依赖目录和成功日志反复搬进请求。

摘要短了，原始记录可没跟着消失啊。工具输出、文件内容，甚至误输出的凭据，都可能还留在会话树里。导出前要检查这些原始记录并脱敏，只看摘要会漏掉它们。参考可以看[会话导出提醒](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/sessions.md#export-or-share-a-session)。

## 3.3 会话分支与运行控制

交接记录备好了，接下来试试退出以后怎么继续。先退出第 3.2 节的会话，回到本章项目根目录。下面使用独立的 session-dir 和具名会话，不会自动继承刚才的记录——这就像打开了一个全新的笔记本。要接着做前面的任务，就得把交接摘要交给新会话，说明仍在 `.pi/labs/shipping` 干活，再让它重读当前文件。

### 保存并恢复具名会话

会话记录默认保存在用户目录，按工作目录分组。这次把保存位置和名称都明确写出来，让你能精确控制。在本章项目根目录执行：

```bash
mkdir -p .pi/runs/ch07/sessions
npx --no-install pi --session-dir .pi/runs/ch07/sessions --name shipping-analysis --no-extensions --no-mcp --no-skills --no-prompt-templates --tools read,grep,find,ls
```

让 Pi 只读解释国内边界，再输入 `/session`，记下会话 ID、文件和模型，随后用 `/quit` 退出。保持相同的 cwd 和 session-dir，重新启动：

```bash
npx --no-install pi --session-dir .pi/runs/ch07/sessions --continue --no-extensions --no-mcp --no-skills --no-prompt-templates --tools read,grep,find,ls
```

`--continue` 会选择当前项目最近的会话。做过多个实验，就用 `--resume` 或 `/resume` 来选择，再通过 `/session` 确认回到的是哪一个。`--no-session` 适合临时运行，但它把会话留在内存里，进程退出后就无法恢复——相当于用完即丢的便签。参考可以看[会话与存储](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/sessions.md)。

### 用分支比较两条分析路线

Pi 会把会话条目存成一棵树。用 `/tree` 可以在同一个会话文件里导航，就像在目录里翻找文件一样。选中早前的用户消息，编辑后提交，就会形成另一条分支。`/fork` 从较早的用户消息创建独立会话，`/clone` 则把当前分支复制到新会话。构造请求时，Pi 只取当前分支，不会把树里的所有尝试一起发给模型。参考可以看[分支操作](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/sessions.md#choose-how-to-branch)。

你可以先让 Pi 用边界表解释条件，看过回答后，回到这条用户消息之前，把要求换成用伪代码解释条件。Pi 会沿新分支构造请求，原回答仍留在树里，方便对照。两条路线都会读取真实文件——这样的对比才有意义。

对话能回到过去，磁盘可没搭上这趟时光机啊。原分支写进文件的内容还在，新分支读到的也是此刻的文件。如果要比较两种会写代码的方案，就先另存基线，用独立副本或隔离工作区保留各自的状态。会话树没有文件系统快照，`/tree` 也顶替不了 undo 或 Git branch。

### 三种运行控制

运行中发送 steering，后续方向会在当前 assistant turn 之后改变，已经执行的命令不会撤销。follow-up 则让新任务排在当前工作之后处理。想要发送 follow-up 通常用默认按键 Alt+Enter（Windows/WSL 为 Ctrl+Q），具体绑定以 `/hotkeys` 为准。参考可以看[运行机制](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/how-pi-works.md)和[键绑定](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/keybindings.md)。

用只读任务观察这些消息的时机：

```text
第一条：分步骤检查运费函数和验收定义，先解释国内条件，再解释国际和加急。
steering：先聚焦5000分边界，不要展开其他业务。
follow-up：结束后用三行概括仍未验证的事项。
```

这次预期能看到分析转向 5000 分边界，当前工作结束后，再处理概括的要求。如果第二条消息还没发出去任务就已经结束了，那这回只观察到了空闲时的输入，记作未观察到运行中排队即可。可以换个需要读两三个相关文件的只读任务再试，不用靠无意义输出硬拖时间。

取消当前运行，默认按 Escape。中止后，当前运行会停止，排队消息会回到编辑器；已经发生的文件写入或外部请求，不会因此回滚。参考可以看[停止与消息队列](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/how-pi-works.md#agent-loop)。

### 取消后先检查现场

本例只开放了读取工具，取消后检查运行是否结束、排队输入是否仍可见，就能观察这两件事。换成编辑任务，要看 diff；换成 shell 任务，则要查子进程。界面上那句已取消，可没交代文件改过没有、验证做完没有——这是你的责任。

恢复会话以后，让 Pi 先重读当前源码，说明哪些事实来自这次读取，哪些来自历史记录。可以这样提醒：

```text
先核对当前任务、练习路径和源码，不修改文件。
将历史中已执行的动作与当前磁盘状态分开。
如果无法确认上次验证是否完成，列为未知，不直接重复有副作用操作。
```

核对过后，就能分清历史里打算做什么、做过什么，以及当前目录里实际留下了什么。Pi 负责重建会话历史；是不是同一个任务、资源归谁、操作是否已经生效，仍需要你来确认。第 10 章会把这些核对接进任务恢复流程。

做这组实验时，记下按键发生在模型生成、工具运行，还是空闲阶段，再记录 steering 何时转向、follow-up 何时处理、取消后还有哪些活动。没赶上目标阶段，就标为未覆盖。这些记录说明的是这次手动操作观察到了什么，服务端是否可靠，还需要另外验证。

### 恢复与快捷键排错

恢复到了错误的会话？查 cwd、session-dir 和当前 ID；找不到会话，先确认有没有使用 `--no-session`。快捷键没反应时查 `/hotkeys`，也看看当前是在编辑器、选择菜单，还是全屏滚动状态。

下次接着干，光靠一句上回好像做到这里了可不够。要记录这次实际观察到的情况：怎么恢复具名会话、两条只读分支如何理解、follow-up 有没有入队、取消后还有什么活动，没赶上的环节也注明原因。再顺着记录核对文件、子进程和验证进度，才能接上上次停下的位置。会话留在本地，不自动执行 `/share`；上传需要作为单独的外部动作处理。

## 参考资料

本章按 Pi 1.4.0 核对，资料核对日期为 2026-10-28。

- [How Pi Works：turn 与运行循环](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/how-pi-works.md)
- [JSON Event Stream：记录、ID 和停止语义](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/json.md)
- [CLI Integration：JSON 模式的退出行为](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/cli-integration.md)
- [Extensions：工具契约与事件钩子](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/extensions.md)

- [Sessions and Context：压缩与记录](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/sessions.md)
- [Compaction：触发条件与摘要边界](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/compaction.md)
- [Settings：上下文预算](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/settings.md)

- [Keybindings：实际控制按键](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/keybindings.md)
- [Slash Commands：会话命令](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/slash-commands.md)
