/**
 * Modular Persistence Adapter for WONDER MC Storefront.
 *
 * Primary persistence is now Supabase (via backend API endpoints).
 * localStorage is retained only as a short-lived cache for UI responsiveness.
 */

export interface StorageAdapter {
  readonly mode: 'local' | 'remote';
  read<T>(key: string, fallback: T): T;
  write<T>(key: string, value: T): boolean;
  remove(key: string): void;
}

class LocalBrowserStorageAdapter implements StorageAdapter {
  readonly mode = 'local' as const;

  read<T>(key: string, fallback: T): T {
    if (typeof window === 'undefined' || !window.localStorage) {
      return fallback;
    }
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  write<T>(key: string, value: T): boolean {
    if (typeof window === 'undefined' || !window.localStorage) {
      return false;
    }
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  remove(key: string): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore storage errors
    }
  }
}

// Use local adapter as cache; real persistence happens through backend services
// that write to Supabase. Do not treat localStorage as the source of truth.
export const storageAdapter: StorageAdapter = new LocalBrowserStorageAdapter();

export const STORAGE_KEYS = {
  STORE_CONFIG: 'wondermc_store_config_v2',
  CATEGORIES: 'wondermc_categories_v1',
  ITEMS: 'wondermc_items_v1',
  LEADERBOARD: 'wondermc_leaderboard_v1',
  STAFF: 'wondermc_staff_v1',
  UPDATES: 'wondermc_updates_v1',
  SUBADMIN_KEYS: 'wondermc_subadmin_keys_v1',
  COUPONS: 'wondermc_coupons_v1',
  ACTIVITY_LOGS: 'wondermc_activity_logs_v1',
  VOTE_LINKS: 'wondermc_vote_links',
  CONNECTION_GUIDE: 'wondermc_connection_guide_v1',
  RULES: 'wondermc_rules_categories_v1',
  SALE_CONFIG: 'wondermc_sale_config_v1',
  TICKETS: 'wondermc_support_tickets_v1',
  ORDERS: 'wondermc_orders_v1',
} as const;
