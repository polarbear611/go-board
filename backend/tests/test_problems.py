"""后端接口 pytest（M2）。

使用 FastAPI TestClient + sqlite 内存库（每个测试前清表）。
运行：DATABASE_URL=sqlite:///:memory: pytest backend/tests -q
（若未设 DATABASE_URL，本文件 conftest 会兜底设置。）
"""
import time

import pytest
from fastapi.testclient import TestClient

from app.db import Base, engine
from app.main import app


@pytest.fixture(autouse=True)
def _clean_db():
    # 每个用例前重建表，保证隔离
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def _payload(no="235", first="black"):
    return {
        "problemNo": no,
        "blackStones": ["D4", "Q16"],
        "whiteStones": ["Q4"],
        "firstPlayer": first,
    }


def test_b1_post_then_get(client):
    # B1 POST 新建 → GET 内容一致
    r = client.post("/api/problems", json=_payload())
    assert r.status_code == 200
    r = client.get("/api/problems/235")
    assert r.status_code == 200
    body = r.json()
    assert body["problemNo"] == "235"
    assert body["blackStones"] == ["D4", "Q16"]
    assert body["whiteStones"] == ["Q4"]
    assert body["firstPlayer"] == "black"
    assert isinstance(body["updatedAt"], int)


def test_b2_upsert_no_dup(client):
    # B2 同 problemNo 重复 POST → 覆盖，列表不重复
    client.post("/api/problems", json=_payload(first="black"))
    r = client.post(
        "/api/problems",
        json={
            "problemNo": "235",
            "blackStones": ["A1"],
            "whiteStones": [],
            "firstPlayer": "white",
        },
    )
    assert r.status_code == 200
    body = client.get("/api/problems/235").json()
    assert body["blackStones"] == ["A1"]
    assert body["whiteStones"] == []
    assert body["firstPlayer"] == "white"
    lst = client.get("/api/problems").json()
    assert [x["problemNo"] for x in lst] == ["235"]


def test_b3_list_sorted_desc(client):
    # B3 列表数量/题号正确，按更新时间倒序
    client.post("/api/problems", json=_payload(no="100"))
    time.sleep(0.01)
    client.post("/api/problems", json=_payload(no="200"))
    time.sleep(0.01)
    client.post("/api/problems", json=_payload(no="300"))
    lst = client.get("/api/problems").json()
    nos = [x["problemNo"] for x in lst]
    assert nos == ["300", "200", "100"]
    assert all("updatedAt" in x for x in lst)


def test_b4_get_missing_404(client):
    # B4 GET 不存在 → 404
    r = client.get("/api/problems/does-not-exist")
    assert r.status_code == 404


def test_b5_delete_then_404_idempotent(client):
    # B5 DELETE 后再 GET → 404；DELETE 幂等
    client.post("/api/problems", json=_payload(no="535"))
    r = client.delete("/api/problems/535")
    assert r.status_code == 204
    assert client.get("/api/problems/535").status_code == 404
    # 再次删除仍 204（幂等）
    assert client.delete("/api/problems/535").status_code == 204


def test_b6_invalid_body_422(client):
    # B6 缺字段 → 422
    r = client.post("/api/problems", json={"blackStones": [], "whiteStones": []})
    assert r.status_code == 422
    # problemNo 空 → 422
    r = client.post(
        "/api/problems",
        json={
            "problemNo": "  ",
            "blackStones": [],
            "whiteStones": [],
            "firstPlayer": "black",
        },
    )
    assert r.status_code == 422
    # firstPlayer 非法 → 422
    r = client.post(
        "/api/problems",
        json={
            "problemNo": "9",
            "blackStones": [],
            "whiteStones": [],
            "firstPlayer": "green",
        },
    )
    assert r.status_code == 422


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
