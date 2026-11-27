/**
 * LEGACY AUTH MODULE — not wired into the active Express routes.
 * The active runtime authentication lives in server.ts and server/supportDb.ts.
 * This Supabase-backed module is retained temporarily for migration compatibility;
 * do not import it into production routes without reviewing its credential model.
 *
 * WONDERMC — Centralized Authentication & Authorization Middleware
 * ==================================================================
 *
 * Replaces the insecure auth model:
 *   - No hardcoded owner/staff passwords in code or frontend bundles.
 *   - Owner credentials verified exclusively against ADMIN_SECURITY_KEY (env).
 *   - Sub-admin / staff credentials verified exclusively against Supabase
 *     password hashes (scrypt). Frontend-supplied permission lists are never
 *     trusted.
 *   - Signed, expiring session tokens issued by the backend only. Tokens
 *     (never raw passwords) are stored in browser sessionStorage.
 *   - Every protected endpoint validates the token signature + expiration
 *     and enforces server-side permissions.
 *
 * Environment variables required (backend only, never VITE_):
 *   ADMIN_SECURITY_KEY   — owner verification secret
 *   SUPPORT_SESSION_SECRET — session signing secret (strong, stable)
 *   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — trusted Supabase access
 */

import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { getSupabaseAdmin } from "../supabaseAdmin";

/* ------------------------------------------------------------------ */
/*  Secrets (from environment only — never ephemeral files)           */
/* ------------------------------------------------------------------ */

const ADMIN_SECURITY_KEY = (process.env.ADMIN_SECURITY_KEY || "").trim();
const SESSION_SECRET = (process.env.SUPPORT_SESSION_SECRET || "").trim();

if (!ADMIN_SECURITY_KEY) {
  // Fail fast in production rather than silently using a weak fallback.
  console.warn("[AUTH] WARNING: ADMIN_SECURITY_KEY is not set — owner login will fail.");
}
if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
  console.warn("[AUTH] WARNING: SUPPORT_SESSION_SECRET is weak or missing — session tokens are insecure.");
}

/* ------------------------------------------------------------------ */
/*  Token format: base64url(json).base64url(hmac-sha256)             */
/* ------------------------------------------------------------------ */

export interface SessionTokenPayload {
  kind: "user" | "staff";
  uid: string;
  email?: string;
  name: string;
  isAdmin: boolean;
  isOwner: boolean;
  staffId?: string;
  roleTitle?: string;
  subPermissions?: string[];
  exp: number;
}

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

export function signSessionToken(
  payload: Omit<SessionTokenPayload, "exp">,
  ttlMs = TOKEN_TTL_MS
): string {
  if (!SESSION_SECRET) {
    throw new Error("SUPPORT_SESSION_SECRET is not configured");
  }
  const full: SessionTokenPayload = { ...payload, exp: Date.now() + ttlMs };
  const body = Buffer.from(JSON.stringify(full)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
}

export function verifySessionToken(token?: string): SessionTokenPayload | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(body)
    .digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null; // malformed / tampered token
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(body, "base64url").toString("utf-8")
    ) as SessionTokenPayload;
    if (!parsed.exp || parsed.exp < Date.now()) return null; // expired
    if (!parsed.uid || !parsed.name) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function extractToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  const qToken = req.query.token;
  if (typeof qToken === "string" && qToken.trim()) {
    return qToken.trim();
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/*  Permission model                                                  */
/* ------------------------------------------------------------------ */

export type AdminTabPermission =
  | "dashboard"
  | "users"
  | "staff"
  | "supporters"
  | "products"
  | "categories"
  | "themes"
  | "click_animations"
  | "discounts"
  | "tickets"
  | "updates"
  | "vote"
  | "payment"
  | "wallet"
  | "payment_management"
  | "coupon_management"
  | "passwords"
  | "settings"
  | "activity_log"
  | "guide"
  | "rules"
  | "orders"
  | "donations";

export const ALL_ADMIN_PERMISSIONS: AdminTabPermission[] = [
  "dashboard", "users", "staff", "supporters", "products", "categories",
  "themes", "click_animations", "discounts", "tickets", "updates", "vote",
  "payment", "wallet", "payment_management", "coupon_management",
  "passwords", "settings", "activity_log", "guide", "rules", "orders",
  "donations",
];

/* Permission groups used by the legacy sub-admin / staff UI for convenience. */
const PERMISSION_ALIASES: Record<string, AdminTabPermission[]> = {
  // coupon_management implies wallet (legacy behaviour preserved)
  coupon_management: ["coupon_management", "wallet"],
  // click_animations and themes are adjacent
  click_animations: ["click_animations", "themes"],
  themes: ["themes", "click_animations"],
  // categories implies settings (legacy behaviour preserved)
  categories: ["categories", "settings"],
};

function resolvePermissions(session: SessionTokenPayload): AdminTabPermission[] {
  if (session.isOwner) return [...ALL_ADMIN_PERMISSIONS];
  if (session.isAdmin) return [...ALL_ADMIN_PERMISSIONS];
  const perms = new Set<AdminTabPermission>();
  (session.subPermissions || []).forEach((p) => {
    if (ALL_ADMIN_PERMISSIONS.includes(p as AdminTabPermission)) {
      perms.add(p as AdminTabPermission);
    }
    const aliases = PERMISSION_ALIASES[p];
    if (aliases) aliases.forEach((a) => perms.add(a));
  });
  return [...perms];
}

export function hasPermission(session: SessionTokenPayload | null, permission: AdminTabPermission): boolean {
  if (!session) return false;
  if (session.isOwner || session.isAdmin) return true;
  return resolvePermissions(session).includes(permission);
}

/* ------------------------------------------------------------------ */
/*  Password hashing (Node built-in scrypt — no extra dependency)     */
/* ------------------------------------------------------------------ */

const SCRYPT_KEYLEN = 64;
const SCRYPT_COST = Math.pow(2, 15); // N = 32768

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = (await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_COST }, (err, derived) => {
      if (err) reject(err); else resolve(derived);
    });
  })) as Buffer;
  return `scryptv1$${salt}$${derived.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!stored || !stored.startsWith("scryptv1$")) return false;
  const parts = stored.split("$");
  if (parts.length !== 3) return false;
  const [, saltHex, hashHex] = parts;
  try {
    const derived = (await new Promise<Buffer>((resolve, reject) => {
      crypto.scrypt(password, Buffer.from(saltHex, "hex"), SCRYPT_KEYLEN, { N: SCRYPT_COST }, (err, derived) => {
        if (err) reject(err); else resolve(derived);
      });
    })) as Buffer;
    const a = Buffer.from(derived.toString("hex"));
    const b = Buffer.from(hashHex);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  Supabase-backed credential lookup                                 */
/* ------------------------------------------------------------------ */

interface SubAdminRecord {
  id: string;
  name: string;
  password_hash: string | null;
  active: boolean;
  permissions: string[];
}

interface StaffRecord {
  id: string;
  name: string;
  role_title: string;
  passkey_hash: string | null;
  email: string | null;
  active: boolean;
  can_view_all_tickets: boolean;
  can_reply: boolean;
  can_assign: boolean;
  can_change_status: boolean;
  can_add_internal_notes: boolean;
  can_delete_tickets: boolean;
  updated_at: string;
}

async function findSubAdminById(id: string): Promise<SubAdminRecord | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data, error } = await admin
    .from("subadmin_keys")
    .select("id, name, password_hash, active, permissions")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    name: data.name,
    password_hash: data.password_hash,
    active: data.active ?? false,
    permissions: Array.isArray(data.permissions) ? data.permissions : [],
  };
}

async function findStaffByPasskeyHash(passkey: string): Promise<StaffRecord | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  // We cannot compare hashes in SQL; load active staff and verify in constant time.
  const { data, error } = await admin
    .from("support_staff_permissions")
    .select("*")
    .eq("active", true);
  if (error || !data) return null;
  for (const row of data as StaffRecord[]) {
    if (row.passkey_hash && (await verifyPassword(passkey, row.passkey_hash))) {
      return row;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Rate limiter for login endpoints (in-memory, per-IP)              */
/* ------------------------------------------------------------------ */

interface RateEntry { count: number; first: number; blockedUntil: number }
const loginAttempts = new Map<string, RateEntry>();
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 60 * 1000; // 1 minute
const LOGIN_BLOCK_MS = 15 * 60 * 1000; // 15 minutes

function checkLoginRate(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry) {
    loginAttempts.set(ip, { count: 1, first: now, blockedUntil: 0 });
    return { allowed: true };
  }
  if (now < entry.blockedUntil) {
    return { allowed: false, retryAfter: Math.ceil((entry.blockedUntil - now) / 1000) };
  }
  if (now - entry.first > LOGIN_WINDOW_MS) {
    entry.count = 1;
    entry.first = now;
    entry.blockedUntil = 0;
    return { allowed: true };
  }
  entry.count += 1;
  if (entry.count > LOGIN_MAX_ATTEMPTS) {
    entry.blockedUntil = now + LOGIN_BLOCK_MS;
    return { allowed: false, retryAfter: Math.ceil(LOGIN_BLOCK_MS / 1000) };
  }
  return { allowed: true };
}

/* ------------------------------------------------------------------ */
/*  Middleware                                                        */
/* ------------------------------------------------------------------ */

export interface AuthenticatedRequest extends Request {
  supportSession?: SessionTokenPayload;
}

/** Require a valid session token (any kind). */
export function requireSupportSession(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const token = extractToken(req);
  const verified = verifySessionToken(token);
  if (!verified) {
    res.status(401).json({ error: "Unauthorized: valid session token required." });
    return;
  }
  req.supportSession = verified;
  next();
}

/** Require a staff/admin session. */
export function requireStaffSession(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const token = extractToken(req);
  const verified = verifySessionToken(token);
  if (!verified || verified.kind !== "staff") {
    res.status(403).json({ error: "Forbidden: staff or admin authentication required." });
    return;
  }
  req.supportSession = verified;
  next();
}

/** Require a specific admin tab permission. Owner/admins pass; sub-admins/staff need the permission. */
export function requirePermission(permission: AdminTabPermission) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const token = extractToken(req);
    const verified = verifySessionToken(token);
    if (!verified || verified.kind !== "staff") {
      res.status(403).json({ error: "Forbidden: administrator authentication required." });
      return;
    }
    if (!hasPermission(verified, permission)) {
      res.status(403).json({
        error: `Forbidden: you do not have permission to access ${permission}.`,
      });
      return;
    }
    req.supportSession = verified;
    next();
  };
}

/** Require owner or full admin. */
export function requireOwnerOrAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const token = extractToken(req);
  const verified = verifySessionToken(token);
  if (!verified || verified.kind !== "staff" || !(verified.isAdmin || verified.isOwner)) {
    res.status(403).json({ error: "Forbidden: owner or admin access required." });
    return;
  }
  req.supportSession = verified;
  next();
}

/* ------------------------------------------------------------------ */
/*  Auth handlers                                                     */
/* ------------------------------------------------------------------ */

export interface OwnerLoginBody { passkey: string }

export async function handleOwnerLogin(
  req: Request<{}, any, OwnerLoginBody>,
  res: Response
): Promise<void> {
  const { passkey } = req.body || {};
  const clean = (passkey || "").trim();
  if (!clean) {
    res.status(400).json({ error: "Owner passkey is required." });
    return;
  }

  // Constant-time comparison against the env secret.
  const keyBuf = Buffer.from(ADMIN_SECURITY_KEY);
  const inputBuf = Buffer.from(clean);
  let match = keyBuf.length === inputBuf.length && keyBuf.length > 0;
  if (match) {
    match = crypto.timingSafeEqual(keyBuf, inputBuf);
  }

  if (!match) {
    res.status(401).json({ error: "Invalid owner credentials." });
    return;
  }

  const token = signSessionToken({
    kind: "staff",
    uid: "owner-admin",
    name: "Main Server Owner",
    isAdmin: true,
    isOwner: true,
    staffId: "owner-admin",
    roleTitle: "Main Owner",
  });

  res.json({
    token,
    isAdmin: true,
    isOwner: true,
    staffId: "owner-admin",
    name: "Main Server Owner",
    roleTitle: "Main Owner",
    permissions: ALL_ADMIN_PERMISSIONS,
  });
}

export interface SubAdminLoginBody { id: string; password: string }

export async function handleSubAdminLogin(
  req: Request<{}, any, SubAdminLoginBody>,
  res: Response
): Promise<void> {
  const { id, password } = req.body || {};
  const cleanId = (id || "").trim();
  const cleanPassword = (password || "").trim();
  if (!cleanId || !cleanPassword) {
    res.status(400).json({ error: "Sub-admin id and password are required." });
    return;
  }

  const record = await findSubAdminById(cleanId);
  if (!record || !record.active) {
    res.status(401).json({ error: "Invalid sub-admin credentials." });
    return;
  }
  if (!record.password_hash) {
    // Credential not yet migrated — reject rather than allow empty password.
    res.status(401).json({ error: "Sub-admin account credentials not configured. Contact the owner." });
    return;
  }

  const passwordOk = await verifyPassword(cleanPassword, record.password_hash);
  if (!passwordOk) {
    res.status(401).json({ error: "Invalid sub-admin credentials." });
    return;
  }

  const token = signSessionToken({
    kind: "staff",
    uid: record.id,
    name: record.name,
    isAdmin: false,
    isOwner: false,
    staffId: record.id,
    roleTitle: "Sub-Admin",
    subPermissions: record.permissions,
  });

  res.json({
    token,
    isAdmin: false,
    isOwner: false,
    staffId: record.id,
    name: record.name,
    roleTitle: "Sub-Admin",
    permissions: record.permissions,
  });
}

export interface StaffLoginBody { passkey: string }

export async function handleStaffLogin(
  req: Request<{}, any, StaffLoginBody>,
  res: Response
): Promise<void> {
  const { passkey } = req.body || {};
  const clean = (passkey || "").trim();
  if (!clean) {
    res.status(401).json({ error: "Invalid staff credentials." });
    return;
  }

  const record = await findStaffByPasskeyHash(clean);
  if (!record) {
    res.status(401).json({ error: "Invalid staff credentials." });
    return;
  }

  const token = signSessionToken({
    kind: "staff",
    uid: record.id,
    name: record.name,
    isAdmin: false,
    isOwner: false,
    staffId: record.id,
    roleTitle: record.role_title || "Staff",
  });

  res.json({
    token,
    isAdmin: false,
    isOwner: false,
    staffId: record.id,
    name: record.name,
    roleTitle: record.role_title || "Staff",
    permissions: null,
  });
}

/* ------------------------------------------------------------------ */
/*  Sub-admin / staff account management (Supabase-backed)            */
/* ------------------------------------------------------------------ */

export interface UpsertSubAdminBody {
  id?: string;
  name: string;
  password?: string;              // plaintext — hashed before storage
  permissions: AdminTabPermission[];
  active?: boolean;
}

export async function upsertSubAdmin(
  session: SessionTokenPayload,
  body: UpsertSubAdminBody
): Promise<{ ok: true; record: SubAdminRecord } | { ok: false; status: number; error: string }> {
  if (!session.isAdmin && !session.isOwner) {
    return { ok: false, status: 403, error: "Only the owner/admin can manage sub-admin accounts." };
  }
  const cleanName = (body.name || "").trim();
  if (!cleanName) {
    return { ok: false, status: 400, error: "Sub-admin name is required." };
  }
  if (!Array.isArray(body.permissions) || body.permissions.length === 0) {
    return { ok: false, status: 400, error: "At least one permission is required." };
  }
  const invalid = body.permissions.filter((p) => !ALL_ADMIN_PERMISSIONS.includes(p as AdminTabPermission));
  if (invalid.length) {
    return { ok: false, status: 400, error: `Invalid permissions: ${invalid.join(", ")}` };
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return { ok: false, status: 500, error: "Supabase is not configured." };
  }

  const now = new Date().toISOString();
  const targetId = body.id || `subadmin_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;

  let passwordHash: string | null = null;
  if (typeof body.password === "string" && body.password.trim()) {
    passwordHash = await hashPassword(body.password.trim());
  }

  const existing = await admin.from("subadmin_keys").select("id").eq("id", targetId).maybeSingle();

  const row: any = {
    id: targetId,
    name: cleanName.slice(0, 80),
    permissions: body.permissions,
    active: typeof body.active === "boolean" ? body.active : true,
    updated_at: now,
  };
  if (passwordHash) row.password_hash = passwordHash;
  if (!existing.data) row.created_at = now;

  const { error } = await admin.from("subadmin_keys").upsert(row, { onConflict: "id" });
  if (error) {
    return { ok: false, status: 400, error: error.message || "Failed to save sub-admin account." };
  }

  return {
    ok: true,
    record: { id: targetId, name: cleanName, password_hash: passwordHash, active: row.active, permissions: body.permissions },
  };
}

export async function listSubAdmins(session: SessionTokenPayload): Promise<SubAdminRecord[]> {
  if (!session.isAdmin && !session.isOwner) return [];
  const admin = getSupabaseAdmin();
  if (!admin) return [];
  const { data } = await admin.from("subadmin_keys").select("id, name, active, permissions, created_at, updated_at");
  return (data || []).map((d: any) => ({
    id: d.id,
    name: d.name,
    password_hash: d.password_hash,
    active: d.active ?? true,
    permissions: Array.isArray(d.permissions) ? d.permissions : [],
  }));
}

export async function deleteSubAdmin(
  session: SessionTokenPayload,
  id: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!session.isAdmin && !session.isOwner) {
    return { ok: false, status: 403, error: "Only the owner/admin can remove sub-admin accounts." };
  }
  const admin = getSupabaseAdmin();
  if (!admin) return { ok: false, status: 500, error: "Supabase is not configured." };
  await admin.from("subadmin_keys").delete().eq("id", id);
  return { ok: true };
}
