"""数据库连接与会话工厂。

生产环境用 MySQL（通过 MYSQL_* 环境变量构造连接串）；
测试环境可设置 DATABASE_URL 直接覆盖（例如 sqlite），便于 pytest。
"""
import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker


def _build_database_url() -> str:
    # 测试 / 显式覆盖优先
    override = os.getenv("DATABASE_URL")
    if override:
        return override

    user = os.getenv("MYSQL_USER", "root")
    password = os.getenv("MYSQL_PASSWORD", "")
    host = os.getenv("MYSQL_HOST", "mysql")
    port = os.getenv("MYSQL_PORT", "3306")
    database = os.getenv("MYSQL_DATABASE", "go_board")
    return (
        f"mysql+pymysql://{user}:{password}@{host}:{port}/{database}"
        "?charset=utf8mb4"
    )


DATABASE_URL = _build_database_url()

# sqlite 需要 check_same_thread=False 才能在 TestClient 多线程下复用连接
connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
    future=True,
)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, future=True)

Base = declarative_base()


def get_db():
    """FastAPI 依赖：每请求一个会话，结束后关闭。"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
