"""真实 SQLite 实验：重复登记、两个进程争抢同一任务。"""

import json
import sqlite3
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

ROOT: Path = Path(__file__).resolve().parents[1]
ARTIFACTS: Path = ROOT / ".pi"
ARTIFACTS.mkdir(exist_ok=True)

with TemporaryDirectory(prefix="sqlite-check-", dir=ARTIFACTS) as directory:
    workspace: Path = Path(directory)
    registration: list[str] = [sys.executable, str(ROOT / "scripts/register_task.py")]
    first: subprocess.CompletedProcess[str] = subprocess.run(registration, cwd=workspace, text=True, capture_output=True, check=True)
    second: subprocess.CompletedProcess[str] = subprocess.run(registration, cwd=workspace, text=True, capture_output=True, check=True)
    assert first.stdout == second.stdout
    with sqlite3.connect(workspace / ".pi/labs/service-contract.sqlite") as connection:
        count: int = connection.execute("SELECT count(*) FROM tasks").fetchone()[0]
        assert count == 1
    workers: list[subprocess.Popen[str]] = [
        subprocess.Popen([sys.executable, str(ROOT / "scripts/claim.py"), name], cwd=workspace, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        for name in ("worker-a", "worker-b")
    ]
    outputs: list[str] = []
    for worker in workers:
        output, errors = worker.communicate(timeout=10)
        assert worker.returncode == 0, errors
        outputs.append(output)
    assert sum("'claimed': True" in output for output in outputs) == 1
    with sqlite3.connect(workspace / ".pi/labs/claim.sqlite") as connection:
        status: tuple[str, int] = connection.execute("SELECT status, generation FROM jobs").fetchone()
        assert status == ("running", 1)
print(json.dumps({"passed": True, "registrationRows": count, "successfulClaims": 1, "modelRequests": 0}))
