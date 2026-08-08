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
