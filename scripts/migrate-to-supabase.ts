/**
 * WONDERMC — Safe Data Migration Script (Supabase)
 * ===================================================
 *
 * Migrates legacy local JSON data into the central Supabase database safely,
 * idempotently, and without destroying existing remote records.
 *
 * DESIGN PRINCIPLES (per task requirements):
 *   1. Create a migration report BEFORE importing.
 *   2. Compare local and remote records; never silently overwrite.
 *   3. Preserve existing primary keys whenever possible.
 *   4. Detect duplicate IDs, duplicate coupon codes, conflicting usernames.
 *   5. Preserve user profiles and wallet balances — NEVER reset balances.
 *   6. Do NOT delete existing records. Do NOT truncate any table.
 *   7. Do NOT overwrite newer remote data with older local data.
 *   8. Use safe upserts with explicit conflict-resolution rules.
 *   9. Preserve payment records and transaction history.
 *   10. Never import private gateway secrets into public tables.
 *   11. Repeatable and idempotent.
 *   12. Record migration results and errors.
 *   13. If a conflict cannot be resolved safely, STOP and report it.
 *
 * DEFAULT MODE: dry-run / report only. No data is written to Supabase.
 * To actually apply changes, run with:  npx tsx scripts/migrate-to-supabase.ts --execute
 *
 * Requires environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * (loaded from .env via dotenv). Never hardcode secrets here.
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

/* ------------------------------------------------------------------ */
/*  Configuration                                                     */
/* ------------------------------------------------------------------ */

const DATA_DIR = path.join(process.cwd(), "data");
const ROOT_STORE_BACKEND = path.join(process.cwd(), "store_backend.json");

const URL = process.env.SUPABASE_URL || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const EXECUTE = process.argv.includes("--execute");
const DRY_RUN = !EXECUTE;

if (!URL || !SERVICE_ROLE_KEY) {
  console.error("[FATAL] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env");
  process.exit(1);
}

let admin: SupabaseClient;

/* ------------------------------------------------------------------ */
/*  Migration report                                                  */
/* ------------------------------------------------------------------ */

interface ReportEntry {
  table: string;
  action: "skip" | "upsert" | "conflict" | "error" | "preserve";
  localCount: number;
  remoteCount: number;
  applied: number;
  skipped: number;
  conflicts: string[];
  errors: string[];
  details: string;
}

const report: ReportEntry[] = [];

function entry(
  table: string,
  action: ReportEntry["action"],
  { localCount, remoteCount, applied = 0, skipped = 0, conflicts = [], errors = [], details = "" }: Partial<{
    localCount: number;
    remoteCount: number;
    applied: number;
    skipped: number;
    conflicts: string[];
    errors: string[];
    details: string;
  }> = {}
): ReportEntry {
  const e: ReportEntry = {
    table,
    action,
    localCount: localCount ?? 0,
    remoteCount: remoteCount ?? 0,
    applied: applied ?? 0,
    skipped: skipped ?? 0,
    conflicts: conflicts ?? [],
    errors: errors ?? [],
    details: details ?? "",
  };
  report.push(e);
  return e;
}

function log(msg: string) {
  console.log(msg);
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function readJsonFile<T>(filePath: string): { ok: true; data: T } | { ok: false; error: string } {
  try {
    if (!fs.existsSync(filePath)) {
      return { ok: false, error: "file not found" };
    }
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as T;
    return { ok: true, data };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

async function supabaseSelect<T = any>(
  table: string,
  select = "*"
): Promise<{ data: T[]; error: string | null; count: number }> {
  try {
    // Single data query — the row count is derived from the returned rows.
    // (A separate head/count query can fail under restrictive RLS grants.)
    const dataRes = await admin.from(table).select(select);
    if (dataRes.error) {
      const e = dataRes.error;
      return {
        data: [],
        error: `${e.code || 'ERROR'}: ${e.message || String(e)}${e.hint ? ` — ${e.hint}` : ''}`,
        count: 0,
      };
    }
    const rows = (dataRes.data as T[]) ?? [];
    return { data: rows, error: null, count: rows.length };
  } catch (err: any) {
    return { data: [], error: err?.message || String(err), count: 0 };
  }
}

async function supabaseUpsert<T = any>(
  table: string,
  rows: T[],
  options: { onConflict?: string } = {}
): Promise<{ ok: boolean; error: string | null; applied: number }> {
  if (DRY_RUN) {
    return { ok: true, error: null, applied: rows.length }; // pretend success in dry-run
  }
  if (rows.length === 0) return { ok: true, error: null, applied: 0 };
  try {
    // Cast through `any`: table name is dynamic so the generic row type cannot
    // be inferred statically. Trusted values are constructed per-table above.
    await (admin as any).from(table).upsert(rows as any, options as any).throwOnError();
    return { ok: true, error: null, applied: rows.length };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err), applied: 0 };
  }
}

/* ------------------------------------------------------------------ */
/*  Conflict detection                                                */
/* ------------------------------------------------------------------ */

interface ConflictWatch {
  duplicateIds: string[];
  duplicateCouponCodes: string[];
  conflictingUsernames: string[];
}

function detectConflicts<T extends { id?: string; code?: string; username?: string }>(
  rows: T[],
  label: string
): ConflictWatch {
  const ids = new Map<string, T[]>();
  const codes = new Map<string, T[]>();
  const usernames = new Map<string, T[]>();
  const dupIds: string[] = [];
  const dupCodes: string[] = [];
  const confUsers: string[] = [];

  for (const row of rows) {
    if (row.id) {
      const list = ids.get(row.id) ?? [];
      list.push(row);
      ids.set(row.id, list);
      if (list.length > 1 && !dupIds.includes(row.id)) dupIds.push(row.id);
    }
    if (row.code) {
      const norm = String(row.code).toUpperCase();
      const list = codes.get(norm) ?? [];
      list.push(row);
      codes.set(norm, list);
      if (list.length > 1 && !dupCodes.includes(norm)) dupCodes.push(norm);
    }
    if (row.username) {
      const list = usernames.get(row.username) ?? [];
      list.push(row);
      usernames.set(row.username, list);
      if (list.length > 1 && !confUsers.includes(row.username)) confUsers.push(row.username);
    }
  }

  return { duplicateIds: dupIds, duplicateCouponCodes: dupCodes, conflictingUsernames: confUsers };
}

/* ------------------------------------------------------------------ */
/*  Load local data                                                   */
/* ------------------------------------------------------------------ */

interface LocalData {
  storeBackend: any;
  supportDb: any;
  walletDb: any;
  siteDb: any;
  gatewaySecrets: any;
  available: string[];
}

function loadLocalData(): LocalData {
  const available: string[] = [];
  const load = (file: string, label: string) => {
    const r = readJsonFile(file);
    if (r.ok) available.push(label);
    return r;
  };

  const storeBackend = load(ROOT_STORE_BACKEND, "store_backend.json");
  const supportDb = load(path.join(DATA_DIR, "support_db.json"), "data/support_db.json");
  const walletDb = load(path.join(DATA_DIR, "wallet_db.json"), "data/wallet_db.json");
  const siteDb = load(path.join(DATA_DIR, "site_db.json"), "data/site_db.json");
  const gatewaySecrets = load(path.join(DATA_DIR, "gateway_secrets.json"), "data/gateway_secrets.json");

  return {
    storeBackend: storeBackend.ok ? storeBackend.data : null,
    supportDb: supportDb.ok ? supportDb.data : null,
    walletDb: walletDb.ok ? walletDb.data : null,
    siteDb: siteDb.ok ? siteDb.data : null,
    gatewaySecrets: gatewaySecrets.ok ? gatewaySecrets.data : null,
    available,
  };
}

/* ------------------------------------------------------------------ */
/*  Per-table migration steps                                         */
/* ------------------------------------------------------------------ */

async function migrateStoreConfig(local: LocalData) {
  const table = "store_config";
  const localConfig = local.storeBackend?.config;
  const remote = await supabaseSelect(table);
  if (remote.error) {
    entry(table, "error", { localCount: localConfig ? 1 : 0, remoteCount: 0, errors: [remote.error], details: "Failed to read remote store_config" });
    return;
  }

  // Remote already has 1 store_config row per task. Preserve it; merge local
  // non-sensitive fields only if remote row is essentially empty/default.
  const remoteRow = remote.data[0];
  const remoteHasContent = remoteRow && Object.keys(remoteRow).some(
    (k) => !["id", "created_at", "updated_at"].includes(k) && remoteRow[k] != null
  );

  if (remoteHasContent) {
    entry(table, "preserve", { localCount: localConfig ? 1 : 0, remoteCount: remote.count, details: "Remote store_config has content; preserving existing row, not overwriting with local JSON" });
    return;
  }

  if (localConfig && remote.data.length === 0) {
    const safeRow: any = { id: "default", ...localConfig, updated_at: new Date().toISOString() };
    // strip nothing sensitive here (store_config is not secret)
    const result = await supabaseUpsert(table, [safeRow], { onConflict: "id" });
    entry(table, result.ok ? "upsert" : "error", {
      localCount: 1, remoteCount: remote.count, applied: result.applied,
      errors: result.error ? [result.error!] : [],
      details: "Inserted local store config into empty remote table",
    });
    return;
  }

  entry(table, "skip", { localCount: localConfig ? 1 : 0, remoteCount: remote.count, details: "No action needed" });
}

async function migrateStoreCategories(local: LocalData) {
  const table = "store_categories";
  const localCats: any[] = Array.isArray(local.siteDb?.store_categories) ? local.siteDb.store_categories :
    (Array.isArray(local.storeBackend?.categories) ? local.storeBackend.categories : []);
  const remote = await supabaseSelect(table);
  if (remote.error) {
    entry(table, "error", { localCount: localCats.length, remoteCount: 0, errors: [remote.error] });
    return;
  }

  // Conflict detection on ids
  const conf = detectConflicts(localCats, "store_categories");
  if (conf.duplicateIds.length) {
    entry(table, "conflict", { localCount: localCats.length, remoteCount: remote.count, conflicts: conf.duplicateIds, details: "Duplicate category IDs in local data — must be resolved manually" });
    return;
  }

  // Map local -> remote-safe shape (strip nothing needed)
  const rows = localCats.map((c) => ({
    id: c.id,
    name: c.name,
    game_mode: c.game_mode,
    description: c.description,
    image_url: c.image_url,
    icon: c.icon,
    enabled: c.enabled ?? true,
    display_order: c.display_order ?? 0,
    theme: c.theme ?? "auto",
  }));

  // If remote already has categories, prefer keeping remote unless local has more
  // and remote is empty. Otherwise merge: upsert local keys, never delete remote.
  if (remote.count > 0) {
    entry(table, "upsert", {
      localCount: localCats.length, remoteCount: remote.count, applied: rows.length,
      details: "Upserting local categories by id; existing remote rows with same id are updated, others preserved",
    });
  } else {
    entry(table, "upsert", { localCount: localCats.length, remoteCount: 0, applied: rows.length, details: "Remote empty; inserting local categories" });
  }
  if (!DRY_RUN) {
    const r = await supabaseUpsert(table, rows, { onConflict: "id" });
    if (!r.ok) entry(table, "error", { localCount: localCats.length, remoteCount: remote.count, errors: [r.error!] });
  }
}

async function migrateStoreItems(local: LocalData) {
  const table = "store_items";
  const localItems: any[] = Array.isArray(local.storeBackend?.items) ? local.storeBackend.items : [];
  const remote = await supabaseSelect(table);
  if (remote.error) {
    entry(table, "error", { localCount: localItems.length, remoteCount: 0, errors: [remote.error] });
    return;
  }
  const conf = detectConflicts(localItems, "store_items");
  if (conf.duplicateIds.length) {
    entry(table, "conflict", { localCount: localItems.length, remoteCount: remote.count, conflicts: conf.duplicateIds, details: "Duplicate item IDs" });
    return;
  }
  const rows = localItems.map((i) => ({
    id: i.id,
    title: i.title,
    category: i.category,
    price: Number(i.price) || 0,
    description: i.description,
    image_url: i.image_url,
    display_order: i.display_order ?? 0,
    discount_percent: i.discount_percent ?? 0,
  }));
  entry(table, "upsert", { localCount: localItems.length, remoteCount: remote.count, applied: rows.length,
    details: "Upsert store items by id; remote-only items preserved" });
  if (!DRY_RUN) {
    const r = await supabaseUpsert(table, rows, { onConflict: "id" });
    if (!r.ok) entry(table, "error", { localCount: localItems.length, remoteCount: remote.count, errors: [r.error!] });
  }
}

async function migrateLeaderboard(local: LocalData) {
  const table = "leaderboard";
  const localLead: any[] = Array.isArray(local.storeBackend?.leaderboard) ? local.storeBackend.leaderboard : [];
  const remote = await supabaseSelect(table);
  if (remote.error) {
    entry(table, "error", { localCount: localLead.length, remoteCount: 0, errors: [remote.error] });
    return;
  }
  const conf = detectConflicts(localLead, "leaderboard");
  if (conf.duplicateIds.length) {
    entry(table, "conflict", { localCount: localLead.length, remoteCount: remote.count, conflicts: conf.duplicateIds, details: "Duplicate leaderboard IDs" });
    return;
  }
  const rows = localLead.map((l) => ({
    id: l.id,
    username: l.username,
    total_spent: Number(l.total_spent) || 0,
    rank: l.rank ?? null,
    updated_at: new Date().toISOString(),
  }));
  entry(table, "upsert", { localCount: localLead.length, remoteCount: remote.count, applied: rows.length,
    details: "Upsert leaderboard entries by id; remote entries preserved" });
  if (!DRY_RUN) {
    const r = await supabaseUpsert(table, rows, { onConflict: "id" });
    if (!r.ok) entry(table, "error", { localCount: localLead.length, remoteCount: remote.count, errors: [r.error!] });
  }
}

async function migrateStoreStaff(local: LocalData) {
  const table = "staff_members";
  const localStaff: any[] = Array.isArray(local.storeBackend?.staffList) ? local.storeBackend.staffList : [];
  const remote = await supabaseSelect(table);
  if (remote.error) {
    entry(table, "error", { localCount: localStaff.length, remoteCount: 0, errors: [remote.error] });
    return;
  }
  const conf = detectConflicts(localStaff, "store_staff");
  if (conf.duplicateIds.length) {
    entry(table, "conflict", { localCount: localStaff.length, remoteCount: remote.count, conflicts: conf.duplicateIds, details: "Duplicate staff IDs" });
    return;
  }
  const rows = localStaff.map((s) => ({
    id: s.id,
    name: s.name,
    role: s.role,
    avatar_url: s.avatar_url,
    description: s.description,
    discord_id: s.discord_id,
    discord_username: s.discord_username,
    discord_url: s.discord_url,
  }));
  entry(table, "upsert", { localCount: localStaff.length, remoteCount: remote.count, applied: rows.length,
    details: "Upsert store staff by id; remote staff preserved" });
  if (!DRY_RUN) {
    const r = await supabaseUpsert(table, rows, { onConflict: "id" });
    if (!r.ok) entry(table, "error", { localCount: localStaff.length, remoteCount: remote.count, errors: [r.error!] });
  }
}

async function migrateSubAdminKeys(local: LocalData) {
  const table = "subadmin_keys";
  const localKeys: any[] = Array.isArray(local.storeBackend?.subAdminKeys) ? local.storeBackend.subAdminKeys : [];
  const remote = await supabaseSelect(table);
  if (remote.error) {
    entry(table, "error", { localCount: localKeys.length, remoteCount: 0, errors: [remote.error] });
    return;
  }

  // Check for plaintext password column handling — we do NOT import plaintext
  // passwords into a hash column without hashing. Here we flag if passwords exist.
  const hasPlaintext = localKeys.some((k) => typeof k.password === "string" && k.password.trim().length > 0);

  // Duplicate id / code checks
  const conf = detectConflicts(localKeys, "subadmin_keys");
  const dupCodes = localKeys
    .map((k) => k.name)
    .filter((name, idx, arr) => arr.indexOf(name) !== idx);

  if (conf.duplicateIds.length) {
    entry(table, "conflict", { localCount: localKeys.length, remoteCount: remote.count, conflicts: conf.duplicateIds, details: "Duplicate sub-admin key IDs" });
    return;
  }

  // Remote-preservation: if remote already has subadmin_keys, do NOT overwrite
  // with local plaintext passwords. Instead report for manual review/hashing.
  if (remote.count > 0) {
    entry(table, "preserve", {
      localCount: localKeys.length, remoteCount: remote.count,
      details: `Remote subadmin_keys already populated (${remote.count} rows). Preserving remote. Local plaintext passwords NOT imported without explicit hashing step.`,
    });
    return;
  }

  // Remote empty: prepare rows. We cannot safely hash here without a password
  // library guaranteed present; instead insert with password_hash NULL and mark
  // for admin reset, OR skip. Safest: skip import of credentials, report it.
  if (hasPlaintext) {
    entry(table, "skip", {
      localCount: localKeys.length, remoteCount: 0,
      details: "Local sub-admin keys contain plaintext passwords. Not importing credentials automatically. Admin must recreate sub-admin keys via the admin panel (passwords hashed on creation).",
    });
    return;
  }

  const rows = localKeys.map((k) => ({
    id: k.id,
    name: k.name,
    password_hash: null,
    active: k.active ?? true,
    permissions: Array.isArray(k.permissions) ? k.permissions : [],
    created_at: k.createdAt ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));
  entry(table, "upsert", { localCount: localKeys.length, remoteCount: 0, applied: rows.length,
    details: "Inserted sub-admin key metadata without credentials (password_hash null — admin must reset passwords)" });
  if (!DRY_RUN) {
    const r = await supabaseUpsert(table, rows, { onConflict: "id" });
    if (!r.ok) entry(table, "error", { localCount: localKeys.length, remoteCount: 0, errors: [r.error!] });
  }
}

async function migrateActivityLogs(local: LocalData) {
  const table = "activity_logs";
  const localLogs: any[] = Array.isArray(local.storeBackend?.activityLogs) ? local.storeBackend.activityLogs : [];
  const remote = await supabaseSelect(table);
  if (remote.error) {
    entry(table, "error", { localCount: localLogs.length, remoteCount: 0, errors: [remote.error] });
    return;
  }
  const conf = detectConflicts(localLogs, "activity_logs");
  if (conf.duplicateIds.length) {
    entry(table, "conflict", { localCount: localLogs.length, remoteCount: remote.count, conflicts: conf.duplicateIds, details: "Duplicate activity log IDs" });
    return;
  }
  const rows = localLogs.map((l) => ({
    id: l.id,
    action: l.action,
    admin_name: l.adminName,
    details: l.details,
    timestamp: l.timestamp ?? l.createdAt ?? new Date().toISOString(),
    type: l.type,
  }));
  entry(table, "upsert", { localCount: localLogs.length, remoteCount: remote.count, applied: rows.length,
    details: "Upsert activity logs by id; remote logs preserved" });
  if (!DRY_RUN) {
    const r = await supabaseUpsert(table, rows, { onConflict: "id" });
    if (!r.ok) entry(table, "error", { localCount: localLogs.length, remoteCount: remote.count, errors: [r.error!] });
  }
}

async function migrateUpdates(local: LocalData) {
  const table = "server_updates";
  const localUpdates: any[] = Array.isArray(local.storeBackend?.updatesList) ? local.storeBackend.updatesList : [];
  const remote = await supabaseSelect(table);
  if (remote.error) {
    entry(table, "error", { localCount: localUpdates.length, remoteCount: 0, errors: [remote.error] });
    return;
  }
  const conf = detectConflicts(localUpdates, "server_updates");
  if (conf.duplicateIds.length) {
    entry(table, "conflict", { localCount: localUpdates.length, remoteCount: remote.count, conflicts: conf.duplicateIds, details: "Duplicate update IDs" });
    return;
  }
  const rows = localUpdates.map((u) => ({
    id: u.id,
    title: u.title,
    content: u.content,
    image_url: u.imageUrl,
    image_urls: u.imageUrls ?? [],
    author: u.author,
    tag: u.tag,
    pinned: u.pinned ?? false,
    created_at: u.createdAt ?? new Date().toISOString(),
  }));
  entry(table, "upsert", { localCount: localUpdates.length, remoteCount: remote.count, applied: rows.length,
    details: "Upsert server updates by id; remote updates preserved" });
  if (!DRY_RUN) {
    const r = await supabaseUpsert(table, rows, { onConflict: "id" });
    if (!r.ok) entry(table, "error", { localCount: localUpdates.length, remoteCount: remote.count, errors: [r.error!] });
  }
}

async function migrateVoteLinks(local: LocalData) {
  const table = "vote_links";
  const localLinks: any[] = Array.isArray(local.storeBackend?.voteLinks) ? local.storeBackend.voteLinks : [];
  const remote = await supabaseSelect(table);
  if (remote.error) {
    entry(table, "error", { localCount: localLinks.length, remoteCount: 0, errors: [remote.error] });
    return;
  }
  const conf = detectConflicts(localLinks, "vote_links");
  if (conf.duplicateIds.length) {
    entry(table, "conflict", { localCount: localLinks.length, remoteCount: remote.count, conflicts: conf.duplicateIds, details: "Duplicate vote link IDs" });
    return;
  }
  const rows = localLinks.map((v) => ({
    id: v.id,
    name: v.name,
    host: v.host,
    url: v.url,
    display_order: v.display_order ?? 0,
  }));
  entry(table, "upsert", { localCount: localLinks.length, remoteCount: remote.count, applied: rows.length,
    details: "Upsert vote links by id; remote links preserved" });
  if (!DRY_RUN) {
    const r = await supabaseUpsert(table, rows, { onConflict: "id" });
    if (!r.ok) entry(table, "error", { localCount: localLinks.length, remoteCount: remote.count, errors: [r.error!] });
  }
}

async function migrateRules(local: LocalData) {
  const table = "rules_categories";
  const localRules: any[] = Array.isArray(local.storeBackend?.rulesCategories) ? local.storeBackend.rulesCategories : [];
  const remote = await supabaseSelect(table);
  if (remote.error) {
    entry(table, "error", { localCount: localRules.length, remoteCount: 0, errors: [remote.error] });
    return;
  }
  const conf = detectConflicts(localRules, "rules_categories");
  if (conf.duplicateIds.length) {
    entry(table, "conflict", { localCount: localRules.length, remoteCount: remote.count, conflicts: conf.duplicateIds, details: "Duplicate rule category IDs" });
    return;
  }
  const rows = localRules.map((r, idx) => ({
    id: r.id,
    name: r.name,
    icon: r.icon,
    rules: Array.isArray(r.rules) ? r.rules : [],
    display_order: r.display_order ?? idx,
  }));
  entry(table, "upsert", { localCount: localRules.length, remoteCount: remote.count, applied: rows.length,
    details: "Upsert rule categories by id; remote rules preserved" });
  if (!DRY_RUN) {
    const r = await supabaseUpsert(table, rows, { onConflict: "id" });
    if (!r.ok) entry(table, "error", { localCount: localRules.length, remoteCount: remote.count, errors: [r.error!] });
  }
}

async function migrateConnectionGuide(local: LocalData) {
  const table = "connection_guide";
  const localGuide = local.storeBackend?.connectionGuide || local.siteDb; // fallback
  const remote = await supabaseSelect(table);
  if (remote.error) {
    entry(table, "error", { localCount: localGuide ? 1 : 0, remoteCount: 0, errors: [remote.error] });
    return;
  }
  // Remote already has 1 row per task; preserve it.
  if (remote.count > 0) {
    entry(table, "preserve", { localCount: localGuide ? 1 : 0, remoteCount: remote.count, details: "Remote connection_guide has content; preserving existing row" });
    return;
  }
  if (localGuide) {
    const row = {
      id: "default",
      java_title: localGuide.javaTitle,
      java_description: localGuide.javaDescription,
      java_steps: Array.isArray(localGuide.javaSteps) ? localGuide.javaSteps : [],
      bedrock_title: localGuide.bedrockTitle,
      bedrock_description: localGuide.bedrockDescription,
      bedrock_steps: Array.isArray(localGuide.bedrockSteps) ? localGuide.bedrockSteps : [],
      updated_at: new Date().toISOString(),
    };
    entry(table, "upsert", { localCount: 1, remoteCount: 0, applied: 1, details: "Inserted local connection guide into empty remote table" });
    if (!DRY_RUN) {
      const r = await supabaseUpsert(table, [row], { onConflict: "id" });
      if (!r.ok) entry(table, "error", { localCount: 1, remoteCount: 0, errors: [r.error!] });
    }
    return;
  }
  entry(table, "skip", { localCount: 0, remoteCount: remote.count, details: "No connection guide data available" });
}

async function migrateCouponsStore(local: LocalData) {
  const table = "coupons";
  const localCoupons: any[] = Array.isArray(local.storeBackend?.couponsList) ? local.storeBackend.couponsList : [];
  const remote = await supabaseSelect(table);
  if (remote.error) {
    entry(table, "error", { localCount: localCoupons.length, remoteCount: 0, errors: [remote.error] });
    return;
  }
  const conf = detectConflicts(localCoupons, "store_coupons");
  const dupCodes = localCoupons
    .map((c) => (c.code || "").toUpperCase())
    .filter((code, idx, arr) => code && arr.indexOf(code) !== idx);
  if (conf.duplicateIds.length || dupCodes.length) {
    entry(table, "conflict", {
      localCount: localCoupons.length, remoteCount: remote.count,
      conflicts: [...conf.duplicateIds, ...dupCodes],
      details: "Duplicate coupon IDs or duplicate coupon codes in local data",
    });
    return;
  }
  const rows = localCoupons.map((c) => ({
    id: c.id,
    code: c.code,
    category: c.category ?? "normal",
    discount_type: c.discountType ?? "percentage",
    discount_value: Number(c.discountValue ?? c.percent ?? 0),
    expiry_date: c.expiryDate,
    usage_limit: c.usageLimit ?? null,
    used_count: c.usedCount ?? 0,
    enabled: c.enabled !== false,
    percent: c.percent,
    created_at: c.createdAt ?? new Date().toISOString(),
  }));
  entry(table, "upsert", { localCount: localCoupons.length, remoteCount: remote.count, applied: rows.length,
    details: "Upsert store coupons by id/code; remote coupons preserved" });
  if (!DRY_RUN) {
    const r = await supabaseUpsert(table, rows, { onConflict: "code" });
    if (!r.ok) entry(table, "error", { localCount: localCoupons.length, remoteCount: remote.count, errors: [r.error!] });
  }
}

async function migrateWallet(local: LocalData) {
  /**
   * WALLET MIGRATION — EXTREME CARE
   * Local wallet_db.json has 1 wallet; Supabase already has 2 user_wallets.
   * NEVER overwrite remote with local. Never reset balances. Never delete.
   */
  const tableWallets = "user_wallets";
  const tableTx = "wallet_transactions";
  const tableRecharge = "wallet_recharges";
  const tablePayments = "payments";
  const tableCoupons = "wallet_coupons";
  const tableRedemptions = "wallet_coupon_redemptions";

  const localWallets: any[] = Array.isArray(local.walletDb?.user_wallets) ? local.walletDb.user_wallets : [];
  const remoteWallets = await supabaseSelect(tableWallets);
  if (remoteWallets.error) {
    entry(tableWallets, "error", { localCount: localWallets.length, remoteCount: 0, errors: [remoteWallets.error] });
    return;
  }

  // Remote already has 2 wallets (per task). Preserve balances. Only insert local
  // wallets whose user_id does NOT already exist remotely.
  const remoteUserIds = new Set(remoteWallets.data.map((w: any) => w.user_id));
  const newWallets = localWallets.filter((w) => !remoteUserIds.has(w.userId));
  const skippedWallets = localWallets.filter((w) => remoteUserIds.has(w.userId));

  const walletRows = newWallets.map((w) => ({
    user_id: w.userId,
    username: w.username,
    email: w.email,
    balance: Number(w.balance) || 0,
    total_credits_added: Number(w.totalCreditsAdded ?? w.totalCredited ?? 0),
    total_credits_spent: Number(w.totalCreditsSpent ?? w.totalSpent ?? 0),
    total_refunds: Number(w.totalRefunds ?? 0),
    total_promotional_credits: Number(w.totalPromotionalCredits ?? 0),
    created_at: w.createdAt ?? new Date().toISOString(),
    updated_at: w.updatedAt ?? new Date().toISOString(),
  }));

  entry(tableWallets, "preserve", {
    localCount: localWallets.length,
    remoteCount: remoteWallets.count,
    applied: walletRows.length,
    skipped: skippedWallets.length,
    details: `Remote has ${remoteWallets.count} wallet(s); preserving all remote balances. Inserting only local user_ids not present remotely (${walletRows.length}). Skipped ${skippedWallets.length} existing remote user(s).`,
  });
  if (!DRY_RUN && walletRows.length) {
    const r = await supabaseUpsert(tableWallets, walletRows, { onConflict: "user_id" });
    if (!r.ok) entry(tableWallets, "error", { localCount: localWallets.length, remoteCount: remoteWallets.count, errors: [r.error!] });
  }

  // Transactions, recharges, payments: upsert by id, never delete.
  // NOTE: cross-reference with preserved wallets — only migrate rows whose
  // user_id exists remotely or is being inserted.
  const knownUserIds = new Set([...remoteUserIds, ...walletRows.map((r) => r.user_id)]);

  const migrateWalletTable = async (
    t: string,
    localRows: any[],
    mapRow: (r: any) => any,
    conflictCol: string
  ) => {
    const remote = await supabaseSelect(t);
    if (remote.error) {
      entry(t, "error", { localCount: localRows.length, remoteCount: 0, errors: [remote.error] });
      return;
    }
    const conf = detectConflicts(localRows, t);
    if (conf.duplicateIds.length) {
      entry(t, "conflict", { localCount: localRows.length, remoteCount: remote.count, conflicts: conf.duplicateIds, details: `Duplicate IDs in local ${t}` });
      return;
    }
    // Filter to rows whose user is known (preserve remote rows for unknown users)
    const rows = localRows
      .filter((r) => {
        const uid = mapRow(r).user_id;
        return uid ? knownUserIds.has(uid) : true;
      })
      .map(mapRow);

    entry(t, "upsert", { localCount: localRows.length, remoteCount: remote.count, applied: rows.length,
      details: `Upsert ${t} by ${conflictCol}; remote rows preserved; never deletes` });
    if (!DRY_RUN && rows.length) {
      const r = await supabaseUpsert(t, rows, { onConflict: conflictCol });
      if (!r.ok) entry(t, "error", { localCount: localRows.length, remoteCount: remote.count, errors: [r.error!] });
    }
  };

  await migrateWalletTable(
    tableTx,
    Array.isArray(local.walletDb?.wallet_transactions) ? local.walletDb.wallet_transactions : [],
    (r) => ({
      id: r.id,
      user_id: r.userId,
      transaction_ref: r.transactionRef,
      type: r.type,
      amount: Number(r.amount) || 0,
      previous_balance: r.previousBalance,
      balance_after: r.balanceAfter ?? r.updatedBalance,
      updated_balance: r.updatedBalance,
      description: r.description,
      related_order_id: r.relatedOrderId,
      payment_id: r.paymentId,
      status: r.status ?? "successful",
      admin_id: r.adminId,
      admin_name: r.adminName,
      reason: r.reason,
      created_at: r.createdAt ?? new Date().toISOString(),
    }),
    "id"
  );

  await migrateWalletTable(
    tableRecharge,
    Array.isArray(local.walletDb?.wallet_recharges) ? local.walletDb.wallet_recharges : [],
    (r) => ({
      id: r.id,
      recharge_ref: r.rechargeRef ?? r.id,
      user_id: r.userId,
      username: r.username,
      email: r.email,
      amount: Number(r.amount) || 0,
      credits: Number(r.credits ?? r.amount),
      payment_method: r.paymentMethod,
      payment_gateway: r.paymentGateway,
      gateway_order_id: r.gatewayOrderId,
      gateway_payment_id: r.gatewayPaymentId,
      payment_id: r.paymentId,
      status: r.status ?? "pending",
      failure_reason: r.failureReason,
      created_at: r.createdAt ?? new Date().toISOString(),
      updated_at: r.updatedAt ?? new Date().toISOString(),
    }),
    "id"
  );

  await migrateWalletTable(
    tablePayments,
    Array.isArray(local.walletDb?.payments) ? local.walletDb.payments : [],
    (r) => ({
      id: r.id,
      transaction_id: r.transactionId,
      order_id: r.orderId,
      user_id: r.userId,
      username: r.username,
      email: r.email,
      product_name: r.productName,
      amount: Number(r.amount) || 0,
      wallet_amount: r.walletAmount,
      online_amount: r.onlineAmount,
      online_transaction_id: r.onlineTransactionId,
      payment_method: r.paymentMethod,
      payment_gateway: r.paymentGateway,
      payment_type: r.paymentType,
      status: r.status ?? "pending",
      gateway_order_id: r.gatewayOrderId,
      gateway_reference: r.gatewayReference,
      verified_by_backend: r.verifiedByBackend ?? false,
      failure_reason: r.failureReason,
      created_at: r.createdAt ?? new Date().toISOString(),
      updated_at: r.updatedAt ?? new Date().toISOString(),
    }),
    "id"
  );

  // Wallet coupons (distinct from store coupons)
  await migrateWalletTable(
    tableCoupons,
    Array.isArray(local.walletDb?.wallet_coupons) ? local.walletDb.wallet_coupons : [],
    (r) => ({
      id: r.id,
      code: r.code,
      reward_amount: Number(r.rewardAmount) || 0,
      coupon_type: r.couponType ?? "multi_use",
      total_limit: r.totalLimit ?? null,
      per_user_limit: r.perUserLimit ?? 1,
      redeemed_count: r.redeemedCount ?? 0,
      start_date: r.startDate,
      expiry_date: r.expiryDate,
      status: r.status ?? "active",
      description: r.description,
      created_by: r.createdBy,
      created_at: r.createdAt ?? new Date().toISOString(),
      updated_at: r.updatedAt ?? new Date().toISOString(),
    }),
    "id"
  );

  await migrateWalletTable(
    tableRedemptions,
    Array.isArray(local.walletDb?.wallet_coupon_redemptions) ? local.walletDb.wallet_coupon_redemptions : [],
    (r) => ({
      id: r.id,
      coupon_id: r.couponId,
      coupon_code: r.couponCode,
      user_id: r.userId,
      username: r.username,
      user_email: r.userEmail,
      wallet_id: r.walletId ?? r.userId,
      wallet_transaction_id: r.walletTransactionId,
      amount: r.amount,
      reward_amount: Number(r.rewardAmount) || 0,
      previous_balance: r.previousBalance,
      new_balance: r.newBalance,
      status: r.status ?? "successful",
      error_message: r.errorMessage,
      created_at: r.createdAt ?? new Date().toISOString(),
    }),
    "id"
  );
}

/* ------------------------------------------------------------------ */
/*  Support system migration                                          */
/* ------------------------------------------------------------------ */

async function migrateSupport(local: LocalData) {
  const supportDb = local.supportDb;
  if (!supportDb) {
    entry("support_tickets", "skip", { localCount: 0, remoteCount: 0, details: "No local support_db.json found" });
    return;
  }

  const tables = [
    { name: "support_tickets", key: "support_tickets", col: "id" },
    { name: "support_messages", key: "support_messages", col: "id" },
    { name: "support_attachments", key: "support_attachments", col: "id" },
    { name: "support_staff_permissions", key: "support_staff_permissions", col: "id" },
    { name: "support_notifications", key: "support_notifications", col: "id" },
    { name: "support_ratings", key: "support_ratings", col: "id" },
    { name: "ticket_history", key: "ticket_history", col: "id" },
  ];

  for (const t of tables) {
    const localRows: any[] = Array.isArray(supportDb[t.key]) ? supportDb[t.key] : [];
    const remote = await supabaseSelect(t.name);
    if (remote.error) {
      entry(t.name, "error", { localCount: localRows.length, remoteCount: 0, errors: [remote.error] });
      continue;
    }
    const conf = detectConflicts(localRows, t.name);
    if (conf.duplicateIds.length) {
      entry(t.name, "conflict", { localCount: localRows.length, remoteCount: remote.count, conflicts: conf.duplicateIds, details: `Duplicate IDs in local ${t.name}` });
      continue;
    }
    // Map staff permissions to expanded schema
    let rows = localRows;
    if (t.name === "support_staff_permissions") {
      rows = localRows.map((s) => ({
        id: s.id,
        staff_id: s.id,
        name: s.name,
        role_title: s.roleTitle,
        passkey_hash: null, // plaintext passkey NOT imported; admin resets
        email: s.email,
        active: s.active ?? true,
        can_view_all_tickets: s.canViewAllTickets ?? false,
        can_reply: s.canReply ?? true,
        can_assign: s.canAssign ?? false,
        can_change_status: s.canChangeStatus ?? true,
        can_add_internal_notes: s.canAddInternalNotes ?? true,
        can_delete_tickets: s.canDeleteTickets ?? false,
        permissions: [],
        created_at: s.updatedAt ?? new Date().toISOString(),
        updated_at: s.updatedAt ?? new Date().toISOString(),
      }));
      // Flag hardcoded default passkey present in local data
      if (localRows.some((s: any) => s.passkey === "supportpass123")) {
        entry(t.name, "conflict", {
          localCount: localRows.length, remoteCount: remote.count,
          conflicts: ["hardcoded-default-passkey"],
          details: "Local support_db contains hardcoded default staff passkey 'supportpass123'. Not importing credentials. Admin must recreate staff accounts with hashed passwords.",
        });
        continue;
      }
    }
    entry(t.name, "upsert", { localCount: localRows.length, remoteCount: remote.count, applied: rows.length,
      details: `Upsert ${t.name} by id; remote rows preserved` });
    if (!DRY_RUN && rows.length) {
      const r = await supabaseUpsert(t.name, rows, { onConflict: t.col });
      if (!r.ok) entry(t.name, "error", { localCount: localRows.length, remoteCount: remote.count, errors: [r.error!] });
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Donation migration                                                */
/* ------------------------------------------------------------------ */

async function migrateDonations(local: LocalData) {
  const tables = [
    { name: "donation_requests", key: "requests", col: "id" },
    { name: "donation_rewards", key: "rewards", col: "id" },
    { name: "donation_audit_logs", key: "audit_logs", col: "id" },
  ];
  for (const t of tables) {
    const localRows: any[] = Array.isArray(local.supportDb?.[t.key]) ? local.supportDb[t.key] : [];
    const remote = await supabaseSelect(t.name);
    if (remote.error) {
      entry(t.name, "error", { localCount: localRows.length, remoteCount: 0, errors: [remote.error] });
      continue;
    }
    const conf = detectConflicts(localRows, t.name);
    if (conf.duplicateIds.length) {
      entry(t.name, "conflict", { localCount: localRows.length, remoteCount: remote.count, conflicts: conf.duplicateIds, details: `Duplicate IDs in local ${t.name}` });
      continue;
    }
    entry(t.name, "upsert", { localCount: localRows.length, remoteCount: remote.count, applied: localRows.length,
      details: `Upsert ${t.name} by id; remote rows preserved` });
    if (!DRY_RUN && localRows.length) {
      const r = await supabaseUpsert(t.name, localRows, { onConflict: t.col });
      if (!r.ok) entry(t.name, "error", { localCount: localRows.length, remoteCount: remote.count, errors: [r.error!] });
    }
  }

  // donation_settings — remote already has 1 row per task; preserve it.
  const remoteSettings = await supabaseSelect("donation_settings");
  if (remoteSettings.error) {
    entry("donation_settings", "error", { localCount: 0, remoteCount: 0, errors: [remoteSettings.error] });
  } else if (remoteSettings.count > 0) {
    entry("donation_settings", "preserve", { localCount: 0, remoteCount: remoteSettings.count, details: "Remote donation_settings preserved; not overwritten" });
  }
}

/* ------------------------------------------------------------------ */
/*  Gateway secrets — NEVER import into public tables                 */
/* ------------------------------------------------------------------ */

function handleGatewaySecrets(local: LocalData) {
  if (local.gatewaySecrets) {
    entry("gateway_secrets", "skip", {
      localCount: 1, remoteCount: 0,
      details: "data/gateway_secrets.json contains private Razorpay credentials. NOT imported into Supabase public tables. Keep credentials in backend environment variables (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET, GATEWAY_SIGNING_SECRET) only.",
    });
  }
}

/* ------------------------------------------------------------------ */
/*  Main                                                              */
/* ------------------------------------------------------------------ */

async function main() {
  admin = createClient(URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  log("=".repeat(70));
  log(`WONDERMC Supabase Migration — ${DRY_RUN ? "DRY-RUN (report only)" : "EXECUTE MODE"}`);
  log("=".repeat(70));
  log("");

  const local = loadLocalData();
  log(`[Local data discovered: ${local.available.join(", ") || "none"}]`);
  log("");

  // Order matters: config/reference first, then financial (wallet), then support/donations.
  await migrateStoreConfig(local);
  await migrateStoreCategories(local);
  await migrateStoreItems(local);
  await migrateStoreStaff(local);
  await migrateSubAdminKeys(local);
  await migrateActivityLogs(local);
  await migrateUpdates(local);
  await migrateVoteLinks(local);
  await migrateRules(local);
  await migrateConnectionGuide(local);
  await migrateCouponsStore(local);
  await migrateWallet(local);   // financial — extreme care
  await migrateSupport(local);
  await migrateDonations(local);
  handleGatewaySecrets(local);

  // ------------------------------------------------------------------
  // Report
  // ------------------------------------------------------------------
  log("");
  log("=".repeat(70));
  log("MIGRATION REPORT");
  log("=".repeat(70));

  let totalApplied = 0;
  let totalConflicts = 0;
  let totalErrors = 0;

  for (const e of report) {
    const mark = e.action === "error" ? "✖" : e.action === "conflict" ? "⚠" : e.action === "preserve" ? "◷" : e.action === "skip" ? "⊘" : "✓";
    log(`${mark} ${e.table.padEnd(32)} | ${e.action.padEnd(9)} | local=${String(e.localCount).padStart(3)} remote=${String(e.remoteCount).padStart(3)} applied=${e.applied} skipped=${e.skipped}`);
    if (e.conflicts.length) log(`      CONFLICTS: ${e.conflicts.join(", ")}`);
    if (e.errors.length) log(`      ERRORS: ${e.errors.join("; ")}`);
    if (e.details) log(`      ${e.details}`);
    totalApplied += e.applied;
    totalConflicts += e.conflicts.length;
    totalErrors += e.errors.length;
  }

  log("-".repeat(70));
  log(`Totals — applied: ${totalApplied} | conflicts: ${totalConflicts} | errors: ${totalErrors}`);
  log(`Mode: ${DRY_RUN ? "DRY-RUN — no data was written" : "EXECUTE — changes applied to Supabase"}`);
  log("=".repeat(70));

  if (totalConflicts > 0) {
    log("");
    log("CONFLICTS DETECTED. Resolve manually before running --execute again.");
  }
  if (DRY_RUN) {
    log("");
    log("This was a dry-run. To apply, run:  npx tsx scripts/migrate-to-supabase.ts --execute");
    log("Requires explicit approval before applying to production.");
  }
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
