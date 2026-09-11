"""测试写接口鉴权"""
import tempfile
from pathlib import Path
import pytest
from starlette.testclient import TestClient
from backend import server

# 保存原始实现，供 _get_api_key 单元测试恢复（client fixture 会替换它）
_ORIG_GET_API_KEY = server._get_api_key


@pytest.fixture(scope="module")
def client():
    # 强制启用鉴权：_get_api_key 返回固定 key
    server._get_api_key = lambda: "test-secret"
    # 把数据目录指向临时目录，避免污染真实 data
    server.data_dir = Path(tempfile.mkdtemp(prefix="hotdash-test-"))
    with TestClient(server.app) as c:
        yield c


def test_write_endpoint_rejects_missing_key(client):
    resp = client.post("/api/upload/day/2026-01-01", json={"date": "2026-01-01"})
    assert resp.status_code == 401


def test_write_endpoint_rejects_wrong_key(client):
    resp = client.post(
        "/api/upload/day/2026-01-01",
        json={"date": "2026-01-01"},
        headers={"X-API-Key": "wrong"},
    )
    assert resp.status_code == 401


def test_write_endpoint_accepts_correct_key(client):
    resp = client.post(
        "/api/upload/day/2026-01-01",
        json={"date": "2026-01-01"},
        headers={"X-API-Key": "test-secret"},
    )
    assert resp.status_code == 200


def test_read_endpoints_not_protected(client):
    # 读接口不需要 key
    resp = client.get("/api/dates")
    assert resp.status_code in (200, 304)


def test_get_api_key_env_precedence(monkeypatch):
    monkeypatch.setattr(server, "_get_api_key", _ORIG_GET_API_KEY)
    monkeypatch.setenv("HOT_API_KEY", "env-key")
    old_cfg = server.cfg
    try:
        server.cfg = {"server": {"api_key": "cfg-key"}}
        assert server._get_api_key() == "env-key"
    finally:
        server.cfg = old_cfg


def test_get_api_key_falls_back_to_config(monkeypatch):
    monkeypatch.setattr(server, "_get_api_key", _ORIG_GET_API_KEY)
    monkeypatch.delenv("HOT_API_KEY", raising=False)
    old_cfg = server.cfg
    try:
        server.cfg = {"server": {"api_key": "cfg-key"}}
        assert server._get_api_key() == "cfg-key"
    finally:
        server.cfg = old_cfg


def test_get_api_key_empty_disables_auth(monkeypatch):
    monkeypatch.setattr(server, "_get_api_key", _ORIG_GET_API_KEY)
    monkeypatch.delenv("HOT_API_KEY", raising=False)
    old_cfg = server.cfg
    try:
        server.cfg = {"server": {"api_key": "   "}}
        assert server._get_api_key() == ""
    finally:
        server.cfg = old_cfg


# ---- palace 写接口：比一般写接口更严 ----

@pytest.fixture
def unconfigured_key_client():
    """服务端**未配** key 的客户端。"""
    old = server._get_api_key
    server._get_api_key = lambda: ""
    server.data_dir = Path(tempfile.mkdtemp(prefix="hotdash-test-"))
    try:
        with TestClient(server.app) as c:
            yield c
    finally:
        server._get_api_key = old


def test_palace_write_routes_are_all_guarded():
    """新增 palace 写端点却忘了登记保护时，这条会失败。

    前缀守卫故意用了精确路径（见 server.py 的 _PALACE_WRITE_PATHS 注释），
    所以"不漏保护"这件事得靠这条元测试兜住，而不是靠前缀的粗放覆盖。
    """
    post_palace = {
        r.path for r in server.app.routes
        if "POST" in (getattr(r, "methods", None) or ())
        and r.path.startswith("/api/palace")
    }

    assert post_palace == set(server._PALACE_WRITE_PATHS)
    assert post_palace <= set(server._PROTECTED_WRITE_PREFIXES)
    assert post_palace <= set(server._STRICT_WRITE_PREFIXES)


def test_palace_write_rejects_missing_key(client):
    resp = client.post("/api/palace/archive", json={"chat_id": "oc_1", "rows": []})
    assert resp.status_code == 401


def test_palace_write_rejects_wrong_key(client):
    resp = client.post("/api/palace/archive", json={"chat_id": "oc_1", "rows": []},
                       headers={"X-API-Key": "wrong"})
    assert resp.status_code == 401


def test_palace_write_rejects_when_server_has_no_key(unconfigured_key_client):
    """空 key 不等于放行——palace 写接口不跟随"未配即开放"的向后兼容约定。"""
    for path in server._PALACE_WRITE_PATHS:
        resp = unconfigured_key_client.post(path, json={"chat_id": "oc_1", "rows": []})
        assert resp.status_code == 401, f"{path} 在未配 key 时应拒绝写入"


def test_palace_archive_accepts_correct_key(client):
    chat_id = server.cfg["groups"][0]["chat_id"]
    resp = client.post(
        "/api/palace/archive",
        json={"chat_id": chat_id, "rows": [
            {"id": "om_push_1", "ts": "2026-07-06 08:09", "sender": "ou_aaa", "text": "看多"},
        ]},
        headers={"X-API-Key": "test-secret"},
    )

    assert resp.status_code == 200
    assert resp.json() == {"status": "ok", "chat_id": chat_id, "received": 1, "added": 1}


def test_palace_archive_rejects_unknown_chat_id(client):
    resp = client.post("/api/palace/archive",
                       json={"chat_id": "oc_not_configured", "rows": []},
                       headers={"X-API-Key": "test-secret"})
    assert resp.status_code == 400


def test_palace_archive_rejects_malformed_body(client):
    resp = client.post("/api/palace/archive", json={"chat_id": "oc_1", "rows": "不是数组"},
                       headers={"X-API-Key": "test-secret"})
    assert resp.status_code == 400
