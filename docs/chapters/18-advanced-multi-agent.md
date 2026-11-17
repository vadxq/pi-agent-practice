# Pi Agent实战：18 进阶多 Agent 编排

本章配套项目：[projects/07-multi-agent](../../projects/07-multi-agent/README.md)。从课程目录进入这个项目，后面的命令都在项目根目录执行。同一个项目可以接着用原副本，其他项目的依赖和副本要各自准备。

```bash
cd projects/07-multi-agent
npm ci --ignore-scripts --cache .pi/npm-cache
```

如果这次既要修运费，又要补使用说明，分工就有点意思了：代码 writer 盯实现，文档 writer 写说明，两边都能独立推进；等成果交回来，还得有人整合，再统一验证。把“谁能同时干、谁必须等谁”交给调度器管理，就是这里说的多 Agent 编排。

不过，只补一个等号，用第 11 章那层父子协作就够了。别为了显得阵容豪华，把改一行代码拆成七个岗位。每个节点都要请求模型、启动、等待，手头真有能独立推进的工作，再把分工细化也不迟。

## 把分工写成依赖图

两个 writer 从同一基线出发，在不同工作区产出代码和说明。integrator 收齐结果后整合，统一测试与只读审查都针对整合后的目录。依赖关系如下：

![冻结基线与任务契约](https://qnimg.vadxq.com/blog/2026/SCR-20261106-gvg.png)

两个 Agent 各有写入范围，避免同时修改 calculateShipping；到了合流点，测试要等整合完成再开始。图里的业务 DAG、合并策略和全局预算，都要由宿主实际实现。官方 subagent 示例提供 single、parallel、chain 等模式，可以参考调用方式，上述保证还需自己落实。细节可看官方文档：[官方 Subagent 示例](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/examples/extensions/subagent/README.md)

## 计划进入队列前要检查什么

planner 交来的计划，不能看着像那么回事就直接派出去。“等待代码完成”到底等哪个节点？“修改仓库”又能改哪些文件？节点契约至少得有 nodeId、dependsOn、role、workspaceRef、allowedPaths、required、budget 和 expectedArtifacts。宿主用白名单约束节点数量、深度、角色和工具，计划里写一句“我要用 shell”，可不能当成自己给自己批权限。

下面先省略预算、工作区和产物字段，只看代码、文档与整合三个节点的关系：

```json
{
  "nodes": [
    {
      "nodeId": "code", "dependsOn": [], "role": "writer",
      "allowedPaths": ["src/shipping.ts"], "required": true
    },
    {
      "nodeId": "docs", "dependsOn": [], "role": "writer",
      "allowedPaths": ["README.md"], "required": true
    },
    {
      "nodeId": "integrate", "dependsOn": ["code", "docs"],
      "role": "integrator", "allowedPaths": ["src/shipping.ts", "README.md"],
      "required": true
    }
  ]
}
```

code 与 docs 没有前置依赖，可以并行；integrate 必须等两者通过。运行前，先把练习路径映射好，补齐工作区、预算和产物类型。宿主再检查有没有重复节点、未知依赖、环、预算超额或未授权工作区；碰到任何一项，都先拒绝这份计划。

判断写入冲突时，要同时看工作区和执行顺序。同一工作区里的并发节点若要修改相交路径，必须先协调；integrate 等前置节点完成后才开始，可以在整合时处理这些路径。调度器只允许领取依赖全部通过的节点，至于失败如何传播，则按 required 和执行前确定的策略处理。

项目已提供 `plans/shipping.json` 和 `src/plan.ts`。运行 `npm run plan:check` 可离线验证依赖图并输出层次；这一步只检查计划，不会真的派出 Agent；工作区冲突检测和完整调度也还没有实现。

## 准备隔离工作区

计划中的 workspaceRef 要落到实际目录。如果练习仓库已有提交，可以在项目 .pi 下创建 detached worktree。先把以下变量替换为受控仓库的真实路径和冻结提交：

```bash
COURSE_REPO=/path/to/disposable-repository
BASE_SHA=填写真实的冻结提交ID
git -C "$COURSE_REPO" worktree add --detach "$PWD/.pi/labs/writer-code" "$BASE_SHA"
git -C "$COURSE_REPO" worktree add --detach "$PWD/.pi/labs/writer-docs" "$BASE_SHA"
```

两个 worktree 从同一个 BASE_SHA 创建，各自的修改互不影响。没有已提交基线时，用独立目录快照并记录内容摘要即可，不必为此自动创建 commit。目录分开后，仓库命令仍按第 13 章的方法隔离执行，禁止 writer 读取其他任务的可写挂载；worktree 管的是工作副本，管不到进程能读什么。

writer 完成后只交补丁、运行证据和结构化结果，不自行提交或 push。用 `git --no-pager diff` 检查实际修改范围，再由 integrator 把补丁应用到第三个干净副本。代码和文档都要对照原基线。B 如果拿 A 尚未冻结的修改当起点，交回的补丁里就会夹带 A 的工作，回头追查是谁改的，难免各说各的。

## 用一次补丁冲突检查整合流程

正常分工应尽量避免相交路径，但整合器仍要能处理冲突。另做一次实验，让两个 writer 在各自独立的工作区修改 shipping.ts 的同一区域：A 将 > 改为 >=，B 为加急费重构相邻逻辑。两份补丁即使各自通过检查，合在一起仍可能把加急费收两遍。局部都没问题，凑到一起也未必相安无事。

先核对两份原始补丁、实际 changedPaths 和基线摘要，再串行应用。遇到冲突时暂停自动覆盖，由 integrator 根据业务规则确定实现。谁最后完成，并不能决定运费该怎么算；整文件覆盖还会丢失另一份修改。整合后重跑国内 4999/5000/5001、国际与加急检查，并重新委派只读 reviewer。

只要整合改变了任一 writer 的语义，它先前通过的局部验证就不能证明最终结果正确。统一验证必须在最终整合目录执行。还要保留每份补丁的 nodeId、基线摘要、修改路径、局部验证和产物摘要，以及 integrator 接受、修改或拒绝它的记录。最终代码可能和两份原始补丁都不同，保留这些记录，接手的人才知道它为什么变成这样；不需要为此自动创建 Git commit。

## 处理节点失败、预算和取消

code 没做成，docs 写得再好，也不能算整个任务完成。辅助文档如果允许缺席，可以在执行前标成 optional，失败时在主报告披露；required 就一直按必需项处理。等失败了再改成“这项其实不重要”，多少有点考完试再划掉错题的意思，报告好看了，承诺的东西却少了。

动态计划新增节点时，先占用明确的委派额度，再入队。父预算应同时计算已完成、正在请求和已预约的节点，还在途中的并行请求也占着预算，账单没回来，不代表这笔钱还没花出去。这种保守预留无法保证模型服务结算绝对零超支，但能阻止 planner 在预算将尽时继续扩张任务图。

父子共用一份预算，由同一个口径计算剩余额度后再派发，避免各自看着“还有钱”同时发出请求。若统计出现重复计费，先查是否将节点累计又加到了已经包含它的全局累计上。

叶子节点交回答案后，子进程可能仍占着执行槽位。给 waiting、running、completing 分别定好退出条件，完成时也要确认资源已经回收。交了答卷还占着考场，下一场就进不来。节点显示完成而进程仍在运行，就回查这项条件；取消后仍派发下游，则检查调度入口是否读取了父任务状态。

按探查、写入、整合和审查四个阶段分别注入取消，查看各阶段留下的文件、进程与清理顺序。预期是取消后停止派发新节点，必需节点失败时整体失败。整合完成后仍须在最终目录验证，局部检查的“通过”只覆盖各自改动。

## 比较三种执行方式

保留校验后的无环计划、两个独立写入工作区，以及上述冲突和整合记录，再用第 15 章的同一任务集比较单 Agent、一层父子和 DAG。比较总成功数、首次可审阅结果耗时、全部 token、冲突数与人工决策数。

如果文档只需一秒工具操作，专门请个 writer，光等它开工就可能更久。分头干活能省时间，前提是活本身足够多；否则忙的主要是交接，真正的工作倒在一旁排队。

## 参考资料

- [Pi 官方 Subagent 示例](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/examples/extensions/subagent/README.md)
- [Pi SDK 的 session 与工具配置](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/sdk.md)
- [Git worktree 官方手册](https://git-scm.com/docs/git-worktree)
- [Pi 隔离环境说明](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/containerization.md)
