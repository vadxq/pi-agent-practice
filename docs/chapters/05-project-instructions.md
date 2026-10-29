# Pi Agent实战：05项目指令与可复用步骤

本章使用配套项目 [projects/02-workflows](../../projects/02-workflows/README.md)。先从课程目录进入项目，后面的命令都在这个项目根目录执行。同一个项目可以接着用上一章的副本；换了项目，就要用它自己的依赖和副本。

```bash
cd projects/02-workflows
npm ci --ignore-scripts --cache .pi/npm-cache
COURSE_PROJECT="$PWD"
```

首次使用本项目时运行 `npm run lab:init` 创建自己的 `.pi/labs/shipping`；已有副本时不要重复初始化。本项目不读取第 02 章项目中的副本。

审过几次运费代码，你是不是已经烦透了反复敲”金额用整数分”这种话？感觉就像每天早上都要给同一个同事重新讲一遍岗位职责，永远学不会。Pi 其实给这些老要重复的东西准备了好几个”收纳盒”：长期不变的规矩扔进项目指令里，这次要审哪个文件就用 Prompt Template 传参，完整的检查流程塞进 Skill 里打包。以后换个审查范围？改个参数就搞定，再也不用把整套规矩从头到尾抄一遍了。

## 为规则、参数和流程选择资源

项目指令里还能写清楚哪些文件可以改、去哪里验证，Skill 还能附带配套文件。这三种资源说白了都是往模型嘴里塞文字；真要注册工具、拦截事件或阻止调用，那就得请 Extension 出马了。细节可看官方文档：[配置与上下文文件](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/configuration.md)、[扩展定位](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/extensions.md)

文件倒是分好类了，但规则可不能到处养私生子。这边说满 5000 免邮费，那边写成 5001，再聪明的模型也得被这场自家人的争论搞得一脸懵。让业务规则有个明确出处，模板老老实实传参数，Skill 专心讲检查方法，就不会到处都是要同步更新的副本了。

## 在练习仓库创建 AGENTS.md

在 `.pi/labs/shipping/AGENTS.md` 写入以下内容，作用于练习仓库，不改本章项目根目录与个人全局规则：

```markdown
# 运费练习约束

- 金额单位是整数分。国内满5000分免基础费，否则500；国际基础费2000；加急额外800。
- 只修改调用方明确允许的练习文件，不修改正式fixture或削弱验收。
- 分清源码推断、实际运行结果与未知项；报告给出文件证据。
- 不自动执行git commit或git push。
- 验收由本章项目根目录的npm run lab:check执行；当前目录不同先确认路径。
```

Pi 会从 agent 目录、当前目录和父目录往上找上下文文件。同目录的 AGENTS.override.md 只能替换当前这一层的普通指令，管不到其他层级；别指望扔一个 override 文件，就能让整条目录链上的规则集体打烊。还有，上下文文件的发现可不看项目 trust，就算你拒绝了 trust，Pi 照样可能读仓库指令。细节可看官方文档：[Context files](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/configuration.md#context-files)

下面从本章项目根目录执行一个子 shell；只有 Pi 子进程在练习目录中运行，主终端仍留在本章项目根目录：

```bash
(cd .pi/labs/shipping && "$COURSE_PROJECT/node_modules/.bin/pi" --no-extensions --no-mcp --no-skills --no-prompt-templates --tools read,grep,find,ls)
```

可以请 Pi 复述规则，再读源码给出对应证据，看看这份指令有没有送到。能背出”禁止 commit”那句话，说明它确实看到了；但要真正拦住提交，还得配置执行层才行。纸上写的门禁制度，可不会自己长出一把锁来。

## 用模板传入审查范围

仓库提供完整模板 [shipping-review.md](../../projects/02-workflows/prompts/shipping-review.md)。内容如下，可直接阅读，不需要全局安装：

```markdown
---
description: 审阅运费练习的指定文件或改动
argument-hint: "<审查范围>"
---
审查范围：$ARGUMENTS。
先读取本次diff与相关实现，核对国内5000分免邮、国际2000、加急800。
给出文件和行号、判断依据、未验证项。不修改文件，不自动commit/push。
如果没有实际运行验证，明确写“未运行”。
```

文件名 `shipping-review.md` 形成 `/shipping-review` 命令，调用参数替换 `$ARGUMENTS`。传入 `src/shipping.ts`，展开后的消息就限定到这个文件。模板只展开文本，检查仍需后续工具调用。细节可看官方文档：[Prompt Templates](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/prompt-templates.md)

模板要求读取本次 diff，但这次启动没给 Pi 配 shell 工具，这一步需要你搭把手：在练习目录的终端中运行 `git --no-pager diff`，把实际输出随审查请求一起提供；也可以存成本地文件，再交给 read 读取。

退出后，用显式路径加载课程模板：

```bash
(cd .pi/labs/shipping && "$COURSE_PROJECT/node_modules/.bin/pi" --no-extensions --no-mcp --no-skills --no-prompt-templates --prompt-template "$COURSE_PROJECT/prompts/shipping-review.md" --tools read,grep,find,ls)
```

输入 `/shipping-review src/shipping.ts`，核对展开后的范围。`--no-prompt-templates` 关闭自动发现，显式指定的文件仍加载；修改模板后执行 `/reload`，新内容才参与后续比较。

## 用 Skill 保存完整检查步骤

完整 [shipping-review/SKILL.md](../../projects/02-workflows/skills/shipping-review/SKILL.md) 将边界、地区分支、证据与未验证项整理成六步检查。Pi 起初只取得 name、description 和路径，遇到相关任务才读全文，每次请求就不必背着整份流程走。也可以显式调用 `/skill:shipping-review`。细节可看官方文档：[Skills](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/skills.md)

在前面的启动命令增加 `--skill "$COURSE_PROJECT/skills/shipping-review"`，保留 `--no-skills`，只加载这份显式资源。输入 `/skill:shipping-review 检查src/shipping.ts`，看它有没有读全文、有没有按检查表给出证据，哪一步漏了也记下来。

Skill 写得再周全，也得有工具才能干活。这次只给了读取工具，流程里那句“运行验证”只能记成“未运行”，留给后续有执行权限的步骤。附带脚本、写上 allowed-tools 都能说明用途，实际能调用什么，还是宿主配置说了算。

## 核对加载结果与规则来源

这些资源用不着一口气全打开。先加上项目指令，看看金额单位对不对得上号；再用模板，确认范围有没有框准；最后启用 Skill，检查项目是不是齐全了。每次改动都有理由，出了岔子也好往回找。把加载路径和版本记下来，以后迁到 SDK 还能重建同样的环境。要是一开始把个人资源全端上来，结果变了，你连是谁帮了忙、谁添了乱都分不清。

规则打架了，得回到任务来源和文件里把冲突改掉。模型这次凑巧用了正确金额，可不代表另一份旧规则已经下岗了。还有，临时排错日志别塞进长期指令，不然下次开工它还在那里认真研究上回的事故现场呢。资源之间要是互相要求加载对方，可能绕成死循环，越读越回不到正事上。

命令没出现？就顺着显式路径、扩展名、frontmatter、同名冲突和 `/reload` 一个个查。Skill 没有自动加载？先看看 description 有没有把适用情况说清楚，再显式调用一次，确认全文读得到。

拿“国际加急审查”试一回，资源找没找到、文件证据对不对、哪些没执行、规则有没有冲突，都能在这次任务里看出来。再按第 04 章约定的输入范围重跑 Eval，就有了加入资源前后的对照。不过，“信息不足”那道题仍得排除这里的运费规则，答案都交过去了，当然不能再指望模型追问金额。模板和检查表也没增加权限，只读审查仍使用当前这组工具。

## 参考资料

本章按 Pi 1.4.0 核对，资料核对日期为 2026-10-23。

- [Configuration：上下文文件与作用域](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/configuration.md)
- [Prompt Templates：参数与发现](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/prompt-templates.md)
- [Skills：按需加载与显式调用](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/skills.md)
- [Extensions：何时需要可执行扩展](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/extensions.md)
