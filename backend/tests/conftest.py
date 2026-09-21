import os

import pytest
from fastapi.testclient import TestClient

from app import store
from app.main import app


@pytest.fixture()
def client(tmp_path, monkeypatch):
    data_file = tmp_path / "data.json"
    monkeypatch.setattr(store, "DATA_FILE", data_file)
    monkeypatch.setenv("ADMIN_USERNAME", "admin")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin123")
    with TestClient(app) as test_client:
        yield test_client


def auth(client, username, password):
    response = client.post("/auth/login", data={"username": username, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture()
def admin_headers(client):
    return auth(client, "admin", "admin123")


def register(client, username, password="password1"):
    response = client.post("/auth/register", json={"username": username, "password": password})
    assert response.status_code == 200, response.text
    return response.json()
