"""Secure server-side authentication and persistent account management for EduGuard Agent."""
import hashlib
import json
import os
import secrets
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import Depends, HTTPException, Header, status
from pydantic import BaseModel

from .store import DATA_DIR

ACCOUNTS_FILE = DATA_DIR / "accounts.json"
SESSIONS: dict[str, dict] = {}


def hash_password(password: str, salt: Optional[str] = None) -> tuple[str, str]:
    if not salt:
        salt = secrets.token_hex(16)
    hashed = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000).hex()
    return hashed, salt


def verify_password(password: str, hashed: str, salt: str) -> bool:
    check_hash, _ = hash_password(password, salt)
    return secrets.compare_digest(check_hash, hashed)


def load_accounts() -> list[dict]:
    if not ACCOUNTS_FILE.exists():
        # Seed default administrator account if none exists
        default_hash, default_salt = hash_password("Admin@EduGuard2026!")
        initial = [
            {
                "id": "ADM-001",
                "first_name": "SentrX",
                "last_name": "Administrator",
                "email": "admin@sentrx.edu",
                "password_hash": default_hash,
                "salt": default_salt,
                "role": "Chief Information Security Officer",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        ]
        save_accounts(initial)
        return initial
    try:
        return json.loads(ACCOUNTS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return []


def save_accounts(accounts: list[dict]):
    ACCOUNTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    ACCOUNTS_FILE.write_text(json.dumps(accounts, indent=2), encoding="utf-8")


class SignupRequest(BaseModel):
    first_name: str
    last_name: str
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class UserResponse(BaseModel):
    id: str
    first_name: str
    last_name: str
    name: str
    email: str
    role: str


class AuthResponse(BaseModel):
    token: str
    user: UserResponse


def create_session(user_dict: dict) -> str:
    token = secrets.token_hex(32)
    SESSIONS[token] = {
        "user_id": user_dict["id"],
        "email": user_dict["email"],
        "name": f"{user_dict['first_name']} {user_dict['last_name']}".strip(),
        "role": user_dict.get("role", "Administrator"),
        "first_name": user_dict["first_name"],
        "last_name": user_dict["last_name"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    return token


def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authentication token. Please log in.",
        )
    token = authorization.split("Bearer ")[1].strip()
    session = SESSIONS.get(token)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired or invalid. Please log in again.",
        )
    return session
