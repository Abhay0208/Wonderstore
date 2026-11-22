/**
 * Shared store-data service.
 *
 * All shared/catalog data (categories, items, coupons, leaderboard, staff,
 * updates, votes, rules, connection guide, sale config, store config) lives
 * centrally in Supabase via the Express backend. localStorage is only a local
 * UI cache — never the source of truth.
 */
import type {
  StoreCategory, StoreItem, TopBuyer, StaffMember, ServerUpdate, Coupon,
  VoteLink, ConnectionGuide, RuleCategory, StoreSaleConfig,
} from '../types';

function staffToken(): string {
  try {
    return sessionStorage.getItem('wondermc_support_staff_token') || '';
  } catch {
    return '';
  }
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = staffToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token && !headers.Authorization) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const storeDataService = {
  async fetchSharedData(): Promise<{
    categories: StoreCategory[];
    items: StoreItem[];
    coupons: Coupon[];
    leaderboard: TopBuyer[];
    staff: StaffMember[];
    updates: ServerUpdate[];
    voteLinks: VoteLink[];
    rules: RuleCategory[];
    guide: ConnectionGuide | null;
    saleConfig: StoreSaleConfig | null;
  }> {
    const settled = await Promise.allSettled([
      request<{ categories: StoreCategory[] }>('/api/store-categories'),
      request<{ items: StoreItem[] }>('/api/store/items'),
      request<{ coupons: Coupon[] }>('/api/store/coupons'),
      request<{ leaderboard: TopBuyer[] }>('/api/store/leaderboard'),
      request<{ staff: StaffMember[] }>('/api/store/staff'),
      request<{ updates: ServerUpdate[] }>('/api/store/updates'),
      request<{ voteLinks: VoteLink[] }>('/api/store/vote-links'),
      request<{ rules: RuleCategory[] }>('/api/store/rules'),
      request<{ guide: ConnectionGuide | null }>('/api/store/connection-guide'),
      request<{ saleConfig: StoreSaleConfig | null }>('/api/store/sale-config'),
    ]);
    // Extract the first property of each response object explicitly.
    const first = <T>(i: number, fallback: T): T => {
      if (settled[i].status !== 'fulfilled') return fallback;
      const obj = (settled[i] as PromiseFulfilledResult<any>).value || {};
      return (Object.values(obj)[0] as T) ?? fallback;
    };
    return {
      categories: first(0, []),
      items: first(1, []),
      coupons: first(2, []),
      leaderboard: first(3, []),
      staff: first(4, []),
      updates: first(5, []),
      voteLinks: first(6, []),
      rules: first(7, []),
      guide: first(8, null),
      saleConfig: first(9, null),
    };
  },

  async saveItems(items: StoreItem[], token?: string): Promise<void> {
    // Full sync: delete removed + upsert each. Backend is authoritative.
    await request('/api/store/items/sync', {
      method: 'PUT',
      body: JSON.stringify({ items }),
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },

  async saveCategories(categories: StoreCategory[], token?: string): Promise<void> {
    await request('/api/admin/store-categories/sync', {
      method: 'PUT',
      body: JSON.stringify({ categories }),
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },

  async saveStaff(staff: StaffMember[], token?: string): Promise<void> {
    await request('/api/store/staff/sync', {
      method: 'PUT',
      body: JSON.stringify({ staff }),
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },

  async saveLeaderboard(leaderboard: TopBuyer[], token?: string): Promise<void> {
    await request('/api/store/leaderboard/sync', {
      method: 'PUT',
      body: JSON.stringify({ leaderboard }),
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },

  async saveUpdates(updates: ServerUpdate[], token?: string): Promise<void> {
    await request('/api/store/updates/sync', {
      method: 'PUT',
      body: JSON.stringify({ updates }),
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },

  async saveConfig(config: Record<string, any>, token?: string): Promise<void> {
    await request('/api/store/config', {
      method: 'PUT',
      body: JSON.stringify(config),
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
};
