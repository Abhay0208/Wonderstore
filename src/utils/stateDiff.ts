export const STALE_TEST_KEYS = [
  'test_ping',
  'testTimestamp',
  'test_quota_check',
  'test_quota_fixed',
  'testPing',
  'test_verify',
] as const;

export const ALLOWED_STORE_SECTIONS = [
  'subAdminKeys',
  'items',
  'categories',
  'leaderboard',
  'staffList',
  'couponsList',
  'activityLogs',
  'updatesList',
  'voteLinks',
  'tickets',
  'config',
  'saleConfig',
  'connectionGuide',
  'rulesCategories',
  'orders',
] as const;

export type StoreSectionKey = (typeof ALLOWED_STORE_SECTIONS)[number];

/**
 * Removes legacy diagnostic/test keys so they are not persisted back to Firestore or disk.
 */
export function stripTestKeys<T extends Record<string, any>>(data: T): Record<string, any> {
  if (!data || typeof data !== 'object') return {};
  const result: Record<string, any> = {};
  const testKeySet = new Set<string>(STALE_TEST_KEYS);
  for (const [key, val] of Object.entries(data)) {
    if (!testKeySet.has(key)) {
      result[key] = val;
    }
  }
  return result;
}

/**
 * Deterministic deep equality check for JSON-serializable state payloads.
 */
export function areValuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!areValuesEqual(a[i], b[i])) return false;
    }
    return true;
  }

  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  const keysA = Object.keys(objA).filter((k) => objA[k] !== undefined);
  const keysB = Object.keys(objB).filter((k) => objB[k] !== undefined);

  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(objB, key)) return false;
    if (!areValuesEqual(objA[key], objB[key])) return false;
  }
  return true;
}

/**
 * Returns only the section keys whose incoming value actually differs from current state.
 * Ignores metadata keys like `_lastUpdated` and legacy test keys.
 */
export function computeChangedSections(
  current: Record<string, any>,
  incoming: Record<string, any>
): string[] {
  if (!incoming || typeof incoming !== 'object') return [];
  const testKeySet = new Set<string>(STALE_TEST_KEYS);
  const changed: string[] = [];

  for (const [key, nextVal] of Object.entries(incoming)) {
    if (key === '_lastUpdated' || testKeySet.has(key)) continue;
    if (nextVal === undefined) continue;
    const prevVal = current ? current[key] : undefined;
    if (!areValuesEqual(prevVal, nextVal)) {
      changed.push(key);
    }
  }

  return changed;
}

/**
 * Estimates the next daily Firestore quota reset timestamp (next midnight America/Los_Angeles, UTC-8),
 * bounded between 5 minutes and 24 hours from `nowMs`.
 */
export function getNextQuotaResetMs(nowMs: number = Date.now()): number {
  const pacificOffsetMs = 8 * 60 * 60 * 1000; // Standard PT (UTC-8)
  const pacificNow = nowMs - pacificOffsetMs;
  const msPerDay = 24 * 60 * 60 * 1000;
  const pacificMidnightNext = (Math.floor(pacificNow / msPerDay) + 1) * msPerDay;
  const utcResetMs = pacificMidnightNext + pacificOffsetMs + 5 * 60 * 1000; // +5m safety buffer
  const minWait = nowMs + 5 * 60 * 1000;
  const maxWait = nowMs + msPerDay;
  return Math.min(maxWait, Math.max(minWait, utcResetMs));
}
