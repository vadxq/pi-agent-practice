# Pi Agent实战：21 跨语言 RPC 集成

本章配套项目：[projects/10-rpc-client](../../projects/10-rpc-client/README.md)。从课程目录进入这个项目，后面的命令都在项目根目录执行。同一项目的副本可以沿用，其他项目的依赖和副本各自准备。

```bash
cd projects/10-rpc-client
npm ci --ignore-scripts --cache .pi/npm-cache
```

现有服务用 Python 写，也用不着为了接 Pi 把业务重写成 TypeScript。开一个 Pi 子进程，通过 RPC 向 stdin 发命令，从 stdout 接响应和事件，就能打交道。代价是超时、取消、进程回收都要由客户端接住。这里用 Python 3.11+ 做一个单次问答客户端；同一 Node 进程里通常选 SDK，TypeScript 要跨进程则可以优先用官方 RpcClient。细节可看官方文档：[RPC 选型](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/rpc.md)

## 命令响应与运行结束是两件事

stdin 每行收一条 JSON 命令，stdout 把 response 和 session 事件混着送回来。发了 prompt，下一行可不保证就是它的响应，也许先来一条运行事件，或者另一条命令的回复。每条命令配个唯一 id，客户端就能认领自己的响应，用不着猜谁先到。至于活干没干完，还要继续看事件，不能收着回执就关门。

配对成功后，按以下状态决定要等到什么时候：

- prompt 的 success=true 表示已接纳、排队或被处理，不能据此认定模型已完成。
- agent_end 结束一次低层运行，session 随后仍可能自动重试、压缩或处理队列。
- agent_settled 才表示这些自动工作已经结束。
- 若 prompt 响应的 disposition 是 handled，它没有启动运行，不应继续等待 settled。

客户端要等什么、什么时候能结束，就按这些状态判断。细节可看官方文档：[RPC 命令](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/rpc-commands.md)、[事件](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/json.md)

## 运行一次无工具问答

先用无工具问答检查进程和协议。子进程 cwd 使用课程自带的 `sample-repo`，这个目录已经存在，不需要初始化含缺陷的练习副本。客户端已提供在 `src/rpc_client.py`，并通过两个环境变量选择已认证的 provider/model。

程序从本章项目根目录启动。stderr 直接接到当前终端，错误能看见，也不会因为没人读取而堵住子进程。stdout 留给 JSONL 协议，别往这条通道里夹带闲聊。

```python
import asyncio
import json
import os
from pathlib import Path

async def send(proc: asyncio.subprocess.Process, data: dict[str, object]) -> None:
    if proc.stdin is None:
        raise RuntimeError("Pi stdin unavailable")
    proc.stdin.write((json.dumps(data) + "\n").encode())
    await proc.stdin.drain()

async def receive(proc: asyncio.subprocess.Process) -> dict[str, object]:
    if proc.stdout is None:
        raise RuntimeError("Pi stdout unavailable")
    line: bytes = await proc.stdout.readline()
    if not line:
        raise RuntimeError("Pi exited before protocol completion")
    value: object = json.loads(line)
    if not isinstance(value, dict):
        raise ValueError("RPC line must be an object")
    return value

async def complete(proc: asyncio.subprocess.Process) -> str:
    accepted: bool = False
    settled: bool = False
    last_assistant: dict[str, object] = {}
    while not (accepted and settled):
        event: dict[str, object] = await receive(proc)
        if event.get("type") == "response" and event.get("id") == "prompt-1":
            if event.get("success") is not True:
                raise RuntimeError("Prompt rejected: " + json.dumps(event))
            accepted = True
            data: object = event.get("data")
            if isinstance(data, dict) and data.get("disposition") == "handled":
                return "handled"
        if event.get("type") == "message_end":
            message: object = event.get("message")
            if isinstance(message, dict) and message.get("role") == "assistant":
                last_assistant = message
        if event.get("type") == "agent_settled":
            if event.get("aborted") is True:
                raise RuntimeError("Pi run aborted")
            settled = True
    if last_assistant.get("stopReason") in ("error", "aborted"):
        raise RuntimeError("Model failed: " + json.dumps(last_assistant))
    return "settled"

async def wait_abort(proc: asyncio.subprocess.Process) -> None:
    while True:
        event: dict[str, object] = await receive(proc)
        if event.get("type") == "response" and event.get("id") == "cancel-1":
            if event.get("success") is not True:
                raise RuntimeError("Abort rejected: " + json.dumps(event))
            return

async def main() -> None:
    executable: str = str(Path(__file__).resolve().parents[1].joinpath("node_modules/.bin/pi"))
    proc: asyncio.subprocess.Process = await asyncio.create_subprocess_exec(
        executable, "--mode", "rpc", "--no-session", "--no-tools",
        "--no-extensions", "--no-mcp", "--no-skills",
        "--no-prompt-templates", "--no-context-files",
        "--provider", os.environ["COURSE_RPC_PROVIDER"],
        "--model", os.environ["COURSE_RPC_MODEL"],
        cwd=str(Path(__file__).resolve().parents[1].joinpath("sample-repo")),
        stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
        limit=1_048_576,
    )
    try:
        await send(proc, {
            "id": "prompt-1", "type": "prompt",
            "message": "国内5000分免基础费，加急另收800分，总运费多少？",
        })
        try:
            outcome: str = await asyncio.wait_for(complete(proc), timeout=30.0)
            print({"protocol": outcome, "businessValidation": "not_run"})
        except TimeoutError:
            await send(proc, {"id": "cancel-1", "type": "abort"})
            await asyncio.wait_for(wait_abort(proc), timeout=5.0)
            raise TimeoutError("Task deadline reached; abort acknowledged")
    finally:
        if proc.returncode is None:
            proc.terminate()
        try:
            await asyncio.wait_for(proc.wait(), timeout=5.0)
        except TimeoutError:
            proc.kill()
            await proc.wait()

if __name__ == "__main__":
    asyncio.run(main())
```

运行 `npm start`，预期得到 protocol=settled、businessValidation=not_run：客户端已等到运行结束，模型文本或仓库补丁的验收仍未执行。handled 同样只描述协议处理情况，业务成功还需另外判断。要显示回答，就从 message_end 的 content 里取文本块；整行 JSON 还装着协议字段，没必要把信封一起展示给用户。

## 超时为何先发 abort

asyncio.wait_for 超时，取消的是 Python 这边的协程，Pi 那边可能还在忙着请求模型、运行工具。像挂了电话，对方可未必知道你不等了。代码因此要发 abort，等待命令响应；官方 abort 响应会等到 session 空闲。随后 finally 终止、回收子进程，超过退出期限再 kill。本例没有工具后代，生产执行器还得管理整个进程组或容器，免得父进程走了，工具进程还在加班。细节可看官方文档：[Python asyncio 子进程](https://docs.python.org/3/library/asyncio-subprocess.html)

再看自动重试的情况：网络暂态错误发生后，事件里可能先出现 agent_end，Pi 随后继续重试。这时候关掉进程，就会把正在进行的恢复截断。客户端应继续消费到 agent_settled，再检查最后一个 assistant 的错误状态和业务验收。

## 扩展为服务时，分别管理命令与任务

单次问答只用了 prompt-1 和 cancel-1。扩展到多条并发命令时，用 pending[id] 管理各命令响应，再用 started、settled、aborted 跟踪会话运行。例如 prompt 还在运行，get_state 就可能先返回；客户端收下这条状态响应后，仍须继续等待 prompt。

如果事件不含业务 taskId，宿主就按子进程的唯一任务所有者关联事件。多个业务任务要共用一个子进程，就得先说清它归谁管、事件算到谁头上。否则命令响应虽然能按 id 配对，运行事件却未必找得到正确任务，这样的子进程不能混用。

协议状态和业务状态也各有依据。中途出现的 error 可能被重试恢复，按事件顺序将完整历史写入受控日志，这样便能分清哪些错误后来恢复了，哪些才是最终失败。最后一个 assistant 没有 error，接下来仍要检查运费规则，业务才算得到验收。

退出码也别一人包揽所有结论。客户端主动 terminate，可能得到非零退出码；业务报告缺了，进程却可能照样以零退出。把它单列为清理结果，和“收到 settled”“最后响应正常”“必需验收通过”一起留下，出了问题才能分清是哪一层没交上差。

## 行协议、版本与交互请求

JSONL 的一行可能分多次读到，操作系统的读取边界与行边界并不重合。Python readline 已经处理了这种分片；若改用 socket 或底层字节流，就缓存未完成片段，遇到换行再解析。EOF 后只剩半行，就报告协议中断。JSON 缺了半截，客户端不能靠阅读理解给它补完。图像和工具结果可能远大于文本，超过行长限制时显式中止并记录原因，避免缓冲区无限增长。

协议不会自动协商兼容方式，所以要固定 Pi 包版本。升级后，response 字段、事件名称和 handled/queued 行为都重新核对一遍。遇到未知事件，可以先保留诊断记录；若未知的是关键终止状态，客户端便无法确认完成，应报告这一缺口，不能记为成功。

扩展 UI 还有自己的一套请求和响应。本例禁用了扩展，所以不用处理交互对话。以后要启用，就得给这些请求安排明确的回应方式，否则子进程可能守着一个根本不存在的界面，等用户点下永远不会出现的按钮。

## 用故障检查客户端的等待条件

先脱离模型检查基础协议：同时写入两个不同 id 的 get_state，再写入 abort，按 id 收齐三条响应，然后关闭 stdin、等待退出。这可以覆盖启动、行协议和进程回收，真实 prompt 仍需另外运行。基础协议都没通，就先查安装和进程。这时还没轮到模型上场，改 prompt 帮不上忙。

随后让 get_state 与 prompt 并发，并检查错误模型、超时取消、提前退出和畸形 JSON。做取消实验时，可以临时缩短完整客户端的等待时间，记下 prompt 接纳、abort 响应和进程退出的实际次序，等后台工作停止后再报告取消完成。最后恢复正常超时，重跑一次普通问答，确认没有遗留进程或占用。

排障时先看事件类型和响应 id：JSON 解析失败，检查是否把 stderr 合并进了 stdout；收到响应却一直等待，检查 handled 或排队状态；进程退出却没有 settled，记录协议中断和退出码。确需完整消息时，存入受控位置，不要把带源码的工具输出、用户认证信息或 provider 错误原样写进公共终端日志。把 Python 和 Pi 的精确版本也记下来，排查时就能看出是否与版本差异有关。

## 参考资料

- [Pi RPC 总览与生命周期](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/rpc.md)
- [RPC Commands](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/rpc-commands.md)
- [JSON 事件与 agent_settled](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/json.md)
- [Python asyncio subprocess](https://docs.python.org/3/library/asyncio-subprocess.html)
