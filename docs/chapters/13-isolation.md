# Pi Agent实战：13 工作区与执行隔离

本章配套项目：[projects/04-service-lab](../../projects/04-service-lab/README.md)。从课程目录进入这个项目，后面的命令都在项目根目录执行。同一个项目的副本可以沿用，其他项目的依赖和副本不共享。

```bash
cd projects/04-service-lab
npm ci --ignore-scripts --cache .pi/npm-cache
```

服务知道该把任务派到哪个目录了，可指定 `cwd` 只像告诉来干活的人“工位在这儿”，并没有锁上其他房间。测试脚本照样可能读到主目录，实际权限还得看进程和执行环境。下面不用模型，直接做一个容器实验：授权源码读不读得到，只读文件写不写得进去，网络和凭据又有没有露在外面。

实验需要 Docker Engine 或兼容环境。已有验证记录中，当次环境缺少 `/var/run/docker.sock`，Docker daemon 不可达，容器命令未执行。所以下面写的是预期结果，还需要在能运行容器的环境里逐项核验。

## cwd 与执行权限分别控制什么

`cwd=.pi/labs/ch22-isolation` 决定相对路径从哪里解析，不限制 `read`、shell 命令、测试脚本或扩展访问其他宿主资源。Git worktree 也只分开工作副本与版本管理。Pi 可以整体进入隔离环境，也可以只将选定工具送入隔离环境；如果只隔离选定工具，留在宿主上的扩展工具也得逐个检查，不能顾着正门，把侧门忘了。细节可看官方文档：[Pi 隔离说明](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/containerization.md)

列挂载清单时，把只读输入、任务可写目录、宿主收集的产物分清楚。密钥、用户 Pi 配置和其他任务目录都留在外面。验证进程也使用这条边界：`npm test` 同样会执行仓库代码，不能因为名叫“测试”就多拿一把钥匙。

## 验证只读挂载、网络与凭据

命令从本章项目根目录开始，为隔离实验创建独立副本：

```bash
npm run lab:init -- --name ch22-isolation
```

同名目录存在时另选名称，同步后面的 cwd 和 bind mount 路径，保留原现场。使用项目自带的 `Dockerfile.isolation`：

```dockerfile
FROM node:24-bookworm-slim
USER node
WORKDIR /workspace
ENTRYPOINT ["node"]
```

镜像以普通用户 node 启动，工作目录是 `/workspace`。构建后，将练习副本只读挂载到这里：

```bash
docker build -t pi-course-isolation -f Dockerfile.isolation .
docker run --rm --read-only --network none \
  --cap-drop ALL --security-opt no-new-privileges:true \
  --pids-limit 64 --memory 256m --cpus 1 \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --mount "type=bind,src=$PWD/.pi/labs/ch22-isolation,dst=/workspace,readonly" \
  pi-course-isolation -e \
  'const fs=require("node:fs");console.log(fs.readdirSync("/workspace"));fs.writeFileSync("/workspace/probe.txt","x")'
```

这个小脚本有意做两件事：列出 `/workspace`，再写入 `probe.txt`。预期是“看得见，改不了”，目录列表正常出现，写入失败并非零退出。要是写进去了，就查挂载的 readonly 和目标目录。`--read-only` 管根文件系统，bind mount 的 readonly 管挂载目录，内存、CPU 和进程数各有自己的参数，别指望一个开关包办所有限制。细节可看官方文档：[Docker 运行参数](https://docs.docker.com/reference/cli/docker/container/run/)

然后保持容器参数，只替换末尾脚本，分别检查凭据和网络。`console.log(process.env.OPENAI_API_KEY === undefined)` 在没有其他注入方式时应输出 true；`fetch("https://example.com").catch(e=>{console.error(e.cause?.code);process.exitCode=1})` 在无外网配置下应失败。把实际错误和退出码记下来。不同操作系统的报错措辞可能不一样，不必要求它们背同一句台词。

镜像标签可能更新，正式部署须记录构建时解析出的 digest。基础镜像下载发生在构建阶段，`--network none` 只限制运行阶段，构建网络需另外控制。细节可看官方文档：[Docker 镜像与运行](https://docs.docker.com/engine/containers/run/)

## 从只读检查走向受限修改

只读实验通过后，再把任务工作区的挂载改成可写，其他限制照旧。容器内普通用户仍需目录写权限，Linux 主机可使用匹配的 uid/gid，或由宿主准备专属目录。运行后，宿主检查 diff 和文件清单，只将获准报告复制到产物目录。

到了 TypeScript 检查，依赖总得有个来处。运行阶段禁网，就在可信构建阶段执行 `npm install`，把锁定依赖装进工具镜像，安装生命周期脚本也一并审查。缺依赖时，挂上整个主目录或 Docker socket 可能马上就能跑了，但这有点像钥匙不好找，干脆把门拆了：宿主资源或控制能力也跟着暴露，不能拿来补这个缺口。

整个 Pi 在容器内运行时，只注入任务所需凭证，并提供受控网络出口。若 Pi 留在宿主调用模型，则须将全部仓库工具转发到隔离执行器，逐项确认 read、edit、write、bash、MCP 和扩展的执行位置。只替换 bash 会留下其他宿主入口，环境变量也可能随工具执行传入。细节可看官方文档：[Pi 凭证与扩展边界](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/containerization.md)

## 成对检查允许与拒绝

限制加得越多，失败越容易，可“什么都干不了”也不能交工。看到写入被拒绝，还得确认授权源码能正常读取、专属工作区能按要求修改；只读输入则在两种容器里都不能改。禁网以后，无网络依赖的本地检查仍该能完成。跑不起来，就继续拆开依赖下载和任务执行，看看挡住了哪一步。

symlink 也要放进实验。容器按自己的路径解析链接，工作区中的链接即使指向宿主敏感路径，也不应读到未挂载文件；但若目标位置一并挂载，文件仍可能暴露。收集产物时也要检查链接、文件类型和大小，别顺着任务生成的链接，把别处的文件也收进来了。路径与挂载限制采用成熟机制即可，无需自研“安全路径解释器”。

凭证实验记录变量是否存在、文件是否可访问，真实值不进入输出。上面的设计里，模型凭证一旦进入容器，仓库代码也可能读到，密钥与工具因而还没有隔开。需要分离时，可采用受控模型网关或官方代理方案，并另行验证允许访问的目标域名。

容器退场，现场未必就干净了。持久卷可能还在，卷上的文件也未必已经收进审计产物。容器、可写卷和报告各留多久、清理是否成功，都要按任务记下来；清理失败就留下失败状态，不能只因进程结束就宣布收拾完毕。

画执行位置图时，把工具和扩展都放上去，才容易发现“工具进了容器，扩展仍在宿主用 Node fs 读文件”这样的遗漏。再对照挂载清单，逐项排除其他任务的可写目录。权限在哪里授予，就去哪里调整；提示词写得再严肃，也收不回已经给出去的访问权。

把只读源码、可写工作区、只写产物的挂载设计，连同完整运行参数、网络和凭据策略放进实验记录，再对上越界读取、源码写入、任务目录写入、外网请求和容器清理的实际结果，才能看清这道边界画在哪里。没执行的项目就记未验证。容器仍共享宿主内核，运行不可信的多租户代码可能需要更强的隔离，得另行评估。本章这组实验还不足以为多租户安全作保证。

## 参考资料

- [Pi 1.4.0 隔离环境](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/containerization.md)
- [Docker container run 参数](https://docs.docker.com/reference/cli/docker/container/run/)
- [Docker 文件系统、网络与资源约束](https://docs.docker.com/engine/containers/run/)
