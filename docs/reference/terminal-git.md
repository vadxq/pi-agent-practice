# 终端、Git 与练习副本速查

课程命令以 macOS/Linux shell 为例；Windows 可在对应环境中调整路径与环境变量语法。代码块中的 `YOUR_PROVIDER`、`YOUR_MODEL` 是待替换参数，`<workspace>` 表示说明位置，不要原样执行。`npm run 名称 -- 参数` 中的 `--` 把后续参数交给课程脚本。

## 先确定命令在哪执行

课程根目录没有 package.json。先按章首说明进入对应的 `projects/编号-名称` 目录，再运行 npm 命令。路径包含空格时加引号。子 shell 可以临时进入练习目录，完成后自动回到项目目录：

```bash
pwd
node --version
npm --version
(cd .pi/labs/shipping && git status --short)
```

需要进入练习副本启动 Pi 时，先在独立项目根保存 `COURSE_PROJECT="$PWD"`，再通过 `"$COURSE_PROJECT/node_modules/.bin/pi"` 调用该项目锁定的 Pi。这个路径不指向课程根。新终端需要重新设置变量；若报找不到文件，先检查 cwd 和本项目的 `npm ci` 是否成功。

`npm ci` 按 lockfile 安装；当依赖声明与 lockfile 不一致时会报错，不应为了消除错误而随意删除 lockfile。[npm ci 官方说明](https://docs.npmjs.com/cli/v11/commands/npm-ci/)

## 为什么初始化一次就够了

`npm run lab:init` 创建 `.pi/labs/shipping`，拒绝覆盖已有目录。需要再做一次缺陷修复，就换新名字：

```bash
npm run lab:init -- --name shipping-next
npm run lab:check -- --workspace .pi/labs/shipping-next
```

每个副本都从同一个已知缺陷起点开始。后一条预期返回失败，因为两个边界案例尚未修复；其他 10 项应通过。已经修好的副本保留作成果，不通过重置或删除恢复练习起点。章节要求新名字时，后续命令中的 workspace 也要一起更新。

## 本课程的 diff 基线

初始化脚本在练习目录执行 `git init` 与 `git add`，把初始文件放进 index，并用 `git write-tree` 把原始树 ID 保存在 `.git/pi-course-baseline`，不生成 commit。日常查看工作区相对于 index 的变化：

```bash
git -C .pi/labs/shipping-next status --short
git -C .pi/labs/shipping-next --no-pager diff -- src/shipping.ts
```

`status --short` 的两个状态列分别描述 index 与工作区。初始文件已 staged，所以状态中出现新增文件并不说明模型刚创建了它。`git diff` 默认比较工作区与 index；不要用 `git diff HEAD`，因为练习仓库可能还没有 HEAD commit。[git status](https://git-scm.com/docs/git-status)、[git diff](https://git-scm.com/docs/git-diff)

模型修改后先保存 diff、运行固定验收，再看报告。不要在审阅前对新改动执行 `git add`，否则普通 diff 的比较对象会改变。第 15 章评测另外使用原始树 ID，能够检查已暂存、未暂存与未跟踪文件的范围。真实项目可以采用已有 commit 或 worktree，并记录对应起点。

## 看懂退出码和输出

退出码 0 通常表示该程序报告成功，但具体含义由程序定义。Pi JSON mode 还需要读取事件与模型停止原因；课程 `lab:check` 则以独立行为断言决定退出码。stderr 用于进度和错误，stdout 用于结果；不要将两者混在一起再当单个 JSON 解析。

遇到失败先保留命令、工作目录、退出码和脱敏输出。检查模型服务错误、工具失败、契约失败和业务断言失败分别属于哪一层，再决定是否重试。预算和取消不会撤销已经产生的文件修改。
