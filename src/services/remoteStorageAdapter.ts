/**
 * Remote-capable storage adapter.
 * Primary persistence is now the backend (which uses Supabase).
 * localStorage is used only as a temporary cache / offline fallback for UI preferences.
 */
import type { StorageAdapter } from './storageAdapter';

export class RemoteStorageAdapter implements StorageAdapter {
  readonly mode = 'remote' as const;

  private cache = new Map<string, unknown>();

  read<T>(key: string, fallback: T): T {
    if (this.cache.has(key)) {
      return this.cache.get(key) as T;
    }
    // Fallback to localStorage cache
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = window.localStorage.getItem(key);
        if (raw !== null) {
          const parsed = JSON.parse(raw) as T;
          this.cache.set(key, parsed);
          return parsed;
        }
      } catch {
        // ignore
      }
    }
    return fallback;
  }

  write<T>(key: string, value: T): boolean {
    this.cache.set(key, value);
    // Keep a local cache for fast UI, but the source of truth is the backend
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // ignore quota
      }
    }
    // In a full implementation, this would POST to /api/site or similar.
    // Contexts that need persistence should call the backend services directly.
    return true;
  }

  remove(key: string): void {
    this.cache.delete(key);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // ignore
      }
    }
  }
}

// Export a singleton that can be swapped
export const remoteStorageAdapter = new RemoteStorageAdapter();
