import sqlite3
import sys
from pathlib import Path

Path(".pi/labs").mkdir(parents=True, exist_ok=True)

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
