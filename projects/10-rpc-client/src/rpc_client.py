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
