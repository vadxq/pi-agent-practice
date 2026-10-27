# Pi Agent实战：02 读懂仓库，完成并审阅第一次修改

本章配套项目：[projects/01-shipping-lab](../../projects/01-shipping-lab/README.md)。从课程目录进入对应项目，后文命令均在该项目根目录执行；相同项目内可以沿用上一章的副本，其他项目的依赖与副本互不共享。

```bash
cd projects/01-shipping-lab
npm ci --ignore-scripts --cache .pi/npm-cache
```

模型既然已经连通了，那个藏着少写个等号的运费 bug 也该清算一下了。国内订单凑满 5000 分本来该免基础运费，结果代码倒好，硬是要多收 500 分。咱们得另外拷贝一份带着这个毛病的“练习副本”让 Pi 去修，课程里自带的正确实现则原封不动留着当参照。

千万别小看这两份代码的区别：**改的是甲、测的是乙**。要是测试绿得发亮，结果跑去测了参考答案，那纯粹是在给自己发安慰奖。

## 2.1 读懂仓库，建立修改前的基线

刚接手一个陌生仓库时，最容易让人掉坑的地方往往就在眼皮底下——同名文件有两份，函数名字也一模一样。运费到底在哪算、用例写在哪、检查脚本加载的到底是哪一个，这些都得先顺着调用关系摸清楚，免得 Pi 忙活半天，结果把参考答案给改了。

### 创建bug副本

准备副本和运行检查都在本地搞定，压根用不到模型。等到后面需要跟 Pi 交互时，才用得上模型的 API 凭据。

从本章项目根目录运行：

```bash
npm run lab:init
(cd .pi/labs/shipping && git status --short)
(cd .pi/labs/shipping && git --no-pager diff --no-ext-diff --no-textconv)
rg --files fixtures/sample-repo .pi/labs/shipping
npm run lab:check

```

`lab:init` 会在 `.pi/labs/shipping` 创建一个待修复的版本，正式的 fixture 则老老实实留在原地当对照。要是目录已经存在，脚本会直接拒绝覆盖，避免你辛辛苦苦改的东西瞬间蒸发。

想从头再练一次？很简单，用 `npm run lab:init -- --name shipping-retry` 换个名字新建个目录就行。之后的工作区得指向这个新目录，检查命令也得对应改成 `lab:check -- --workspace .pi/labs/shipping-retry`。要是提示里换了工作区，结果检查命令还在老地方跑，那拿到的自然是另一份代码的成绩单。另开副本就能随时重来，完全没必要用 `git reset --hard` 或 `git clean` 去糟蹋你的真实项目。

新副本上的 `lab:check` 跑起来理所当然应该**报错**：因为国内订单在 `subtotalCents` 刚好等于 5000 分时，代码还在傻乎乎地收 500 分基础费。看到这满屏红字反而对了，说明咱们确实把毛病逮个正着，这个失败的结果就是咱们动手修之前的“基线”。不过话说回来，要是纯粹因为缺依赖或者环境没起好而报红，那可不算——那是连考场还没进呢，赶紧补齐环境重新检查。另外，`npm run fixture:check` 测的是正式 fixture，它就算一路绿灯，也顶替不了副本作答。

### 区分修改基线与参考实现

练习目录有自己的 Git index，初始化的时候就已经把初始文件底子记下了，所以根本不需要手动 `commit`，直接用普通的 `diff` 就能一眼看出改动前后差在哪。查看的时候别忘了先进到副本目录里：本章项目根目录往往会把 `.pi` 给忽略掉，所以在根目录敲 `git status` 可能会看到“一切干净”，但副本里面其实早就天翻地覆了。

如果想拿当前副本跟课程自带的正确实现硬碰硬地比一下，直接在本章项目根目录下跑：

```bash
git --no-pager diff --no-index fixtures/sample-repo/src/shipping.ts .pi/labs/shipping/src/shipping.ts

```

`--no-index` 可以强行对比两个没有任何 Git 关系的路径，只要发现不同就会返回非零状态码——这跟命令报错可不一样，看输出时别慌。它展示的是你离“标准答案”还差多远，而副本里的普通 `diff` 才是你本次实打实的修改。

### 用只读工具定位实现与验收入口

从本章项目根目录启动 Pi，但这次咱们只给它放开读取和搜索的权限：

```bash
npx --no-install pi --no-extensions --no-mcp --no-skills --no-prompt-templates --tools read,grep,find,ls

```

这条命令直接卡死了本次分析能用的工具范围。普通的工具白名单管不到所有 MCP 能力，所以特意加上了 `--no-mcp`，顺便把那些七零八落的自动发现项也关了。[工具选择规则](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/cli.md#tools)

把这段话丢给 Pi：

```text
只读分析 .pi/labs/shipping，不修改任何文件。
定位 calculateShipping、调用它的测试和验收入口。
报告分成：已确认事实、可能原因、仍需验证。
每条事实给文件路径与行号。重点检查国内4999、5000、5001分，
以及国际订单和expedited。不要运行commit/push，不把源码推断写成测试通过。

```

Pi 吐出来的回答里，必须得带上当前文件的准确路径和行号。“可能漏了等号”这话听起来逻辑闭环，但万一它只是在凭空猜题呢？必须得亲眼看到它锁定了哪行代码才行。搜索范围圈在运费实现和验收入口就够了，没必要吃饱了撑的去翻 `node_modules`。顺便说一句，确定了文件位置后，你也可以直接用 Pi 的 `@path` 把文件当作初始输入传进去，路径是相对于当前工作目录解析的。[CLI 输入规则](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/cli.md)

### 沿输入检查条件分支

运费计算函数接收 `subtotalCents`（小计分）、`region`（地区）、`expedited`（是否加急）这几个参数，最后吐出整数分的运费。地区和加急这两个分支同样会左右最终结果，必须跟金额条件摆在一起通盘检查：

| 条件 | 期望运费，单位分 |
| --- | --- |
| 国内 4999，普通 | 500 |
| 国内 5000，普通 | 0 |
| 国内 5001，加急 | 800 |
| 国际 5000，普通 | 2000 |
| 国际 5000，加急 | 2800 |

原代码里的 `subtotalCents > 5000` 就像个不近人情的门卫，把刚好踩线的订单硬生生拦在了门外。对照“国内满额免基础费”的业务规则，病根到这里算是彻底浮出水面了。不过话又说回来，看出毛病和跑出红字完全是两码事。你的报告里得把哪些是读代码看出来的、哪些是推测的、哪些是已经实测验证过的一笔笔写清楚，后面接手的人才不用像猜哑谜一样揣摩你推进到了哪一步。

既然函数找着了，还得顺藤摸瓜找到负责检查这个分支的测试用例，务必确认 `lab:check` 喂给它的确实是咱们建的那个练习副本。只有这样，才算把“改哪里”和“测哪里”真正扣在一起。

国内的边界情况看完了，顺便也可以让 Pi 用只读模式解释一下，为什么国际订单不能套用这套免邮规则，并让它给出两个文件的证据。核对好当前文件的路径与行号，同时确认这轮分析压根没有碰过任何文件。

### 定位失败时查什么

路径找不到？通常得回过头去检查 `lab:init` 和 Pi 的当前工作目录（cwd）。工具用不了？多半是启动参数没对，千万别为了搜个文件就急着把通用 bash 权限大门敞开。要是引用的行号对不上了，老老实实重新把当前文件读一遍——会话里保存的只是当时的分析过程，文件本身可能早就悄悄变了。进阶可以看官方文档[会话与上下文](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/sessions.md)

这次只给了只读工具，算是从源头上掐断了直接乱改的可能，不过真正的文件系统隔离还得靠执行环境来兜底。只读工具依然有可能摸到当前账号能碰的其他角落，所以练习时千万老老实实用自己创建的受控样本。具体可以查询[安全边界](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/security.md)

## 2.2 完成修改，再审阅结果

在只读会话里输入 `/quit`，利索地退回本章项目根目录的 shell。咱们这次要修的很简单，就是国内满 5000 分免基础费的边界条件，国际和加急的规则全按原样保留，千万别手痒去搞什么多余的重构。

### 留住修改前的结果

如果你一路用的是 2.1 节那个副本，直接沿用刚才拉出来的基线就行；要是准备阶段之后又手贱改了别的东西，那就回到本章项目根目录重新确认一遍：

```bash
npm run lab:check
(cd .pi/labs/shipping && git --no-pager diff --no-ext-diff --no-textconv)
git --no-pager diff --no-index fixtures/sample-repo/src/shipping.ts .pi/labs/shipping/src/shipping.ts

```

要是运行检查发现已经绿了，那说明这个副本之前可能早就被人修好过。你可以直接审阅现有的结果，或者索性重新搞个带名字的新副本，把后续路径顺手切过去。平时的 `diff` 必须得留着，它能帮你清清楚楚地分清：哪些是本来就有的、哪些是咱们这次刚动的手。至于正式的 fixture，它永远只配当个安静的参照物。

这次要调整的逻辑关系，用一段极简的 diff 表达长这样：

```diff
-  const domesticFee: number = input.subtotalCents > FREE_SHIPPING_THRESHOLD ? ZERO : DOMESTIC_BASE_FEE;
+  const domesticFee: number = input.subtotalCents >= FREE_SHIPPING_THRESHOLD ? ZERO : DOMESTIC_BASE_FEE;

```

只要把大于号改成大于等于号，国内订单刚好 5000 分就能顺理成章地免掉基础费，而国际分支和加急增量依然稳如泰山。你可以自己手动改完去跑检查，也可以让 Pi 动手——不过后者需要你提供合规且可用的 provider 凭据。

### 开放 edit，执行最小修改

重新把 Pi 请出来，这次得把 `edit` 工具放进去，不过检查动作依然老老实实留在你自己的终端里跑：

```bash
npx --no-install pi --no-extensions --no-mcp --no-skills --no-prompt-templates --tools read,grep,find,ls,edit

```

把任务要求一次性交代明白，业务规则、修改范围和工具限制一条都不能漏：

```text
修复 .pi/labs/shipping/src/shipping.ts：国内 subtotalCents >= 5000
时基础运费为0，否则500；国际基础费2000，加急额外800。
先确认当前实现和原有改动，只修改这个文件，不改测试与正式fixture。
使用最小差异；不要commit或push。
本次没有命令执行工具，不要声称已经运行测试；列出待运行的验收。

```

`edit` 做的是精细到字符级的文本替换。要是它死活找不到目标文本，千万别催着它拿旧内容硬去拼凑：老老实实重新把文件读一遍，往往就会发现目标代码早就不是那个样子了。这一轮既然没给它命令执行的权力，那它就只负责老老实实交代自己改了什么、还得查什么，真正的测试还得你亲自在终端里跑。[工具与资源选项](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/cli.md#tools)

### 运行检查并审阅 diff

等 Pi 哼哧哼哧改完之后，回到底层本章项目根目录，一口气把这几行命令跑起来：

```bash
npm run lab:check
npm run fixture:check
(cd .pi/labs/shipping && git --no-pager diff --no-ext-diff --no-textconv)
git --no-pager diff --no-index fixtures/sample-repo/src/shipping.ts .pi/labs/shipping/src/shipping.ts

```

这里的 `lab:check` 专门用来审讯咱们修改后的副本，而 `fixture:check` 则是用来检查正式样本有没有被误伤。退出状态码和失败详情会直截了当告诉你运费逻辑到底对不对，副本里的 `diff` 还能帮你揪出有没有顺手乱改别的地方。最后那个 `--no-index` 纯粹用来跟参考实现对账，像注释这种无关痛痒的文本差异随它去就行，犯不着为了追求一字不差跟它较劲。

正式样本一路通过测试，可不代表它就绝对安全没被动过：要是本章项目根目录有 Git 基线，直接查 `diff` 即可；如果是解压出来的目录，就拿它去跟没动过的课程原文件比对。把改动和真实的输出老老实实写进报告里：

```text
变更：国内免邮判断包含5000分。
范围：仅练习副本src/shipping.ts。
验证：写实际执行的命令、退出状态与观察到的用例结果。
未验证：写没有运行的检查；没有则明确说明范围。
交付：本地diff与报告；未执行commit/push。

```

检查一旦返回非零状态，千万别急着脑子一热让 Pi 盲目重写补丁。先看一眼它是压根没起环境、缺了依赖，还是运费真算错了。环境的锅得找环境算账，只有断言报错，才值得回过头去盘查业务条件。把原始输出乖乖留着，免得下一轮沟通又掉回猜谜的死胡同。

### 排除假通过

要是你把 5000 分的测试用例顺手删掉了，结果可能也会一片大好绿油油，但 bug 实际上依然稳如泰山地蹲在代码里。同理，如果你一不小心把正式的 fixture 改了，却把真正的副本晾在一边，那就是彻头彻尾的修错对象。所以在审阅的时候，千万睁大眼睛看清楚路径、测试文件和那些不相干的改动，别顺手把金额计算或错误处理也给随性重写了——那些全都不在咱们这次的契约范围之内。

如果 Pi 信誓旦旦地吹嘘自己已经修好了，结果压根连一次 `edit` 调用都没有发生，直接去读文件查验真伪。消息和工具的返回日志只能用来追查过程，硬盘里躺着的代码才是最终的交付物。这里如果不理解可以查看官方的[运行机制](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/how-pi-works.md)

### 重复运行与取消后的检查

把同一个任务再丢给 Pi 一遍，它这时候应该能清醒地读出条件已经完全正确了，然后很老实地告诉你无需再做任何多余的修改。这可以帮你观察它到底能不能认清当前状态，千万别把修复次数又糊里糊涂地算上一笔。此外，你还可以让它用只读模式解释一下国内 5000 分的加急订单：这时候基础费清零，加急费依然是 800，总计 800，以此来测试它有没有把“免基础费”误解成“什么破费用都免了”。

中途取消绝对不会自动帮你回滚已经写入文件的内容，所以在重新发命令之前，老老实实先读一下当前的文件和 `diff`。所谓的 `project trust` 只能管管资源加载，它可代替不了人工的文件审阅或者访问隔离。[安全说明](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/security.md)

这次修复留下的残局其实不多：一份最终的 `diff`、一份简明扼要的说明，外加修改前的报错输出和修改后的实际运行结果。只要说明里把原来已有的工作、本次的改动以及没覆盖到的部分交代得清清楚楚，后面接手的人就能无缝衔接继续审阅了。要是检查完了又手欠去改了文件，那就乖乖从头再跑一遍，老成绩单可管不到新代码头上。到这里就可以大功告成收工了，千万别自动去搞什么 `commit`。

## 参考资料

* [CLI：输入与工具列表](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/cli.md)
* [Security：目录与操作系统权限](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/security.md)
* [Sessions：会话不是实时仓库快照](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/sessions.md)
* [How Pi Works：消息和工具执行](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/how-pi-works.md)