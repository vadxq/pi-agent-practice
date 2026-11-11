# Pi Agent实战：16 部署验收与版本升级

本章配套项目：[projects/04-service-lab](../../projects/04-service-lab/README.md)。从课程目录进入这个项目，后面的命令都在项目根目录执行。同一项目可以接着用原副本，其他项目的依赖和副本各自独立。

```bash
cd projects/04-service-lab
npm ci --ignore-scripts --cache .pi/npm-cache
```

本机跑通了，离“换台机器也能放心跑”还有一段路。运行环境要固定，停机时正在干的任务要有人安顿，升级留下的数据也得能继续用。本仓库已经有 SDK 示例，HTTP 服务还没实现，所以眼下可以验收安装和 SDK 运行；服务 Smoke、中断、恢复这些实验，得等对应实现准备好再做。

## 固定依赖、镜像与配置

Pi 1.4.0 要求 Node.js >=22.19.0。安装前，对着固定 tag 的 package.json 核对包名、运行时和依赖。旧博客可以参考，包名却不能照单全收，它可能还停留在上一个住址。细节可看官方文档：[Pi package.json](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/package.json)

从干净工作副本安装锁定依赖，记录运行时与包版本：

```bash
node --version
npm ci
npm ls @earendil-works/pi-coding-agent
npm run typecheck
npm run build
npm run fixture:test
npm run fixture:check
npm run service:check
```

这组命令检查的是仓库结构、构建和参考业务。真实 SDK 任务还要另外跑，把 provider、model、写入授权、工作区和证据路径一起记下来。缺少密钥，就把真实请求记为未验证，等有凭据再补跑。编出来的响应，不能替代真实调用的证据。

正式镜像固定基础镜像 digest 与 lockfile，排除用户主目录、认证文件、私有仓库缓存和临时运行记录。工作区、状态目录独立挂载，根文件系统保持只读，将第 13 章的执行限制写入部署配置。

只记一个 Pi 版本，还原不了运行环境。同样是 1.4.0，一台机器多装了扩展，行为就可能变样。版本清单里还得带上扩展、工具 allowlist、模型 ID、压缩配置、容器镜像和验收命令。服务从显式配置启动，把解析后的配置摘要记下来。密钥留个来源名称和是否可用就够了，真值别打进发布包里跟着旅行。

## 服务启动与停机 Smoke

服务实现后，可以沿用户路径做一次 Smoke：查询就绪状态，提交只读任务，查询结果并下载报告，再试非法身份、重复请求和取消。就绪表示数据库可访问、worker 可领取、执行器可用；模型服务的状态单独展示，免得每次问一句还好吗，都顺便付一次模型调用费。这次 Smoke 覆盖少量关键行为，完整评测仍使用固定任务集。

| 场景 | 必须看到的证据 |
|---|---|
| 正常任务 | 一次领取、正确终态、可读产物 |
| 重复提交 | 同一个 taskId、只有一次副作用 |
| 父任务取消 | 所有必需子任务停止、资源释放 |
| worker 中断 | interrupted 或恢复入口、已有 diff 保留 |
| 无凭据/环境故障 | 分类准确、没有假通过 |
| 停机 | 停止接收任务、在途任务有明确处置 |

停机也得讲个收拾顺序：关掉新任务入口、停止领取，让在途任务完成或取消清理，再释放数据库和其他资源。人还在交作业，收作业的人可不能先下班；数据库关早了，最后的状态便没地方存。强杀不会走这条退出路径，所以还得另做中断实验，看看崩溃后究竟留下什么。

## 按版本差异确定回归范围

以 1.3.0 升至 1.4.0 为例，先读 changelog，列出每项变化、受影响的配置或代码、对应验证。Codemode worker 繁忙时，1.4.0 会等待空闲 worker，这就要求检查默认容量和等待限制，确认外层截止时间覆盖排队，且取消能终止排队工作。细节可看官方文档：[1.4.0 Changelog](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/CHANGELOG.md)、[Codemode 限制](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/codemode.md)

在隔离分支或副本中同时更新依赖与 lockfile，再用类型检查、相关测试、shipping 完整任务和父子取消验证变化。对同一任务集，把通过数、排队时间和成本摆在一起看：原先立即失败的请求现在愿意排队了，平均延迟可能增加，通过数也可能提高。只盯着延迟，就容易把等到结果的时间当成纯粹的退步。

## 在独立副本中验证回退

部署前备份任务数据库、session 和产物索引，并记下对应程序版本。SQLite 在线备份采用受支持的备份机制，直接复制正在写入的数据库文件可能遗漏必要状态，不适合作为这里的备份方法。细节可看官方文档：[SQLite Backup](https://www.sqlite.org/backup.html)

回退也不是把 npm 版本号拨回去就完事。新版本写下的状态，旧程序可能根本读不懂。数据恢复、兼容迁移，还是禁止降级，部署前得选好；打算用旧备份恢复，也得知道备份之后那些写入丢了，会损失什么。程序能退回旧版，数据未必还认得旧程序。

演练时停止新版本，确认没有新领取者、在途执行器也已停止，再把一致快照复制到独立恢复目录，交给旧程序读取。恢复副本使用不同端口、不同工作区和独立模型预算，避免与原实例双写。先验证 taskId、报告和 session 可读，再完成一条新的只读任务并生成报告，确认恢复后仍能执行。

## 根据故障层定位问题

容器无法启动，先查镜像或权限；worker 无法领取，查调度或存储；provider 拒绝请求，查认证、额度和模型配置；业务行为检查失败，再查补丁与任务质量。问题出在哪一层，就修哪一层，或回退对应部分。数据库没连上时换个模型，也不能请它隔空把任务领走。

部署记录里的运行范围要具体到实验。例如“本机完成一次单 Agent 修改与检查、一次父子取消，未执行掉电恢复和长时负载”，读者就能据此判断下次变更还需补什么；一句“全流程稳定”交代不了这些。

容量从 1、2 个并发根任务慢慢往上加，机器、CPU/内存限制、任务种类、模型请求配额、排队和成功数都随结果记下来。只跑过两个短任务，就写“本机两任务并发验证”。两辆车能并排开过去，还算不上测过早高峰，“企业级高并发”这顶帽子可以晚点戴。

这些实验若暴露问题，可以沿现象回查：进程持续占用内存，查看事件订阅、工具输出和 session 的释放；升级后费用增加，核对物理模型、重试和压缩行为；回退后读不了 session，就保留失败副本并检查迁移说明，删除状态只会丢掉排查依据。服务、隔离和恢复都留下实际运行证据，部署记录才算覆盖这些验收项。本地静态检查做到哪里，结论就写到哪里。

## 参考资料

- [Pi 1.4.0 包与 Node 要求](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/package.json)
- [Pi Changelog](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/CHANGELOG.md)
- [Codemode 资源限制](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/codemode.md)
- [SQLite Online Backup](https://www.sqlite.org/backup.html)
