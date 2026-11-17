"""启动真实 Pi RPC 子进程，离线收齐两个查询和一次 abort。"""

import asyncio
import json
from pathlib import Path

ROOT: Path = Path(__file__).resolve().parents[1]


async def check() -> None:
    process: asyncio.subprocess.Process = await asyncio.create_subprocess_exec(
        str(ROOT / "node_modules/.bin/pi"), "--mode", "rpc", "--no-session", "--no-tools",
        "--no-extensions", "--no-mcp", "--no-skills", "--no-prompt-templates", "--no-context-files",
        cwd=ROOT / "sample-repo", stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
        limit=1_048_576,
    )
    try:
        if process.stdin is None or process.stdout is None:
            raise RuntimeError("RPC pipes unavailable")
        commands: tuple[tuple[str, str], ...] = (("state-1", "get_state"), ("state-2", "get_state"), ("abort-1", "abort"))
        for identifier, command in commands:
            process.stdin.write((json.dumps({"id": identifier, "type": command}) + "\n").encode())
        await process.stdin.drain()
        pending: set[str] = {identifier for identifier, _ in commands}
        while pending:
            line: bytes = await asyncio.wait_for(process.stdout.readline(), timeout=15.0)
            if not line:
                raise RuntimeError("Pi exited before all RPC replies")
            event: object = json.loads(line)
            if not isinstance(event, dict) or event.get("type") != "response":
                continue
            identifier: object = event.get("id")
            if isinstance(identifier, str) and identifier in pending:
                if event.get("success") is not True:
                    raise RuntimeError("RPC command rejected: " + json.dumps(event))
                pending.remove(identifier)
        print(json.dumps({"passed": True, "responses": len(commands), "modelRequests": 0}))
    finally:
        if process.stdin is not None:
            process.stdin.close()
        try:
            await asyncio.wait_for(process.wait(), timeout=5.0)
        except TimeoutError:
            process.kill()
            await process.wait()


if __name__ == "__main__":
    asyncio.run(check())
