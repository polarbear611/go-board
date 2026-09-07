"""Pydantic 模型。

字段全部使用前端 camelCase（problemNo/blackStones/whiteStones/firstPlayer/updatedAt），
updatedAt 为毫秒时间戳 int，与前端 new Date(ts) 兼容。
"""
from pydantic import BaseModel, Field, field_validator


class ProblemIn(BaseModel):
    problemNo: str = Field(..., min_length=1)
    blackStones: list[str] = Field(default_factory=list)
    whiteStones: list[str] = Field(default_factory=list)
    firstPlayer: str = Field(...)

    @field_validator("problemNo")
    @classmethod
    def _non_blank(cls, v: str) -> str:
        if v is None or str(v).strip() == "":
            raise ValueError("problemNo must not be blank")
        return str(v).strip()

    @field_validator("firstPlayer")
    @classmethod
    def _valid_player(cls, v: str) -> str:
        if v not in ("black", "white"):
            raise ValueError("firstPlayer must be 'black' or 'white'")
        return v


class ProblemBrief(BaseModel):
    problemNo: str
    updatedAt: int


class ProblemOut(BaseModel):
    problemNo: str
    blackStones: list[str]
    whiteStones: list[str]
    firstPlayer: str
    updatedAt: int
