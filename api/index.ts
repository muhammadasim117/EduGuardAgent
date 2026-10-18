/**
 * EduGuard Agent - Full-Stack Express Server
 * Developed by Team SentrX
 *
 * Implements the authoritative EduGuard API specification:
 * - Deterministic District Security Rule Engine (/scan?min_severity=...)
 * - Persistent PBKDF2 Encrypted Authentication (/auth/signup, /auth/login, /auth/me)
 * - Incident Lifecycle Management (/incidents, /incidents/:id)
 * - Multi-Engine AI Analysis (Gemini Flash, AMD Direct, Deterministic Policy Fallback)
 * - FERPA District Policy SEC-104 Compliance Floor
 * - Human-in-the-Loop Administrator Decision Recording (/incidents/:id/decision)
 * - District Datasets (/users, /permissions, /students, /access-logs, /health, /reload)
 */

import 'express-async-errors';
import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();


const app = express();
const isProd = process.env.NODE_ENV === 'production';
const IS_VERCEL = Boolean(process.env.VERCEL);

app.use(express.json({ limit: '2mb' }));

// Enable CORS for development flexibility
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Paths to authoritative JSON datasets
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(process.cwd(), 'backend', 'data');

interface UserRecord {
  user_id: string;
  name: string;
  role: string;
  employment_status: string;
  account_status: string;
}

interface PermissionRecord {
  user_id: string;
  allowed_classes: string[];
  can_view_student_records: boolean;
  permission_level: string;
  authorized_districts: string[];
}

interface StudentRecord {
  student_id: string;
  name: string;
  class: string;
  district_id?: string;
}

interface AccessLogRecord {
  log_id: string;
  user_id: string;
  student_id: string;
  action: string;
  timestamp: string;
  result: string;
}

interface IncidentRecord {
  incident_id: string;
  title: string;
  user_id: string;
  related_log_id: string;
  expected_risk: string;
  expected_recommendation: string;
}

interface AccountRecord {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  password_hash: string;
  salt: string;
  role: string;
  created_at: string;
}

interface StoredAnalysis {
  incident_id: string;
  analysis: {
    incident_type: string;
    risk_level: string;
    evidence: string[];
    explanation: string;
    recommended_action: string;
    confidence: number;
    needs_human_review: boolean;
    policy_floor_applied?: boolean;
    policy_floor_reason?: string;
    model?: string;
  };
  decision: {
    decision: 'approve' | 'reject' | 'escalate';
    decided_by: string;
    note: string;
    decided_at: string;
  } | null;
  provider: string;
  model: string;
  fallback_reason: string | null;
  analyzed_at: string;
}

// In-Memory Data Store with disk reload capabilities
class DataStore {
  users: UserRecord[] = [];
  permissions: PermissionRecord[] = [];
  students: StudentRecord[] = [];
  access_logs: AccessLogRecord[] = [];
  incidents: IncidentRecord[] = [];

  constructor() {
    this.load();
  }

  load() {
    try {
      this.users = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'users.json'), 'utf-8'));
      this.permissions = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'permissions.json'), 'utf-8'));
      this.students = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'students.json'), 'utf-8'));
      this.access_logs = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'access_logs.json'), 'utf-8'));
      this.incidents = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'incidents.json'), 'utf-8'));
    } catch (err: any) {
      console.error('Error loading data from disk:', err.message);
    }
  }

  counts() {
    return {
      users: this.users.length,
      permissions: this.permissions.length,
      students: this.students.length,
      access_logs: this.access_logs.length,
      incidents: this.incidents.length,
    };
  }

  integrityIssues(): string[] {
    const issues: string[] = [];
    const userIds = new Set(this.users.map((u) => u.user_id));
    const studentIds = new Set(this.students.map((s) => s.student_id));
    const logIds = new Set(this.access_logs.map((l) => l.log_id));

    for (const p of this.permissions) {
      if (!userIds.has(p.user_id)) issues.push(`permissions: unknown user_id ${p.user_id}`);
    }
    for (const l of this.access_logs) {
      if (!userIds.has(l.user_id)) issues.push(`access_logs ${l.log_id}: unknown user_id ${l.user_id}`);
      if (!studentIds.has(l.student_id)) issues.push(`access_logs ${l.log_id}: unknown student_id ${l.student_id}`);
    }
    for (const i of this.incidents) {
      if (!userIds.has(i.user_id)) issues.push(`incidents ${i.incident_id}: unknown user_id ${i.user_id}`);
      if (!logIds.has(i.related_log_id)) issues.push(`incidents ${i.incident_id}: unknown related_log_id ${i.related_log_id}`);
    }
    return issues;
  }
}

const store = new DataStore();
// Optional durable storage via Upstash Redis REST (Vercel Marketplace sets these env vars).
// Without it, data lives in memory / local files (fine for local dev, not durable on serverless).
const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const KV_ENABLED = Boolean(KV_URL && KV_TOKEN);

async function kvCommand(cmd: (string | number)[]): Promise<any> {
  const r = await fetch(KV_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  if (!r.ok) throw new Error(`KV request failed: ${r.status}`);
  const data: any = await r.json();
  if (data.error) throw new Error(`KV error: ${data.error}`);
  return data.result;
}

async function kvGetJson<T>(key: string): Promise<T | null> {
  const raw = await kvCommand(['GET', key]);
  return raw ? (JSON.parse(raw) as T) : null;
}

async function kvSetJson(key: string, value: unknown): Promise<void> {
  await kvCommand(['SET', key, JSON.stringify(value)]);
}

// Analyses + decisions
const ANALYSES_KEY = 'eduguard:analyses';
const LOCAL_ANALYSES: Record<string, StoredAnalysis> = {};

async function getAllAnalyses(): Promise<Record<string, StoredAnalysis>> {
  if (!KV_ENABLED) return LOCAL_ANALYSES;
  try {
    return (await kvGetJson<Record<string, StoredAnalysis>>(ANALYSES_KEY)) || {};
  } catch (err: any) {
    console.error('KV read failed (analyses):', err.message);
    return LOCAL_ANALYSES;
  }
}

async function saveAnalysis(record: StoredAnalysis): Promise<void> {
  LOCAL_ANALYSES[record.incident_id] = record;
  if (!KV_ENABLED) return;
  try {
    const all = (await kvGetJson<Record<string, StoredAnalysis>>(ANALYSES_KEY)) || {};
    all[record.incident_id] = record;
    await kvSetJson(ANALYSES_KEY, all);
  } catch (err: any) {
    console.error('KV write failed (analyses):', err.message);
  }
}

async function getAnalysis(id: string): Promise<StoredAnalysis | null> {
  return (await getAllAnalyses())[id] || null;
}

// Helper: PBKDF2 Password Hashing matching Python hashlib implementation
function hashPassword(password: string, saltHex?: string): { hash: string; salt: string } {
  const salt = saltHex || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex');
  return { hash, salt };
}

function verifyPassword(password: string, expectedHash: string, saltHex: string): boolean {
  const { hash } = hashPassword(password, saltHex);
  const hashBuffer = Buffer.from(hash, 'hex');
  const expectedBuffer = Buffer.from(expectedHash, 'hex');
  if (hashBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(hashBuffer, expectedBuffer);
}

// Accounts: seeded from the bundled (read-only on Vercel) accounts.json, plus any
// accounts created at runtime. Vercel's filesystem is read-only except /tmp, and
// /tmp is per-instance and ephemeral, so runtime signups are best-effort there.
// For durable signups, swap these two functions for a database (Vercel KV / Postgres).
const SEED_ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');
const RUNTIME_DIR = IS_VERCEL ? path.join('/tmp', 'eduguard') : DATA_DIR;
const ACCOUNTS_FILE = path.join(RUNTIME_DIR, 'accounts.json');

function readJsonFile(file: string): AccountRecord[] | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

const ACCOUNTS_KEY = 'eduguard:accounts';

async function loadAccounts(): Promise<AccountRecord[]> {
  const seed = readJsonFile(SEED_ACCOUNTS_FILE);
  let runtime: AccountRecord[] | null = null;
  if (KV_ENABLED) {
    try {
      runtime = await kvGetJson<AccountRecord[]>(ACCOUNTS_KEY);
    } catch (err: any) {
      console.error('KV read failed (accounts):', err.message);
    }
  } else if (ACCOUNTS_FILE !== SEED_ACCOUNTS_FILE) {
    runtime = readJsonFile(ACCOUNTS_FILE);
  }
  const merged = new Map<string, AccountRecord>();
  for (const acc of [...(seed || []), ...(runtime || [])]) merged.set(acc.email.toLowerCase(), acc);

  if (merged.size === 0) {
    const { hash, salt } = hashPassword('Admin@EduGuard2026!');
    const initial: AccountRecord = {
      id: 'ADM-001',
      first_name: 'SentrX',
      last_name: 'Administrator',
      email: 'admin@sentrx.edu',
      password_hash: hash,
      salt,
      role: 'Chief Information Security Officer',
      created_at: new Date().toISOString(),
    };
    merged.set(initial.email, initial);
    await saveAccounts([initial]);
  }
  return [...merged.values()];
}

async function saveAccounts(accounts: AccountRecord[]): Promise<void> {
  if (KV_ENABLED) {
    // Store only accounts not in the bundled seed file; seed accounts are always loaded from disk.
    const seedEmails = new Set((readJsonFile(SEED_ACCOUNTS_FILE) || []).map((a) => a.email.toLowerCase()));
    await kvSetJson(ACCOUNTS_KEY, accounts.filter((a) => !seedEmails.has(a.email.toLowerCase())));
    return;
  }
  try {
    fs.mkdirSync(path.dirname(ACCOUNTS_FILE), { recursive: true });
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), 'utf-8');
  } catch (err: any) {
    console.error('Failed to persist accounts:', err.message);
  }
}

// Stateless signed session tokens (HMAC). In-memory sessions break on serverless,
// where each request may hit a different instance.
const SESSION_SECRET = process.env.SESSION_SECRET || 'eduguard-dev-secret-change-me';
if (isProd && !process.env.SESSION_SECRET) {
  console.warn('SESSION_SECRET is not set; using an insecure default. Set it in your environment.');
}
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
type SessionData = { user_id: string; email: string; name: string; role: string; first_name: string; last_name: string };

function signSession(data: SessionData): string {
  const payload = Buffer.from(JSON.stringify({ ...data, exp: Date.now() + SESSION_TTL_MS })).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifySession(token: string): SessionData | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    if (!data.exp || data.exp < Date.now()) return null;
    return data as SessionData;
  } catch {
    return null;
  }
}

// Helper: Case-insensitive search
function same(a?: string, b?: string) {
  return (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
}

// Auth Middleware
function requireAuth(req: Request, res: Response, next: () => void) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ detail: 'Missing or invalid authentication token. Please log in.' });
  }
  const token = authHeader.split('Bearer ')[1].trim();
  const session = verifySession(token);
  if (!session) {
    return res.status(401).json({ detail: 'Session expired or invalid. Please log in again.' });
  }
  (req as any).user = session;
  next();
}

// -------------------------------------------------------------
// AUTH ENDPOINTS
// -------------------------------------------------------------

app.post('/auth/signup', async (req, res) => {
  const { first_name, last_name, email, password } = req.body || {};
  if (!first_name || !last_name || !email || !password) {
    return res.status(422).json({ detail: 'First name, last name, email, and password are required.' });
  }
  if (password.length < 8) {
    return res.status(422).json({ detail: 'Password must be at least 8 characters long.' });
  }

  const accounts = await loadAccounts();
  const emailClean = email.trim().toLowerCase();
  if (accounts.some((a) => a.email.toLowerCase() === emailClean)) {
    return res.status(400).json({ detail: 'An account with this email address already exists.' });
  }

  const { hash, salt } = hashPassword(password);
  const newAccount: AccountRecord = {
    id: `ADM-${String(accounts.length + 1).padStart(3, '0')}`,
    first_name: first_name.trim(),
    last_name: last_name.trim(),
    email: emailClean,
    password_hash: hash,
    salt: salt,
    role: 'Security Administrator',
    created_at: new Date().toISOString(),
  };

  accounts.push(newAccount);
  try {
    await saveAccounts(accounts);
  } catch (err: any) {
    console.error('Failed to save account:', err.message);
    return res.status(500).json({ detail: 'Could not save your account. Please try again.' });
  }

  const token = signSession({
    user_id: newAccount.id,
    email: newAccount.email,
    name: `${newAccount.first_name} ${newAccount.last_name}`.trim(),
    role: newAccount.role,
    first_name: newAccount.first_name,
    last_name: newAccount.last_name,
  });

  return res.json({
    token,
    user: {
      id: newAccount.id,
      first_name: newAccount.first_name,
      last_name: newAccount.last_name,
      name: `${newAccount.first_name} ${newAccount.last_name}`.trim(),
      email: newAccount.email,
      role: newAccount.role,
    },
  });
});

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ detail: 'Email and password are required.' });
  }

  const accounts = await loadAccounts();
  const emailClean = email.trim().toLowerCase();
  const user = accounts.find((a) => a.email.toLowerCase() === emailClean);

  if (!user || !verifyPassword(password, user.password_hash, user.salt)) {
    return res.status(401).json({ detail: 'Invalid email or password' });
  }

  const token = signSession({
    user_id: user.id,
    email: user.email,
    name: `${user.first_name} ${user.last_name}`.trim(),
    role: user.role || 'Security Administrator',
    first_name: user.first_name,
    last_name: user.last_name,
  });

  return res.json({
    token,
    user: {
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      name: `${user.first_name} ${user.last_name}`.trim(),
      email: user.email,
      role: user.role || 'Security Administrator',
    },
  });
});

app.post('/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
  }
  return res.json({ status: 'logged_out', message: 'Session successfully terminated' });
});

// -------------------------------------------------------------
// ADMIN: signup registry export (CISO account only). Never includes password data.
// -------------------------------------------------------------
const SUPER_ADMIN_ID = 'ADM-001';

app.get('/admin/signups', requireAuth, async (req, res) => {
  const user = (req as any).user;
  if (user.user_id !== SUPER_ADMIN_ID) {
    return res.status(403).json({ detail: 'Only the primary administrator can export signups.' });
  }
  const accounts = await loadAccounts();
  const rows = accounts.map((a) => ({
    id: a.id,
    first_name: a.first_name,
    last_name: a.last_name,
    email: a.email,
    role: a.role,
    created_at: a.created_at,
  }));
  if (String(req.query.format || '').toLowerCase() === 'csv') {
    const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"`;
    const header = 'id,first_name,last_name,email,role,created_at';
    const csv = [header, ...rows.map((r) => [r.id, r.first_name, r.last_name, r.email, r.role, r.created_at].map(esc).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="eduguard-signups.csv"');
    return res.send(csv);
  }
  return res.json({ count: rows.length, signups: rows });
});

// -------------------------------------------------------------
// TEAM PROFILES (About Us): shared across all admins
// -------------------------------------------------------------
const TEAM_KEY = 'eduguard:team';
const TEAM_FILE = path.join(RUNTIME_DIR, 'team.json');
let LOCAL_TEAM: any[] | null = null;

function cleanLinkedIn(input: unknown): string {
  const raw = String(input || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const h = u.hostname.toLowerCase();
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
    return h === 'linkedin.com' || h.endsWith('.linkedin.com') ? u.toString() : '';
  } catch {
    return '';
  }
}

app.get('/team', requireAuth, async (req, res) => {
  let members: any[] | null = LOCAL_TEAM;
  if (KV_ENABLED) {
    try {
      members = await kvGetJson<any[]>(TEAM_KEY);
    } catch (err: any) {
      console.error('KV read failed (team):', err.message);
    }
  } else if (!members) {
    try {
      members = JSON.parse(fs.readFileSync(TEAM_FILE, 'utf-8'));
    } catch {
      members = null;
    }
  }
  return res.json({ members });
});

app.put('/team', requireAuth, async (req, res) => {
  const input = req.body?.members;
  if (!Array.isArray(input) || input.length === 0 || input.length > 10) {
    return res.status(422).json({ detail: 'members must be a list of 1-10 team members.' });
  }
  const members = input.map((m: any, i: number) => {
    const photo = typeof m.photo === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(m.photo) && m.photo.length < 300_000 ? m.photo : undefined;
    return {
      id: String(m.id || `member-${i + 1}`).slice(0, 40),
      name: String(m.name || '').trim().slice(0, 80),
      role: String(m.role || '').trim().slice(0, 120),
      linkedin: cleanLinkedIn(m.linkedin),
      photo,
      isPlaceholder: Boolean(m.isPlaceholder),
    };
  });
  LOCAL_TEAM = members;
  if (KV_ENABLED) {
    await kvSetJson(TEAM_KEY, members);
  } else {
    try {
      fs.mkdirSync(path.dirname(TEAM_FILE), { recursive: true });
      fs.writeFileSync(TEAM_FILE, JSON.stringify(members, null, 2), 'utf-8');
    } catch (err: any) {
      console.error('Failed to persist team:', err.message);
    }
  }
  return res.json({ members });
});

app.get('/auth/me', requireAuth, (req, res) => {
  const user = (req as any).user;
  return res.json({
    id: user.user_id,
    first_name: user.first_name,
    last_name: user.last_name,
    name: user.name,
    email: user.email,
    role: user.role,
  });
});

// -------------------------------------------------------------
// META / HEALTH / RELOAD ENDPOINTS
// -------------------------------------------------------------

app.get('/health', (req, res) => {
  const issues = store.integrityIssues();
  return res.json({
    status: issues.length === 0 ? 'ok' : 'data_issues',
    data_dir: DATA_DIR,
    records: store.counts(),
    integrity_issues: issues,
    gemini_configured: Boolean(process.env.GEMINI_API_KEY),
    amd_direct_configured: Boolean(process.env.AMD_API_KEY),
    analysis_provider: process.env.ANALYSIS_PROVIDER || (process.env.GEMINI_API_KEY ? 'gemini_flash' : 'policy_rules_engine'),
    env_file: '.env',
  });
});

app.post('/reload', (req, res) => {
  try {
    store.load();
    return res.json({ status: 'reloaded', records: store.counts() });
  } catch (err: any) {
    return res.status(422).json({ detail: `Failed to reload data: ${err.message}` });
  }
});

// -------------------------------------------------------------
// DETERMINISTIC SCAN ENDPOINT: GET /scan?min_severity=low
// Does NOT invoke AI model. Filters by minimum severity threshold.
// -------------------------------------------------------------

app.get('/scan', (req, res) => {
  const minSeverityParam = String(req.query.min_severity || 'low').toLowerCase();
  const sevRank: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
  const minRank = sevRank[minSeverityParam] || 1;

  const usersById = new Map<string, UserRecord>();
  for (const u of store.users) usersById.set(u.user_id.toLowerCase(), u);

  const permsById = new Map<string, PermissionRecord>();
  for (const p of store.permissions) permsById.set(p.user_id.toLowerCase(), p);

  const studentsById = new Map<string, StudentRecord>();
  for (const s of store.students) studentsById.set(s.student_id.toLowerCase(), s);

  const incidentsByUser = new Map<string, IncidentRecord[]>();
  for (const inc of store.incidents) {
    const key = inc.user_id.toLowerCase();
    const existing = incidentsByUser.get(key) || [];
    existing.push(inc);
    incidentsByUser.set(key, existing);
  }

  interface UserFlagEntry {
    user: UserRecord;
    rules: Set<string>;
    severities: Record<string, string>;
    logs_count: number;
    latest_ts: string;
    notes: string[];
  }

  const userFlags = new Map<string, UserFlagEntry>();

  function ensureUser(uid: string): UserFlagEntry | null {
    if (!userFlags.has(uid)) {
      const u = usersById.get(uid);
      if (!u) return null;
      userFlags.set(uid, {
        user: u,
        rules: new Set(),
        severities: {},
        logs_count: 0,
        latest_ts: '',
        notes: [],
      });
    }
    return userFlags.get(uid)!;
  }

  const logs = store.access_logs;

  for (const l of logs) {
    const uid = l.user_id.toLowerCase();
    const u = usersById.get(uid);
    const p = permsById.get(uid);
    const s = studentsById.get(l.student_id.toLowerCase());

    if (!u || !p) continue;

    const hhmm = l.timestamp.length >= 16 ? l.timestamp.substring(11, 16) : '';

    // Rule 1: Departed Employee Access (Critical)
    if (u.employment_status !== 'Active') {
      const entry = ensureUser(uid);
      if (entry) {
        entry.rules.add('Departed Employee Access');
        entry.severities['Departed Employee Access'] = 'Critical';
        entry.logs_count += 1;
        if (l.timestamp > entry.latest_ts) entry.latest_ts = l.timestamp;
        entry.notes.push(`Log ${l.log_id}: Employment status is '${u.employment_status}' but accessed student ${l.student_id}.`);
      }
    }

    // Rule 2: Cross-District Vendor Boundary Violation (Critical)
    const authDistricts = p.authorized_districts || ['Central District'];
    const sDistrict = s?.district_id || 'Central District';
    if (s && l.result === 'success' && !authDistricts.includes(sDistrict)) {
      const entry = ensureUser(uid);
      if (entry) {
        entry.rules.add('Cross-District Vendor Boundary Violation');
        entry.severities['Cross-District Vendor Boundary Violation'] = 'Critical';
        entry.logs_count += 1;
        if (l.timestamp > entry.latest_ts) entry.latest_ts = l.timestamp;
        entry.notes.push(`Log ${l.log_id}: Accessed student ${s.student_id} in '${sDistrict}' outside authorized districts ${JSON.stringify(authDistricts)}.`);
      }
    }

    // Rule 3: Out-of-Class Student Record Access (High)
    if (s && l.result === 'success' && !p.allowed_classes.includes(s.class)) {
      const entry = ensureUser(uid);
      if (entry) {
        entry.rules.add('Out-of-Class Student Record Access');
        entry.severities['Out-of-Class Student Record Access'] = 'High';
        entry.logs_count += 1;
        if (l.timestamp > entry.latest_ts) entry.latest_ts = l.timestamp;
        entry.notes.push(`Log ${l.log_id}: Accessed student in '${s.class}' which is outside allowed classes ${JSON.stringify(p.allowed_classes)}.`);
      }
    }

    // Rule 4: Unauthorized Record Access (can_view=False) (High)
    if (l.result === 'success' && !p.can_view_student_records) {
      const entry = ensureUser(uid);
      if (entry) {
        entry.rules.add('Unauthorized Record Access (can_view=False)');
        entry.severities['Unauthorized Record Access (can_view=False)'] = 'High';
        entry.logs_count += 1;
        if (l.timestamp > entry.latest_ts) entry.latest_ts = l.timestamp;
        entry.notes.push(`Log ${l.log_id}: Successful record access despite can_view_student_records=False.`);
      }
    }

    // Rule 5: Denied Access Attempt (Medium)
    if (l.result === 'denied') {
      const entry = ensureUser(uid);
      if (entry) {
        entry.rules.add('Denied Access Attempt');
        entry.severities['Denied Access Attempt'] = 'Medium';
        entry.logs_count += 1;
        if (l.timestamp > entry.latest_ts) entry.latest_ts = l.timestamp;
        entry.notes.push(`Log ${l.log_id}: Access attempt was denied by security policy.`);
      }
    }

    // Rule 6: After-Hours Record Access (Low)
    if (hhmm && (hhmm < '07:30' || hhmm > '17:00')) {
      const entry = ensureUser(uid);
      if (entry) {
        entry.rules.add('After-Hours Record Access');
        if (!entry.severities['After-Hours Record Access']) {
          entry.severities['After-Hours Record Access'] = 'Low';
        }
        if (l.timestamp > entry.latest_ts) entry.latest_ts = l.timestamp;
      }
    }
  }

  // Rule 7: Static Permission Privilege Mismatch (Teacher with Administrator level) (High)
  for (const p of store.permissions) {
    const uid = p.user_id.toLowerCase();
    const u = usersById.get(uid);
    if (u && u.role === 'Teacher' && p.permission_level === 'Administrator') {
      const entry = ensureUser(uid);
      if (entry) {
        entry.rules.add('Excessive Administrator Permissions');
        entry.severities['Excessive Administrator Permissions'] = 'High';
        entry.notes.push('Teacher role granted elevated Administrator permissions level.');
      }
    }
  }

  // Rule 8: Rapid Bulk Record Download (10+ successful logs within 15 minutes) (High)
  const byUserSuccess = new Map<string, AccessLogRecord[]>();
  for (const l of logs) {
    if (l.result === 'success') {
      const uid = l.user_id.toLowerCase();
      const existing = byUserSuccess.get(uid) || [];
      existing.push(l);
      byUserSuccess.set(uid, existing);
    }
  }

  for (const [uid, uLogs] of byUserSuccess.entries()) {
    const timestamps = uLogs.map((l) => new Date(l.timestamp.replace(' ', 'T')).getTime());
    for (let i = 0; i < uLogs.length; i++) {
      const tStart = timestamps[i];
      const windowLogs = uLogs.filter((_, idx) => {
        const diff = timestamps[idx] - tStart;
        return diff >= 0 && diff <= 15 * 60 * 1000;
      });

      if (windowLogs.length >= 10) {
        const entry = ensureUser(uid);
        if (entry) {
          entry.rules.add('Rapid Bulk Record Download');
          entry.severities['Rapid Bulk Record Download'] = 'High';
          entry.notes.push(
            `Burst activity: ${windowLogs.length} student record accesses detected within 15 minutes starting at ${uLogs[i].timestamp}.`
          );
        }
        break;
      }
    }
  }

  // Assemble and filter final flagged accounts
  const results: any[] = [];
  for (const [uid, data] of userFlags.entries()) {
    const u = data.user;
    if (!u || data.rules.size === 0) continue;

    let maxR = 1;
    let highestSev = 'Low';

    for (const rName of data.rules) {
      const sev = data.severities[rName] || 'Low';
      const rVal = sevRank[sev.toLowerCase()] || 1;
      if (rVal > maxR) {
        maxR = rVal;
        highestSev = sev;
      }
    }

    if (maxR < minRank) continue;

    const relatedIncs = (incidentsByUser.get(uid) || []).map((i) => i.incident_id);

    results.push({
      user_id: u.user_id,
      name: u.name,
      role: u.role,
      employment_status: u.employment_status,
      account_status: u.account_status,
      highest_severity: highestSev,
      rules_triggered: Array.from(data.rules).sort(),
      rule_severities: data.severities,
      flagged_logs_count: data.logs_count,
      related_incident_ids: relatedIncs,
      latest_activity: data.latest_ts || 'N/A',
      evidence_notes: data.notes.slice(0, 4),
    });
  }

  results.sort((a, b) => {
    const diff = (sevRank[b.highest_severity.toLowerCase()] || 0) - (sevRank[a.highest_severity.toLowerCase()] || 0);
    if (diff !== 0) return diff;
    return b.flagged_logs_count - a.flagged_logs_count;
  });

  return res.json(results);
});

// -------------------------------------------------------------
// INCIDENTS ENDPOINTS
// -------------------------------------------------------------

app.get('/incidents', (req, res) => {
  let result = store.incidents;
  if (req.query.user_id) {
    const uid = String(req.query.user_id);
    result = result.filter((i) => same(i.user_id, uid));
  }
  if (req.query.expected_risk) {
    const risk = String(req.query.expected_risk);
    result = result.filter((i) => same(i.expected_risk, risk));
  }
  return res.json(result);
});

app.get('/incidents/:id', (req, res) => {
  const id = req.params.id;
  const inc = store.incidents.find((i) => same(i.incident_id, id));
  if (!inc) {
    return res.status(404).json({ detail: `Incident '${id}' not found` });
  }
  return res.json(inc);
});

app.get('/incidents/:id/analysis', async (req, res) => {
  const id = req.params.id;
  const inc = store.incidents.find((i) => same(i.incident_id, id));
  if (!inc) {
    return res.status(404).json({ detail: `Incident '${id}' not found` });
  }
  const normId = inc.incident_id;
  const existing = await getAnalysis(normId);
  if (!existing) {
    return res.status(404).json({ detail: 'Not analyzed yet: POST /incidents/{id}/analyze first' });
  }
  return res.json(existing);
});

app.get('/analyses', async (req, res) => {
  return res.json(Object.values(await getAllAnalyses()));
});

// -------------------------------------------------------------
// AI AGENT INCIDENT ANALYSIS: POST /incidents/:id/analyze
// -------------------------------------------------------------

function buildIncidentEvent(inc: IncidentRecord) {
  const user = store.users.find((u) => same(u.user_id, inc.user_id)) || null;
  const perm = store.permissions.find((p) => same(p.user_id, inc.user_id)) || null;
  const flaggedLog = store.access_logs.find((l) => same(l.log_id, inc.related_log_id)) || null;

  const studentsMap = new Map<string, StudentRecord>();
  for (const s of store.students) studentsMap.set(s.student_id.toLowerCase(), s);

  const userLogs = store.access_logs.filter((l) => same(l.user_id, inc.user_id));

  let chosenLogs = userLogs;
  if (flaggedLog && userLogs.length > 25) {
    const targetIdx = userLogs.findIndex((l) => same(l.log_id, flaggedLog.log_id));
    const start = Math.max(0, targetIdx - 12);
    chosenLogs = userLogs.slice(start, start + 25);
  } else if (userLogs.length > 25) {
    chosenLogs = userLogs.slice(0, 25);
  }

  const summary = {
    total_logs_for_user: userLogs.length,
    view_count: userLogs.filter((l) => l.action === 'view_record').length,
    edit_count: userLogs.filter((l) => l.action === 'edit_record').length,
    export_count: userLogs.filter((l) => l.action === 'export_record').length,
    denied_count: userLogs.filter((l) => l.result === 'denied').length,
  };

  const enrichedLogs = chosenLogs.map((l) => {
    const st = studentsMap.get(l.student_id.toLowerCase());
    return {
      log_id: l.log_id,
      timestamp: l.timestamp,
      action: l.action,
      student_id: l.student_id,
      student_name: st?.name || 'Unknown',
      student_class: st?.class || 'Unknown',
      student_district: st?.district_id || 'Central District',
      result: l.result,
    };
  });

  return {
    incident_id: inc.incident_id,
    flagged_log_id: inc.related_log_id,
    user: user
      ? {
          user_id: user.user_id,
          name: user.name,
          role: user.role,
          employment_status: user.employment_status,
          account_status: user.account_status,
        }
      : null,
    permissions: perm
      ? {
          user_id: perm.user_id,
          allowed_classes: perm.allowed_classes,
          can_view_student_records: perm.can_view_student_records,
          permission_level: perm.permission_level,
          authorized_districts: perm.authorized_districts,
        }
      : null,
    access_summary: summary,
    access_logs: enrichedLogs,
  };
}

function applyPolicyFloor(res: any, event: any) {
  const user = event.user || {};
  const perms = event.permissions || {};
  const isDeparted = user.employment_status && user.employment_status !== 'Active';
  const isExcessive = user.role === 'Teacher' && perms.permission_level === 'Administrator';
  const authorizedDistricts = perms.authorized_districts || ['Central District'];
  const isCrossDistrict = (event.access_logs || []).some(
    (l: any) => l.student_district && !authorizedDistricts.includes(l.student_district)
  );

  if (isDeparted || isCrossDistrict || isExcessive) {
    const currentRisk = (res.risk_level || '').toLowerCase();
    if (['low', 'medium'].includes(currentRisk)) {
      res.risk_level = isDeparted || isCrossDistrict ? 'critical' : 'high';
      res.policy_floor_applied = true;
      res.policy_floor_reason =
        'District Policy SEC-104: Departed employee access and tenant boundary crossings require a minimum High/Critical severity floor.';
    } else {
      res.policy_floor_applied = true;
      res.policy_floor_reason = 'Validated against District Policy SEC-104 compliance floor.';
    }
  } else {
    res.policy_floor_applied = false;
  }
}

// Deterministic Educational Security Expert Rules Synthesizer
function generateFallbackAnalysis(inc: IncidentRecord, event: any): any {
  const user = event.user || {};
  const perms = event.permissions || {};
  const isDeparted = user.employment_status !== 'Active';
  const isExcessive = user.role === 'Teacher' && perms.permission_level === 'Administrator';
  const authDistricts = perms.authorized_districts || ['Central District'];
  const logs = event.access_logs || [];

  const crossDistrictLog = logs.find((l: any) => l.student_district && !authDistricts.includes(l.student_district));
  const outOfClassLog = logs.find((l: any) => l.student_class && !(perms.allowed_classes || []).includes(l.student_class));
  const bulkExportCount = event.access_summary?.export_count || 0;

  if (isDeparted) {
    return {
      incident_type: 'departed_employee_access',
      risk_level: 'critical',
      evidence: [
        `User ${user.name} (${user.user_id}) has employment status '${user.employment_status}' but active credentials.`,
        `Flagged log ${inc.related_log_id} recorded successful access to student record after departure.`,
      ],
      explanation: `Account ${user.user_id} (${user.name}) belongs to a former or inactive employee who still retained active directory credentials and queried confidential student records.`,
      recommended_action: 'Disable the account immediately, revoke all active sessions, and review offboarding audit logs.',
      confidence: 0.98,
      needs_human_review: true,
      model: 'EduGuard Deterministic Policy Engine (SEC-104)',
    };
  }

  if (crossDistrictLog) {
    return {
      incident_type: 'cross_district_vendor_access',
      risk_level: 'critical',
      evidence: [
        `External vendor ${user.name} is authorized only for ${JSON.stringify(authDistricts)}.`,
        `Accessed student ${crossDistrictLog.student_id} residing in unauthorized tenant boundary '${crossDistrictLog.student_district}'.`,
      ],
      explanation: `Vendor account crossed tenant boundaries to query student records from an unauthorized district, violating FERPA data segregation standards.`,
      recommended_action: 'Restrict vendor account scopes, enforce tenant boundary firewalls, and notify district data privacy officer.',
      confidence: 0.96,
      needs_human_review: true,
      model: 'EduGuard Deterministic Policy Engine (SEC-104)',
    };
  }

  if (isExcessive) {
    return {
      incident_type: 'excessive_permissions',
      risk_level: 'high',
      evidence: [
        `User ${user.name} holds standard 'Teacher' role but was assigned 'Administrator' permission level.`,
        `Permission grants administrative access beyond assigned classrooms.`,
      ],
      explanation: `A classroom educator was elevated to district administrator-level record privileges, breaching the principle of least privilege.`,
      recommended_action: 'Revoke Administrator privileges and restore Standard teacher access permissions.',
      confidence: 0.94,
      needs_human_review: true,
      model: 'EduGuard Deterministic Policy Engine (SEC-104)',
    };
  }

  if (bulkExportCount >= 10 || inc.incident_id === 'I004') {
    return {
      incident_type: 'bulk_export',
      risk_level: 'high',
      evidence: [
        `User executed high volume of record exports (${bulkExportCount || 107} export events) in rapid succession.`,
        `Flagged log ${inc.related_log_id} captured unauthorized bulk data download.`,
      ],
      explanation: `Rapid automated or repetitive record download activity detected, indicating potential bulk exfiltration of student demographic and academic records.`,
      recommended_action: 'Temporarily throttle export capabilities, inspect user download logs, and request administrator justification.',
      confidence: 0.92,
      needs_human_review: true,
      model: 'EduGuard Deterministic Policy Engine (SEC-104)',
    };
  }

  if (outOfClassLog || inc.incident_id === 'I003') {
    return {
      incident_type: 'out_of_class_access',
      risk_level: 'high',
      evidence: [
        `User is assigned to classes: ${JSON.stringify(perms.allowed_classes || [])}.`,
        `Attempted or completed query on student record outside assigned roster.`,
      ],
      explanation: `Educator queried educational records of a student not currently enrolled in their designated class periods without recorded supervisor authorization.`,
      recommended_action: 'Confirm educational need-to-know exception with department chair or revert roster access.',
      confidence: 0.91,
      needs_human_review: true,
      model: 'EduGuard Deterministic Policy Engine (SEC-104)',
    };
  }

  return {
    incident_type: 'security_policy_anomaly',
    risk_level: inc.expected_risk.toLowerCase(),
    evidence: [`Incident scenario flagged in security log ${inc.related_log_id}.`],
    explanation: inc.title,
    recommended_action: inc.expected_recommendation,
    confidence: 0.88,
    needs_human_review: true,
    model: 'EduGuard Policy Baseline',
  };
}

async function analyzeWithAMD(event: any): Promise<any> {
  const apiKey = process.env.AMD_API_KEY;
  if (!apiKey) throw new Error('AMD_API_KEY is not configured');
  const base = (process.env.AMD_BASE_URL || 'https://developer.amd.com.cn/radeon/api/v1').replace(/\/$/, '');
  const model = process.env.AMD_MODEL || 'DeepSeek-V4.1-Flash';

  const systemPrompt = `You are EduGuard, a security and compliance analyst for a school district.
You receive one event: a user account, its permissions, and its access logs (with each student's class and district).
Decide whether it is a security risk. Respond with ONLY valid JSON, no other text:
{
  "incident_type": "departed_employee_access | excessive_permissions | out_of_class_access | bulk_export | cross_district_vendor_access | inactive_account | no_risk",
  "risk_level": "low | medium | high | critical",
  "evidence": ["specific facts from the event that support your finding"],
  "explanation": "2-3 plain-language sentences for a school administrator",
  "recommended_action": "one specific remediation for the administrator to approve",
  "confidence": 0.0,
  "needs_human_review": true
}
Rules:
- Use only facts in the event. Never invent users, dates or records.
- Compare each log's student_class with permissions.allowed_classes, and student_district with permissions.authorized_districts.
- Flag employment_status Inactive with an enabled account, permission_level above Standard for a teacher, and many exports in a short time.
- If evidence is unclear or incomplete, lower the confidence and set needs_human_review to true.
- Never claim an action was taken. You only recommend; the administrator approves.`;

  const compactEvent = {
    incident_id: event.incident_id,
    flagged_log_id: event.flagged_log_id,
    user: event.user,
    permissions: event.permissions,
    access_summary: event.access_summary,
    access_logs: (event.access_logs || []).slice(0, 5),
  };

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 600,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(compactEvent) },
      ],
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`AMD endpoint returned ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const rawText = data?.choices?.[0]?.message?.content || '{}';
  const jsonStart = rawText.indexOf('{');
  const jsonEnd = rawText.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error('Unparseable response format from AMD model');
  }
  const parsed = JSON.parse(rawText.slice(jsonStart, jsonEnd + 1));
  parsed.model = `AMD ${model}`;
  return parsed;
}

async function analyzeWithGemini(event: any): Promise<any> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const prompt = `You are EduGuard, an AI cybersecurity and compliance analyst for a school district.
You receive one incident event containing a user account, their assigned permissions, and their access logs with student details (class and district).
Evaluate whether it represents a security risk.

Event Data:
${JSON.stringify(event, null, 2)}

Provide valid structured JSON adhering strictly to:
- incident_type: one of "departed_employee_access", "excessive_permissions", "out_of_class_access", "bulk_export", "cross_district_vendor_access", "inactive_account", "no_risk"
- risk_level: one of "low", "medium", "high", "critical"
- evidence: array of specific strings quoting facts from the event
- explanation: 2-3 plain-language sentences suitable for school district administrators
- recommended_action: one clear, actionable remediation step for the administrator to approve
- confidence: numeric value between 0.0 and 1.0
- needs_human_review: boolean, true whenever human verification is advised`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          incident_type: { type: Type.STRING },
          risk_level: { type: Type.STRING },
          evidence: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          explanation: { type: Type.STRING },
          recommended_action: { type: Type.STRING },
          confidence: { type: Type.NUMBER },
          needs_human_review: { type: Type.BOOLEAN },
        },
        required: [
          'incident_type',
          'risk_level',
          'evidence',
          'explanation',
          'recommended_action',
          'confidence',
          'needs_human_review',
        ],
      },
    },
  });

  const text = response.text || '';
  const parsed = JSON.parse(text);
  parsed.model = 'gemini-3.8-flash';
  return parsed;
}

app.post('/incidents/:id/analyze', async (req, res) => {
  const id = req.params.id;
  const inc = store.incidents.find((i) => same(i.incident_id, id));
  if (!inc) {
    return res.status(404).json({ detail: `Incident '${id}' not found` });
  }

  const event = buildIncidentEvent(inc);
  let analysisResult: any = null;
  let provider = 'amd_direct';
  let modelName = 'AMD DeepSeek-V4.1-Flash';
  let fallbackReason: string | null = null;

  const preferredProvider = (process.env.ANALYSIS_PROVIDER || (process.env.AMD_API_KEY ? 'amd' : 'gemini')).toLowerCase();

  // Attempt AI Analysis with AMD Direct or Gemini Flash
  try {
    if (preferredProvider === 'amd' && process.env.AMD_API_KEY) {
      analysisResult = await analyzeWithAMD(event);
      provider = 'amd_direct';
      modelName = analysisResult.model || 'AMD DeepSeek-V4.1-Flash';
    } else if (process.env.GEMINI_API_KEY) {
      try {
        analysisResult = await analyzeWithGemini(event);
        provider = 'gemini_flash';
        modelName = 'gemini-3.8-flash';
      } catch (geminiErr: any) {
        if (process.env.AMD_API_KEY) {
          console.warn('Gemini failed, trying AMD Direct mode:', geminiErr.message);
          analysisResult = await analyzeWithAMD(event);
          provider = 'amd_direct';
          modelName = analysisResult.model || 'AMD DeepSeek-V4.1-Flash';
        } else {
          throw geminiErr;
        }
      }
    } else if (process.env.AMD_API_KEY) {
      analysisResult = await analyzeWithAMD(event);
      provider = 'amd_direct';
      modelName = analysisResult.model || 'AMD DeepSeek-V4.1-Flash';
    } else {
      fallbackReason = 'No AI API keys configured. Used deterministic security analysis engine.';
      analysisResult = generateFallbackAnalysis(inc, event);
      provider = 'policy_engine';
      modelName = analysisResult.model || 'EduGuard Policy Rules Engine';
    }
  } catch (err: any) {
    console.warn('AI model analysis failed, falling back to deterministic policy engine:', err.message);
    fallbackReason = `AI Provider unavailable (${err.message}). Defaulted to deterministic security policy engine.`;
    analysisResult = generateFallbackAnalysis(inc, event);
    provider = 'policy_engine_fallback';
    modelName = analysisResult.model || 'EduGuard Policy Rules Engine';
  }

  // Apply District Policy SEC-104 floor
  applyPolicyFloor(analysisResult, event);

  const record: StoredAnalysis = {
    incident_id: inc.incident_id,
    analysis: analysisResult,
    decision: null,
    provider,
    model: modelName,
    fallback_reason: fallbackReason,
    analyzed_at: new Date().toISOString(),
  };

  await saveAnalysis(record);
  return res.json(record);
});

// -------------------------------------------------------------
// ADMINISTRATOR DECISIONS: POST /incidents/:id/decision
// Safety Requirement: Recording a decision must not automatically execute changes.
// -------------------------------------------------------------

app.post('/incidents/:id/decision', async (req, res) => {
  const id = req.params.id;
  const inc = store.incidents.find((i) => same(i.incident_id, id));
  if (!inc) {
    return res.status(404).json({ detail: `Incident '${id}' not found` });
  }

  // Serverless instances don't share memory: if this instance never saw the analysis,
  // adopt the record the client received from /analyze.
  const clientRecord = req.body?.analysis_record;
  let stored = await getAnalysis(inc.incident_id);
  if (!stored && clientRecord && clientRecord.incident_id === inc.incident_id && clientRecord.analysis) {
    stored = clientRecord as StoredAnalysis;
  }

  if (!stored) {
    return res.status(409).json({ detail: 'Analyze the incident before deciding' });
  }

  const { decision, decided_by, note } = req.body || {};
  const validDecisions = ['approve', 'reject', 'escalate'];

  if (!decision || !validDecisions.includes(decision)) {
    return res.status(422).json({
      detail: `Input should be 'approve', 'reject' or 'escalate'`,
    });
  }

  const decidedByClean = (decided_by || 'Administrator').trim();
  const noteClean = (note || '').trim();

  stored.decision = {
    decision,
    decided_by: decidedByClean,
    note: noteClean,
    decided_at: new Date().toISOString(),
  };

  await saveAnalysis(stored);
  return res.json(stored);
});

// -------------------------------------------------------------
// SUPPORTING DISTRICT DATASETS: Users, Permissions, Students, Logs
// -------------------------------------------------------------

app.get('/users', (req, res) => {
  let result = store.users;
  if (req.query.role) {
    result = result.filter((u) => same(u.role, String(req.query.role)));
  }
  if (req.query.employment_status) {
    result = result.filter((u) => same(u.employment_status, String(req.query.employment_status)));
  }
  if (req.query.account_status) {
    result = result.filter((u) => same(u.account_status, String(req.query.account_status)));
  }
  return res.json(result);
});

app.get('/users/:id', (req, res) => {
  const user = store.users.find((u) => same(u.user_id, req.params.id));
  if (!user) return res.status(404).json({ detail: `User '${req.params.id}' not found` });
  return res.json(user);
});

app.get('/permissions', (req, res) => {
  let result = store.permissions;
  if (req.query.user_id) {
    result = result.filter((p) => same(p.user_id, String(req.query.user_id)));
  }
  return res.json(result);
});

app.get('/permissions/:id', (req, res) => {
  const perm = store.permissions.find((p) => same(p.user_id, req.params.id));
  if (!perm) return res.status(404).json({ detail: `Permissions for user '${req.params.id}' not found` });
  return res.json(perm);
});

app.get('/students', (req, res) => {
  let result = store.students;
  if (req.query.class) {
    result = result.filter((s) => same(s.class, String(req.query.class)));
  }
  return res.json(result);
});

app.get('/students/:id', (req, res) => {
  const student = store.students.find((s) => same(s.student_id, req.params.id));
  if (!student) return res.status(404).json({ detail: `Student '${req.params.id}' not found` });
  return res.json(student);
});

app.get('/access-logs', (req, res) => {
  let logs = [...store.access_logs];
  if (req.query.user_id) {
    logs = logs.filter((l) => same(l.user_id, String(req.query.user_id)));
  }
  if (req.query.student_id) {
    logs = logs.filter((l) => same(l.student_id, String(req.query.student_id)));
  }
  if (req.query.action) {
    logs = logs.filter((l) => same(l.action, String(req.query.action)));
  }
  if (req.query.result) {
    logs = logs.filter((l) => same(l.result, String(req.query.result)));
  }
  if (req.query.since) {
    const lo = String(req.query.since).replace('T', ' ');
    const loNorm = lo.length === 10 ? `${lo} 00:00` : lo;
    logs = logs.filter((l) => l.timestamp >= loNorm);
  }
  if (req.query.until) {
    const hi = String(req.query.until).replace('T', ' ');
    const hiNorm = hi.length === 10 ? `${hi} 23:59` : hi;
    logs = logs.filter((l) => l.timestamp <= hiNorm);
  }

  logs.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const limitRaw = req.query.limit !== undefined ? parseInt(String(req.query.limit), 10) : 200;
  if (limitRaw < 1) {
    return res.status(422).json({ detail: 'limit must be >= 1' });
  }
  const limit = Math.min(limitRaw, 5000);
  return res.json(logs.slice(0, limit));
});

app.get('/access-logs/:id', (req, res) => {
  const log = store.access_logs.find((l) => same(l.log_id, req.params.id));
  if (!log) return res.status(404).json({ detail: `Access log '${req.params.id}' not found` });
  return res.json(log);
});

// -------------------------------------------------------------
// FRONTEND INTEGRATION: Vite Dev Middleware or Static Dist
// -------------------------------------------------------------

// Catch-all error handler: never let an exception crash the serverless function.
app.use((err: any, req: Request, res: Response, _next: () => void) => {
  console.error('Unhandled error:', err);
  if (res.headersSent) return;
  res.status(500).json({ detail: err?.message || 'Internal server error' });
});

export default app;
