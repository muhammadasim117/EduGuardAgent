"""Tests for the new /scan and /auth endpoints."""
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_scan_default():
    r = client.get("/scan")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) > 0
    # Every returned account must have required fields
    for acc in data:
        assert "user_id" in acc
        assert "name" in acc
        assert "role" in acc
        assert "highest_severity" in acc
        assert "rules_triggered" in acc
        assert len(acc["rules_triggered"]) > 0


def test_scan_severity_filters():
    critical = client.get("/scan?min_severity=critical").json()
    assert all(a["highest_severity"] == "Critical" for a in critical)
    assert any(a["user_id"] == "U002" for a in critical)  # Former employee
    assert any(a["user_id"] == "U029" for a in critical)  # Cross district vendor (I005)

    high = client.get("/scan?min_severity=high").json()
    assert len(high) >= len(critical)
    assert all(a["highest_severity"] in ("Critical", "High") for a in high)

    low = client.get("/scan?min_severity=low").json()
    assert len(low) >= len(high)


def test_auth_signup_login_flow():
    import uuid
    email = f"test.admin.{uuid.uuid4().hex[:8]}@sentrx.edu"
    signup_payload = {
        "first_name": "Test",
        "last_name": "Admin",
        "email": email,
        "password": "SecurePassword2026!",
    }
    # Signup
    r = client.post("/auth/signup", json=signup_payload)
    assert r.status_code == 200
    token = r.json()["token"]
    assert token
    assert r.json()["user"]["email"] == email

    # Duplicate signup should fail with 400
    r_dup = client.post("/auth/signup", json=signup_payload)
    assert r_dup.status_code == 400

    # Login with right password
    r_login = client.post("/auth/login", json={"email": email, "password": "SecurePassword2026!"})
    assert r_login.status_code == 200
    login_token = r_login.json()["token"]
    assert login_token

    # Login with wrong password
    r_bad = client.post("/auth/login", json={"email": email, "password": "WrongPassword"})
    assert r_bad.status_code == 401

    # Protected me endpoint
    r_me = client.get("/auth/me", headers={"Authorization": f"Bearer {login_token}"})
    assert r_me.status_code == 200
    assert r_me.json()["email"] == email

    # Logout
    r_logout = client.post("/auth/logout", headers={"Authorization": f"Bearer {login_token}"})
    assert r_logout.status_code == 200

    # Me after logout should fail
    r_me_after = client.get("/auth/me", headers={"Authorization": f"Bearer {login_token}"})
    assert r_me_after.status_code == 401
