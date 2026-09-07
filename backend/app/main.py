"""FastAPI 应用入口。

启动时建表（create_all），挂载 /api 路由。题目数据持久化到 MySQL，
black/white stones 以 JSON 字符串存于 Text 列。
"""
import json
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import Base, engine, get_db
from .models import Problem
from .schemas import ProblemBrief, ProblemIn, ProblemOut


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # 启动时建表
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="go-board-api", lifespan=lifespan)


def _to_ms(dt) -> int:
    return int(dt.timestamp() * 1000)


def _to_out(p: Problem) -> ProblemOut:
    return ProblemOut(
        problemNo=p.problem_no,
        blackStones=json.loads(p.black_stones or "[]"),
        whiteStones=json.loads(p.white_stones or "[]"),
        firstPlayer=p.first_player,
        updatedAt=_to_ms(p.updated_at),
    )


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/problems", response_model=list[ProblemBrief])
def list_problems(db: Session = Depends(get_db)) -> list[ProblemBrief]:
    rows = db.execute(select(Problem).order_by(Problem.updated_at.desc())).scalars().all()
    return [ProblemBrief(problemNo=r.problem_no, updatedAt=_to_ms(r.updated_at)) for r in rows]


@app.get("/api/problems/{problem_no}", response_model=ProblemOut)
def get_problem(problem_no: str, db: Session = Depends(get_db)) -> ProblemOut:
    p = db.execute(
        select(Problem).where(Problem.problem_no == problem_no)
    ).scalar_one_or_none()
    if p is None:
        raise HTTPException(status_code=404, detail="problem not found")
    return _to_out(p)


@app.post("/api/problems", response_model=ProblemOut)
def upsert_problem(payload: ProblemIn, db: Session = Depends(get_db)) -> ProblemOut:
    p = db.execute(
        select(Problem).where(Problem.problem_no == payload.problemNo)
    ).scalar_one_or_none()

    black = json.dumps(payload.blackStones)
    white = json.dumps(payload.whiteStones)

    if p is None:
        p = Problem(
            problem_no=payload.problemNo,
            black_stones=black,
            white_stones=white,
            first_player=payload.firstPlayer,
        )
        db.add(p)
    else:
        p.black_stones = black
        p.white_stones = white
        p.first_player = payload.firstPlayer

    db.commit()
    db.refresh(p)
    return _to_out(p)


@app.delete("/api/problems/{problem_no}", status_code=status.HTTP_204_NO_CONTENT)
def delete_problem(problem_no: str, db: Session = Depends(get_db)) -> Response:
    p = db.execute(
        select(Problem).where(Problem.problem_no == problem_no)
    ).scalar_one_or_none()
    if p is not None:
        db.delete(p)
        db.commit()
    # 幂等：不存在也返回 204
    return Response(status_code=status.HTTP_204_NO_CONTENT)
