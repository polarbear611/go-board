"""pytest 根 conftest：

1. 兜底设置 DATABASE_URL 为 sqlite（若调用方未显式提供），保证测试不连 MySQL。
   必须在 import app.db 之前生效，故放在最早加载的 conftest 中。
2. backend/ 作为 rootdir，使 `import app.*` 可用（无需额外 PYTHONPATH）。
"""
import os
import sys

os.environ.setdefault("DATABASE_URL", "sqlite:///./test_problems.db")

# 确保能 import app 包
sys.path.insert(0, os.path.dirname(__file__))
