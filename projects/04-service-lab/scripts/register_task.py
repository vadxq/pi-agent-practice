import sqlite3
from pathlib import Path

Path(".pi/labs").mkdir(parents=True, exist_ok=True)

db = sqlite3.connect(".pi/labs/service-contract.sqlite")
db.execute("""CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL,
  request_id TEXT NOT NULL, spec_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  UNIQUE(owner_id, request_id)
)""")
db.execute("BEGIN IMMEDIATE")
db.execute(
    "INSERT OR IGNORE INTO tasks VALUES (?, ?, ?, ?, ?)",
    ("task-demo", "alice", "shipping-001", "canonical-hash-demo", "queued"),
)
row = db.execute(
    "SELECT id, spec_hash, status FROM tasks WHERE owner_id=? AND request_id=?",
    ("alice", "shipping-001"),
).fetchone()
db.commit()
print(row)
db.close()
