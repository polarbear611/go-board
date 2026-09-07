"""ORM 模型。

black_stones / white_stones 用 Text 存 json.dumps 后的字符串，
以保证 SQLite 与 MySQL 双端兼容（避免 JSON 类型差异）。
读取时由 schemas / 路由层 json.loads 还原为 list[str]。
"""
from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text

from .db import Base


class Problem(Base):
    __tablename__ = "problems"

    id = Column(Integer, primary_key=True, autoincrement=True)
    problem_no = Column(String(64), unique=True, index=True, nullable=False)
    black_stones = Column(Text, nullable=False, default="[]")
    white_stones = Column(Text, nullable=False, default="[]")
    first_player = Column(String(8), nullable=False, default="black")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )
