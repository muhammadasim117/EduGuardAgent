"""Step 3: API endpoints. All data is read-only and synthetic, with secure auth and proactive scan."""
from typing import Optional, Literal
from datetime import datetime, timezone, timedelta
import os

from fastapi import FastAPI, HTTPException, Query, Header, Depends
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

from .models import AccessLog, Incident, Permission, Student, User
from . import evolus
from .store import DATA_DIR, store
from .auth import (
    SignupRequest,
    LoginRequest,
    AuthResponse,
    UserResponse,
    load_accounts,
    save_accounts,
    hash_password,
    verify_password,
    create_session,
    get_current_user,
    SESSIONS,
)

app = FastAPI(
    title="Education Data Security API (mock school district)",
    description="Mock identity / SIS / access-log API for the Education Data Security Agent. All data is synthetic.",
    version="1.0.0",
)

# Allow cross-origin calls from dashboard and preview
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _same(a: str, b: str) -> bool:
    """IDs are matched case-insensitively so u001 and U001 both work."""
    return a.strip().lower() == b.strip().lower()


def _find(items, key: str, value: str, label: str):
    for item in items:
        if _same(getattr(item, key), value):
            return item
    raise HTTPException(status_code=404, detail=f"{label} '{value}' not found")


def _normalize(ts: str, end_of_day: bool) -> str:
    """Accept 'YYYY-MM-DD' or 'YYYY-MM-DD HH:MM'. A date-only upper bound covers the whole day."""
    ts = ts.strip().replace("T", " ")
    if len(ts) == 10:
        return ts + (" 23:59" if end_of_day else " 00:00")
    return ts


# ---------- auth ----------
@app.post("/auth/signup", response_model=AuthResponse, tags=["auth"])
def signup(req: SignupRequest):
    accounts = load_accounts()
    email_clean = req.email.strip().lower()
    if any(acc["email"].lower() == email_clean for acc in accounts):
        raise HTTPException(status_code=400, detail="An account with this email address already exists")

    if len(req.password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters long")

    pwd_hash, salt = hash_password(req.password)
    user_id = f"ADM-{len(accounts) + 1:03d}"
    new_user = {
        "id": user_id,
        "first_name": req.first_name.strip(),
        "last_name": req.last_name.strip(),
        "email": email_clean,
        "password_hash": pwd_hash,
        "salt": salt,
        "role": "Security Administrator",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    accounts.append(new_user)
    save_accounts(accounts)

    token = create_session(new_user)
    return {
        "token": token,
        "user": {
            "id": new_user["id"],
            "first_name": new_user["first_name"],
            "last_name": new_user["last_name"],
            "name": f"{new_user['first_name']} {new_user['last_name']}".strip(),
            "email": new_user["email"],
            "role": new_user["role"],
        },
    }


@app.post("/auth/login", response_model=AuthResponse, tags=["auth"])
def login(req: LoginRequest):
    accounts = load_accounts()
    email_clean = req.email.strip().lower()
    user = next((acc for acc in accounts if acc["email"].lower() == email_clean), None)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not verify_password(req.password, user["password_hash"], user["salt"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_session(user)
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "first_name": user["first_name"],
            "last_name": user["last_name"],
            "name": f"{user['first_name']} {user['last_name']}".strip(),
            "email": user["email"],
            "role": user.get("role", "Security Administrator"),
        },
    }


@app.post("/auth/logout", tags=["auth"])
def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split("Bearer ")[1].strip()
        SESSIONS.pop(token, None)
    return {"status": "logged_out", "message": "Session successfully terminated"}


@app.get("/auth/me", response_model=UserResponse, tags=["auth"])
def me(current_user: dict = Depends(get_current_user)):
    return {
        "id": current_user["user_id"],
        "first_name": current_user["first_name"],
        "last_name": current_user["last_name"],
        "name": current_user["name"],
        "email": current_user["email"],
        "role": current_user["role"],
    }


# ---------- meta ----------
@app.get("/health", tags=["meta"])
def health():
    issues = store.integrity_issues()
    return {
        "status": "ok" if not issues else "data_issues",
        "data_dir": str(DATA_DIR),
        "records": store.counts(),
        "integrity_issues": issues,
        "gemini_configured": evolus.gemini_configured(),
        "amd_direct_configured": evolus.amd_configured(),
        "analysis_provider": os.environ.get("ANALYSIS_PROVIDER", "gemini"),
        "env_file": str(evolus.ENV_FILE) if evolus.ENV_FILE else None,
    }


@app.post("/reload", tags=["meta"])
def reload_data():
    """Re-read the JSON files (after the data partner edits them). A bad file keeps the old data."""
    try:
        store.load()
    except RuntimeError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return {"status": "reloaded", "records": store.counts()}


# ---------- scan (security audit of flagged accounts without model call) ----------
class FlaggedAccount(BaseModel):
    user_id: str
    name: str
    role: str
    employment_status: str
    account_status: str
    highest_severity: Literal["Critical", "High", "Medium", "Low"]
    rules_triggered: list[str]
    rule_severities: dict[str, str]
    flagged_logs_count: int
    related_incident_ids: list[str]
    latest_activity: str
    evidence_notes: list[str]


@app.get("/scan", response_model=list[FlaggedAccount], tags=["scan"])
def scan_accounts(
    min_severity: Literal["low", "medium", "high", "critical", "Low", "Medium", "High", "Critical"] = "low"
):
    """Scan all accounts against deterministic school district security rules.
    Does NOT invoke AI model. Filters by minimum severity threshold."""
    min_sev_lower = min_severity.lower()
    sev_rank = {"low": 1, "medium": 2, "high": 3, "critical": 4}
    min_rank = sev_rank.get(min_sev_lower, 1)

    users_by_id = {u.user_id.lower(): u for u in store.users}
    perms_by_id = {p.user_id.lower(): p for p in store.permissions}
    students_by_id = {s.student_id.lower(): s for s in store.students}
    incidents_by_user = {}
    for inc in store.incidents:
        incidents_by_user.setdefault(inc.user_id.lower(), []).append(inc)

    # Accumulate detections per user
    user_flags: dict[str, dict] = {}

    def ensure_user(uid: str):
        if uid not in user_flags:
            u = users_by_id.get(uid)
            user_flags[uid] = {
                "user": u,
                "rules": set(),
                "severities": {},
                "logs_count": 0,
                "latest_ts": "",
                "notes": [],
            }
        return user_flags[uid]

    logs = store.access_logs
    for l in logs:
        uid = l.user_id.lower()
        u = users_by_id.get(uid)
        p = perms_by_id.get(uid)
        s = students_by_id.get(l.student_id.lower())
        if not u or not p:
            continue

        hhmm = l.timestamp[11:] if len(l.timestamp) >= 16 else ""

        # Check: Departed Employee Access (Critical)
        if u.employment_status != "Active":
            entry = ensure_user(uid)
            entry["rules"].add("Departed Employee Access")
            entry["severities"]["Departed Employee Access"] = "Critical"
            entry["logs_count"] += 1
            if l.timestamp > entry["latest_ts"]:
                entry["latest_ts"] = l.timestamp
            entry["notes"].append(
                f"Log {l.log_id}: Employment status is '{u.employment_status}' but accessed student {l.student_id}."
            )

        # Check: Vendor Outside Approved District (Critical)
        if s and l.result == "success" and s.district_id not in p.authorized_districts:
            entry = ensure_user(uid)
            entry["rules"].add("Cross-District Vendor Boundary Violation")
            entry["severities"]["Cross-District Vendor Boundary Violation"] = "Critical"
            entry["logs_count"] += 1
            if l.timestamp > entry["latest_ts"]:
                entry["latest_ts"] = l.timestamp
            entry["notes"].append(
                f"Log {l.log_id}: Accessed student {s.student_id} in '{s.district_id}' outside authorized districts {p.authorized_districts}."
            )

        # Check: Out of class access (High)
        if s and l.result == "success" and s.class_ not in p.allowed_classes:
            entry = ensure_user(uid)
            entry["rules"].add("Out-of-Class Student Record Access")
            entry["severities"]["Out-of-Class Student Record Access"] = "High"
            entry["logs_count"] += 1
            if l.timestamp > entry["latest_ts"]:
                entry["latest_ts"] = l.timestamp
            entry["notes"].append(
                f"Log {l.log_id}: Accessed student in '{s.class_}' which is outside allowed classes {p.allowed_classes}."
            )

        # Check: No permission to view student records (High)
        if l.result == "success" and not p.can_view_student_records:
            entry = ensure_user(uid)
            entry["rules"].add("Unauthorized Record Access (can_view=False)")
            entry["severities"]["Unauthorized Record Access (can_view=False)"] = "High"
            entry["logs_count"] += 1
            if l.timestamp > entry["latest_ts"]:
                entry["latest_ts"] = l.timestamp

        # Check: Denied access (Medium)
        if l.result == "denied":
            entry = ensure_user(uid)
            entry["rules"].add("Denied Access Attempt")
            entry["severities"]["Denied Access Attempt"] = "Medium"
            entry["logs_count"] += 1
            if l.timestamp > entry["latest_ts"]:
                entry["latest_ts"] = l.timestamp
            entry["notes"].append(f"Log {l.log_id}: Access attempt was denied by security policy.")

        # Check: After hours access (Low)
        if hhmm and (hhmm < "07:30" or hhmm > "17:00"):
            entry = ensure_user(uid)
            entry["rules"].add("After-Hours Record Access")
            entry["severities"].setdefault("After-Hours Record Access", "Low")
            if l.timestamp > entry["latest_ts"]:
                entry["latest_ts"] = l.timestamp

    # Check static permission privilege mismatch (Teacher with Administrator level)
    for p in store.permissions:
        uid = p.user_id.lower()
        u = users_by_id.get(uid)
        if u and u.role == "Teacher" and p.permission_level == "Administrator":
            entry = ensure_user(uid)
            entry["rules"].add("Excessive Administrator Permissions")
            entry["severities"]["Excessive Administrator Permissions"] = "High"
            entry["notes"].append("Teacher role granted elevated Administrator permissions level.")

    # Check rapid bulk export (10+ successful logs within 15 minutes)
    by_user_success = {}
    for l in logs:
        if l.result == "success":
            by_user_success.setdefault(l.user_id.lower(), []).append(l)

    for uid, u_logs in by_user_success.items():
        times = [datetime.strptime(l.timestamp, "%Y-%m-%d %H:%M") for l in u_logs]
        for i, l in enumerate(u_logs):
            window = [x for x, t in zip(u_logs, times) if timedelta(0) <= t - times[i] <= timedelta(minutes=15)]
            if len(window) >= 10:
                entry = ensure_user(uid)
                entry["rules"].add("Rapid Bulk Record Download")
                entry["severities"]["Rapid Bulk Record Download"] = "High"
                entry["notes"].append(
                    f"Burst activity: {len(window)} student record accesses detected within 15 minutes starting at {l.timestamp}."
                )
                break

    # Build final list
    results: list[FlaggedAccount] = []
    for uid, data in user_flags.items():
        u = data["user"]
        if not u or not data["rules"]:
            continue

        # Determine highest severity
        max_r = 1
        highest_sev = "Low"
        for r_name in data["rules"]:
            sev = data["severities"].get(r_name, "Low")
            r_val = sev_rank.get(sev.lower(), 1)
            if r_val > max_r:
                max_r = r_val
                highest_sev = sev

        # Filter by minimum severity threshold
        if max_r < min_rank:
            continue

        related_incs = [i.incident_id for i in incidents_by_user.get(uid, [])]
        results.append(
            FlaggedAccount(
                user_id=u.user_id,
                name=u.name,
                role=u.role,
                employment_status=u.employment_status,
                account_status=u.account_status,
                highest_severity=highest_sev,
                rules_triggered=sorted(list(data["rules"])),
                rule_severities=data["severities"],
                flagged_logs_count=data["logs_count"],
                related_incident_ids=related_incs,
                latest_activity=data["latest_ts"] or "N/A",
                evidence_notes=data["notes"][:4],
            )
        )

    # Sort by highest severity (Critical first), then by flags count
    results.sort(key=lambda x: (sev_rank.get(x.highest_severity.lower(), 0), x.flagged_logs_count), reverse=True)
    return results


# ---------- users ----------
@app.get("/users", response_model=list[User], tags=["users"])
def list_users(
    role: Optional[str] = None,
    employment_status: Optional[str] = None,
    account_status: Optional[str] = None,
):
    result = store.users
    if role:
        result = [u for u in result if _same(u.role, role)]
    if employment_status:
        result = [u for u in result if _same(u.employment_status, employment_status)]
    if account_status:
        result = [u for u in result if _same(u.account_status, account_status)]
    return result


@app.get("/users/{user_id}", response_model=User, tags=["users"])
def get_user(user_id: str):
    return _find(store.users, "user_id", user_id, "User")


# ---------- permissions ----------
@app.get("/permissions", response_model=list[Permission], tags=["permissions"])
def list_permissions(user_id: Optional[str] = None):
    result = store.permissions
    if user_id:
        result = [p for p in result if _same(p.user_id, user_id)]
    return result


@app.get("/permissions/{user_id}", response_model=Permission, tags=["permissions"])
def get_permission(user_id: str):
    return _find(store.permissions, "user_id", user_id, "Permissions for user")


# ---------- students ----------
@app.get("/students", response_model=list[Student], response_model_by_alias=True, tags=["students"])
def list_students(class_name: Optional[str] = Query(None, alias="class", description="e.g. Grade 5")):
    result = store.students
    if class_name:
        result = [s for s in result if _same(s.class_, class_name)]
    return result


@app.get("/students/{student_id}", response_model=Student, response_model_by_alias=True, tags=["students"])
def get_student(student_id: str):
    return _find(store.students, "student_id", student_id, "Student")


# ---------- access logs ----------
@app.get("/access-logs", response_model=list[AccessLog], tags=["access-logs"])
def list_access_logs(
    user_id: Optional[str] = None,
    student_id: Optional[str] = None,
    action: Optional[str] = None,
    result: Optional[str] = Query(None, description="success or denied"),
    since: Optional[str] = Query(None, description="YYYY-MM-DD or YYYY-MM-DD HH:MM (inclusive)"),
    until: Optional[str] = Query(None, description="YYYY-MM-DD or YYYY-MM-DD HH:MM (inclusive)"),
    limit: int = Query(200, ge=1, le=5000),
):
    logs = store.access_logs
    if user_id:
        logs = [l for l in logs if _same(l.user_id, user_id)]
    if student_id:
        logs = [l for l in logs if _same(l.student_id, student_id)]
    if action:
        logs = [l for l in logs if _same(l.action, action)]
    if result:
        logs = [l for l in logs if _same(l.result, result)]
    if since:
        lo = _normalize(since, end_of_day=False)
        logs = [l for l in logs if l.timestamp >= lo]
    if until:
        hi = _normalize(until, end_of_day=True)
        logs = [l for l in logs if l.timestamp <= hi]
    return sorted(logs, key=lambda l: l.timestamp)[:limit]


@app.get("/access-logs/{log_id}", response_model=AccessLog, tags=["access-logs"])
def get_access_log(log_id: str):
    return _find(store.access_logs, "log_id", log_id, "Access log")


# ---------- incidents (the partner's seeded security scenarios) ----------
@app.get("/incidents", response_model=list[Incident], tags=["incidents"])
def list_incidents(user_id: Optional[str] = None, expected_risk: Optional[str] = None):
    result = store.incidents
    if user_id:
        result = [i for i in result if _same(i.user_id, user_id)]
    if expected_risk:
        result = [i for i in result if _same(i.expected_risk, expected_risk)]
    return result


@app.get("/incidents/{incident_id}", response_model=Incident, tags=["incidents"])
def get_incident(incident_id: str):
    return _find(store.incidents, "incident_id", incident_id, "Incident")


# ---------- EduGuard analysis (Evolus / AMD / Gemini AI agent) ----------
ANALYSES: dict[str, dict] = {}  # incident_id -> {"analysis": {...}, "decision": {...} | None}


class Decision(BaseModel):
    decision: Literal["approve", "reject", "escalate"]
    decided_by: str = "administrator"
    note: str = ""


@app.post("/incidents/{incident_id}/analyze", tags=["analysis"])
def analyze_incident(incident_id: str):
    """Send the raw facts for this incident to the configured AI agent and store its analysis."""
    incident = _find(store.incidents, "incident_id", incident_id, "Incident")
    try:
        analysis, provider, note = evolus.run_analysis(evolus.build_event(store, incident))
    except evolus.EvolusError as e:
        raise HTTPException(status_code=502, detail=str(e))
    record = {
        "incident_id": incident.incident_id,
        "analysis": analysis,
        "decision": None,
        "provider": provider,
        "model": analysis.get("model", "DeepSeek-V4.1-Flash" if provider == "amd_direct" else "gemini-2.5-flash"),
        "fallback_reason": note,
        "analyzed_at": datetime.now(timezone.utc).isoformat(),
    }
    ANALYSES[incident.incident_id] = record
    return record


@app.get("/analyses", tags=["analysis"])
def list_analyses():
    return list(ANALYSES.values())


@app.get("/incidents/{incident_id}/analysis", tags=["analysis"])
def get_analysis(incident_id: str):
    incident = _find(store.incidents, "incident_id", incident_id, "Incident")
    if incident.incident_id not in ANALYSES:
        raise HTTPException(status_code=404, detail="Not analyzed yet: POST /incidents/{id}/analyze first")
    return ANALYSES[incident.incident_id]


@app.post("/incidents/{incident_id}/decision", tags=["analysis"])
def decide(incident_id: str, body: Decision):
    """Administrator approves, rejects or escalates the recommendation.
    Critical safety requirement: Nothing is executed automatically."""
    incident = _find(store.incidents, "incident_id", incident_id, "Incident")
    if incident.incident_id not in ANALYSES:
        raise HTTPException(status_code=409, detail="Analyze the incident before deciding")

    ANALYSES[incident.incident_id]["decision"] = {
        **body.model_dump(),
        "decided_at": datetime.now(timezone.utc).isoformat(),
    }
    return ANALYSES[incident.incident_id]
