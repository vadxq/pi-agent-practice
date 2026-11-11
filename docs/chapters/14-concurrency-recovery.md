# Pi Agent实战：14 并发与故障恢复

本章配套项目：[projects/04-service-lab](../../projects/04-service-lab/README.md)。从课程目录进入这个项目，后面的命令都在项目根目录执行。同一项目的副本可以接着用，其他项目的依赖和副本分别准备。

```bash
cd projects/04-service-lab
npm ci --ignore-scripts --cache .pi/npm-cache
```

隔离环境准备好了，任务一多，又会碰到“现在到底谁在干活”的问题。worker 写完补丁就退出，任务表还停在 running，另一个 worker 看着像是该接手了。可旧执行器真的停了吗？文件也许已经修好，只差验证，照原任务再改一遍反而添乱。并发领取和故障恢复，都绕不开执行权。队列、父子关系和恢复入口得由服务管理，coding-agent SDK 里没有这一层。

## 分别限制根任务、请求和写入者

把十个 `runHarness()` 塞进 Promise.all 很容易，管住它们花掉的资源就没这么轻巧了。每个根任务还可能带几个子 Agent，模型请求和隔离环境跟着增加；两个写入者挤在同一工作区，还可能互相覆盖补丁。就像餐厅有十桌客人，不等于后厨只要炒十道菜。根任务、子任务、模型请求、工作区写入者，都得分别计数和限流。

单实例实验可先限制为两个根任务，每个最多两个只读 scout，同一工作区最多一个写入者，再测量实际容量。两个 scout 的请求都计入总并发与根预算，父任务必须等必需子任务到达终态、释放资源后才结束，否则调度器会提前归还仍被占用的槽位，相当于人还没离座，就把座位卖给了下一位。

## 用状态条件领取任务

领取可以脱离模型单独验证。先准备 `.pi/labs/` 目录，项目已提供 `scripts/claim.py`，核心逻辑如下。两个 worker 都尝试将同一条 queued 记录改成 running：

```python
import sqlite3
import sys

worker: str = sys.argv[1]
db: sqlite3.Connection = sqlite3.connect(
    ".pi/labs/claim.sqlite", timeout=5.0
)
db.execute("""CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY, status TEXT NOT NULL,
  worker TEXT, generation INTEGER NOT NULL
)""")
db.execute(
    "INSERT OR IGNORE INTO jobs VALUES ('shipping-claim', 'queued', NULL, 0)"
)
db.commit()
db.execute("BEGIN IMMEDIATE")
changed: int = db.execute(
    """UPDATE jobs SET status='running', worker=?, generation=generation+1
       WHERE id='shipping-claim' AND status='queued'""",
    (worker,),
).rowcount
db.commit()
print({"worker": worker, "claimed": changed == 1})
db.close()
```

领取条件写进 UPDATE，实际改到一行才算领到了任务。先看一眼空闲、再说归我，这样的口头预约不算数。在两个终端分别执行：

```bash
npm run task:claim -- worker-a
npm run task:claim -- worker-b
```

预期只有一个 worker 的 `claimed` 为 `True`，另一个为 `False`，后续运行均为 `False`。两个终端要从同一项目根目录访问同一个数据库；各拿一份数据库，当然都能成功，也就没有测到竞争。重复实验时换新的任务 id，保留仍在运行的记录，强行改回 queued 可能招来第二个执行者。

SQLite 允许多个读者，但同时只有一个写者；WAL 提升读写并存能力，不会变成多写者数据库。事务里只领取任务、做简短的状态更新，等模型回答的时间放在外面。细节可看官方文档：[SQLite WAL](https://www.sqlite.org/wal.html)、[事务](https://www.sqlite.org/lang_transaction.html)

领取后还得记下 `workerId`、`runId`、`generation` 和心跳时间。旧 worker 失联又突然回来，写状态时用当前 runId/generation 核对，就能挡住它的迟到结果。不过数据库认得新旧，文件系统可未必认：旧进程还是可能写文件。接管前确认旧执行器已经停止，或者给新运行分配独立环境，才能避免两边同时动手。

## 在修改之后、验证之前中断

在可信 shipping 练习副本中记录基线，让 Agent 将 `> 5000` 修为 `>= 5000`，随后在验证与最终报告之前终止已确认的 worker。重启后先保留这份现场，不立即重跑原 prompt。

恢复程序先找出没有终态的记录，再核对当前 diff、旧进程或容器、还能读取的 session，以及已有验证和产物。确认旧运行确实中断，才记为 interrupted；恢复使用新的 runId，接着按现场决定怎么做：

| 现场 | 恢复动作 |
|---|---|
| 已有正确补丁，缺验证 | 保留补丁，先重新验证 |
| 没有副作用，session 完整 | 经任务策略允许后继续会话 |
| 发生外部修改或执行器仍存活 | 阻止接管，解决所有权问题 |
| 外部写操作结果未知 | 查询外部操作记录，禁止盲目重放 |

工具可能先修改文件，随后才保存成功响应。session 最后还写着“准备修改”，磁盘上的 `>= 5000` 却可能已经存在。恢复判断因此要同时读取当前 diff 与执行器状态，新 session 的工具权限也要重新设定。细节可看官方文档：[SDK SessionManager](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/sdk.md)

## 取消与孤儿子任务

取消要让整条任务链都停下来：冻结新派发，把信号传给父子运行，等子任务和验证进程退出、现场存好，才写取消终态。父任务已经显示 cancelled，scout 还在悄悄请求模型，这就像店门关了，后厨还在加菜。界面不显示输出，也拦不住请求继续运行和计费。

执行器要管住整个进程组或容器。只杀掉 shell 父进程，后代进程可能还在继续干活，散会通知得传到每个人。收到心跳超时后，还得查清执行器是否存活，失联本身并不能证明它已经退出。SDK 订阅则在 finally 中解除，免得恢复后同一个事件被记录多次。

## 恢复请求、子任务与重试

恢复入口用独立 recoveryRequestId 接受请求，返回新 runId，同时保留原 taskId。报告沿着这层关系找到旧运行的 interrupted 结果、子任务和验证记录，算费用时也要带上失败尝试。失败不会让账单自动作废。恢复请求同样需要去重，免得重复扫描又创建一项并行恢复任务。

子任务结果能否复用，要看证据是否仍对应当前基线。源码变化后重跑相关探查，补丁变化后重做对应审查，reviewer 的旧结论只覆盖当时冻结的 diff。需要创建替代任务时，先停止旧子任务，或确认失联执行器已销毁。

单实例中，一个不断追加 scout 的长任务也可能占满槽位。可以限制每个根任务同时占有的槽位，让等待中的根任务轮流领取。把这些限制落实到调度里就好，用不着先为这个单实例实验另造一套分布式框架。

重试之前，得问一句：上一遍有没有已经生效？读源码、跑没有外部副作用的检查，通常可以再来；修改文件要看当前内容；创建外部资源则要靠业务操作 key 或查询机制认回结果。记录可以分成“可重复”“需核验后继续”“结果未知需人工处置”。一律重试三次，看着很有韧性，却可能把一件已经做成的事又做了两遍。

验证错误分类时，可以制造一次锁超时，确认它归为领取或存储错误，没有混进代码测试失败。验证执行所有权时，则让旧 worker 写回 ready_for_review，确认数据库依据 generation 拒绝它覆盖新运行的 failed。

服务实现后，把两个根任务竞争槽位、带两个 scout 的父任务取消、worker 中断和旧 generation 写回连起来演练。记录每个现场是否只有一个活跃写入者、孤儿进程怎样清理、留下哪些 diff，并保存恢复前后不同 runId 的验证结果。目前的领取实验只验证了 SQLite 条件更新。其他恢复行为，要等实现完成，再实际制造一次中断来确认。

## 参考资料

- [SQLite 写前日志与单写者](https://www.sqlite.org/wal.html)
- [SQLite BEGIN IMMEDIATE](https://www.sqlite.org/lang_transaction.html)
- [Pi 1.4.0 SDK 会话管理](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/sdk.md)
- [Pi Agent 生命周期](https://github.com/earendil-works/pi/blob/v1.4.0/packages/agent/README.md)
