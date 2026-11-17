"""静态检查本项目 Python 文件，不创建工作区外的缓存。"""

import ast
import json
from pathlib import Path

ROOT: Path = Path(__file__).resolve().parents[1]
SOURCES: list[Path] = sorted((ROOT / "src").glob("*.py")) + sorted((ROOT / "scripts").glob("*.py"))
for source in SOURCES:
    ast.parse(source.read_text(), filename=str(source))
print(json.dumps({"passed": True, "python_files": len(SOURCES)}))
