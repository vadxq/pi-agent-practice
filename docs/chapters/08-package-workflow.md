# Pi Agent实战：08将工作流封装为 Pi Package

本章配套项目：[projects/02-workflows](../../projects/02-workflows/README.md)。从课程目录进入这个项目，后面的命令都在项目根目录执行。前几章用过同一个项目，就可以接着用原副本；其他项目的依赖和副本不能混用。

```bash
cd projects/02-workflows
npm ci --ignore-scripts --cache .pi/npm-cache
COURSE_PROJECT="$PWD"
```

首次使用本项目时运行 `npm run lab:init` 创建自己的 `.pi/labs/shipping`；已有副本时不要重复初始化。本项目不读取第 02 章项目中的副本。

工具、提醒扩展、模板和 Skill 都凑齐了，每次启动却要拖着一长串路径，换个人用还得重新交代一遍。把 `shipping_contract` 和这些资源列进 Pi Package 的 manifest，就能整包加载、一起分享。打包本身不难，难的是离开自己的电脑还好不好使：你那套用了好久的个人配置，可能一直在默默替包补作业。

## 资源目录与加载清单

Pi Package 可以收纳 Extensions、Skills、Prompt Templates 和 Themes，再通过本地路径、npm 或 Git 分发。加载时，Pi 照着资源清单找入口。打包只是把东西装好、列好清单，隔离、调度和验收能力可不会像赠品一样随箱附送。细节可看官方文档：[Pi Packages](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/packages.md)

课程包位于 [02-workflows](../../projects/02-workflows/package.json)，结构如下：

```text
projects/02-workflows/
  package.json
  extensions/shipping-contract.ts
  extensions/workflow-reminder.ts
  prompts/shipping-review.md
  skills/shipping-review/SKILL.md
  mcp.example.json
```

目录里有的东西，不等于都会运行。这个 manifest 只选了扩展、Skill 和模板，mcp.example.json 随包带着，仍然只是一份配置样本，不会自己启动服务。对照 manifest 和入口代码看，才能知道哪些是说明材料，哪些真会注册能力。

## 声明入口与宿主依赖

包根 package.json 中与 Pi 加载有关的字段如下；实际文件还包含本项目的安装、检查脚本和开发依赖：

```json
{
  "name": "pi-course-02-workflows",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "keywords": ["pi-package"],
  "dependencies": {
    "@earendil-works/pi-coding-agent": "1.4.0",
    "typebox": "1.3.27"
  },
  "pi": {
    "extensions": ["./extensions/shipping-contract.ts", "./extensions/workflow-reminder.ts"],
    "skills": ["./skills"],
    "prompts": ["./prompts/*.md"]
  }
}
```

资源路径相对于包根解析，换工作区加载也仍指向这些入口。`private: true` 表示本例仅作本地演示，不发布 npm。

Pi 对宿主接口模块安排了专门的解析。作为供其他宿主加载的扩展包时，应按官方规则声明 peerDependencies；本目录同时承担可独立安装的教学宿主，因此显式安装 Pi 1.4.0 和 typebox 1.3.27，由自己的 lockfile 固定传递依赖。细节可看官方文档：[依赖规则](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/packages.md#declare-dependencies)

以后要拆出一个专门发布的扩展包，再确定它支持哪些宿主版本，并逐一验证。当前的 private 标记和固定版本只交代了本地教学环境，其他宿主版本还没有因此获得通行证。

## 一次性加载和项目安装

可以先临时加载，看看资源是否齐全，再决定要不要写入项目设置。从本章项目根目录执行：

```bash
(cd .pi/labs/shipping && "$COURSE_PROJECT/node_modules/.bin/pi" -e "$COURSE_PROJECT" --no-mcp --tools read,shipping_contract)
```

启动后，应能找到 `/shipping-review`、`/skill:shipping-review`，用 `/shipping-checklist` 显示清单，并让 shipping_contract 读取当前副本。这里有两个位置要分清：包根告诉 Pi 去哪里找扩展入口，`ctx.cwd` 告诉工具去哪里找任务文件。一个是工具箱的地址，一个是干活的地址，混在一起就容易跑错门。这条命令还保留着其他发现机制，个人资源仍可能被加载，后面会再用独立目录验证。

需要长期在练习项目使用时，再执行：

```bash
(cd .pi/labs/shipping && "$COURSE_PROJECT/node_modules/.bin/pi" install --local "$COURSE_PROJECT")
(cd .pi/labs/shipping && "$COURSE_PROJECT/node_modules/.bin/pi" list)
```

`--local` 将声明写入项目 `.pi/settings.json`，个人安装默认写入用户设置。这个作用域决定了下次会在哪个目录发现包。项目资源仍受 trust 决策影响，所以信任前要审阅代码；扩展装进包里，执行权限也不会随之收窄。细节可看官方文档：[包作用域](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/packages.md#install-and-manage-packages)

不再使用这个包时，通过项目作用域的移除命令删除声明，核对设置项，再重启确认资源已经消失。个人 agent 目录留着就好。只想搬走一个包，没必要连整个柜子都扔掉，其他会话和认证还住在里面。

## 在干净 agent 目录检查

要看包能否离开个人环境运行，可以给 Pi 子进程指定一个新的 agent 目录，暂时避开原有用户资源。新目录仍放在项目 `.pi` 中，无需改动 HOME 或个人配置：

```bash
COURSE_PI_AGENT_DIR="$PWD/.pi/runs/ch13/agent"
mkdir -p "$COURSE_PI_AGENT_DIR"
(cd .pi/labs/shipping && PI_CODING_AGENT_DIR="$COURSE_PI_AGENT_DIR" "$COURSE_PROJECT/node_modules/.bin/pi" -e "$COURSE_PROJECT" --no-mcp --tools read,shipping_contract)
```

新目录也意味着没有已保存的用户认证。运行模型任务前，需要在其中 `/login`，或者按 provider 文档提供自己的环境凭据；使用兼容端点时，还要配置这个目录下的 models.json，不能复制别人的 auth.json。所以遇到认证失败，先看看新环境有没有凭据，别急着给包判故障。这个独立目录隔开的只是 Pi 配置与会话位置，并非操作系统沙箱。细节可看官方文档：[环境变量](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/environment-variables.md)、[Configuration](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/configuration.md)

资源加载好，就在新目录里做一次同样的读取和审查。老环境能跑，新目录却失败，多半有东西没交代完整：漏掉的依赖、自动发现的配置、额外扩展，或者默认模型，都值得查。缺什么就补声明和配置说明。把个人目录整套复制过去，倒是可能暂时跑通，但认证和杂七杂八的状态也搬走了，缺项依然藏在里面。

任务运行时，还要确认工具读的是正确工作区、模型理解了返回值、报告给出了证据。包能加载，只说明入口找到了；cwd 选错，工具仍会读错目录。

## 固定版本并验证更新

本地路径始终加载当前文件，文件一改，加载的内容也跟着变。共享时应附上课程仓库版本、修改记录和 lockfile；通过 npm 分发则固定版本，通过 Git 分发则固定 tag 或 commit。升级时把资源变化写清楚，再用相关样本验证。package.json 里的 version 负责报版本号，证明没有回归还轮不到它。

整理共享内容时，留下包所需的文件，将运行输出、个人绝对路径、认证材料与临时调试文件排除。遇到重名注册，就调整命名或选择要加载的资源，别让加载顺序替你抽签。manifest 能缩小发现范围，实际入口代码仍要看过。

资源筛选的范围受 manifest 限制，只能继续缩小，不能借此从包外加载资源。更新后，除了检查 `pi list`，还要重跑第 04 章的 Eval；课程进行中也应保留固定来源，不要无条件更新到 latest。细节可看官方文档：[资源筛选与固定来源](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/packages.md)

包能在干净配置里找到工具、命令、模板和 Skill，也能在正常 cwd 里读取、在错误 cwd 里如实报错，这份包才有了拿给别人试用的底气。把发现的隐含依赖一起记下来，核对只读任务没动文件、提醒没冒充测试，再和基线比较行为与成本。课程已有覆盖和没测到的部分见[验证记录](../reference/validation.md)。

## 参考资料

本章按 Pi 1.4.0 核对，资料核对日期为 2026-10-23。

- [Pi Packages：来源、manifest、依赖与筛选](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/packages.md)
- [Configuration：项目与用户作用域](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/configuration.md)
- [Environment Variables：agent 目录](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/environment-variables.md)
- [Extensions：可执行资源的加载](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/extensions.md)
