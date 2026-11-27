import fs from 'fs';
import path from 'path';
import type { GamemodeVisualSettings, StoreCategory, StoreThemeId, ThemeSettingItem } from '../src/types';
import { INITIAL_CATEGORIES } from '../src/config/storeDefaults';
import { deduplicateStoreCategories } from '../src/utils/categoryManagement';
import {
  type ClickAnimationConfig,
  DEFAULT_CLICK_CONFIGS,
  normalizeClickAnimationsMap,
} from '../src/utils/clickAnimationHelpers';
import {
  DEFAULT_THEME_SETTINGS,
  normalizeThemeSettings,
} from '../src/utils/themeBannerHelpers';
import {
  DEFAULT_GAMEMODE_VISUALS,
  normalizeGamemodeVisuals,
} from '../src/utils/gamemodeVisualHelpers';

export type { ClickAnimationConfig, GamemodeVisualSettings, ThemeSettingItem };
export { DEFAULT_GAMEMODE_VISUALS, DEFAULT_THEME_SETTINGS };
export const DEFAULT_CLICK_ANIMATIONS = DEFAULT_CLICK_CONFIGS;

export interface SiteDbSchema {
  store_categories: StoreCategory[];
  theme_settings: Record<StoreThemeId, ThemeSettingItem>;
  click_animations: Record<StoreThemeId, ClickAnimationConfig>;
  gamemode_visuals?: GamemodeVisualSettings;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const SITE_DB_FILE = path.join(DATA_DIR, 'site_db.json');
const LEGACY_CRATES_DB_FILE = path.join(DATA_DIR, 'crates_db.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function createInitialSiteDb(): SiteDbSchema {
  return {
    store_categories: deduplicateStoreCategories(INITIAL_CATEGORIES),
    theme_settings: normalizeThemeSettings(DEFAULT_THEME_SETTINGS),
    click_animations: normalizeClickAnimationsMap(DEFAULT_CLICK_ANIMATIONS),
    gamemode_visuals: normalizeGamemodeVisuals(DEFAULT_GAMEMODE_VISUALS),
  };
}

class SiteDatabase {
  private cache: SiteDbSchema | null = null;

  private load(): SiteDbSchema {
    if (this.cache) return this.cache;
    ensureDataDir();

    try {
      if (!fs.existsSync(SITE_DB_FILE)) {
        // Migrate non-crate global settings from legacy crates_db.json if present
        if (fs.existsSync(LEGACY_CRATES_DB_FILE)) {
          try {
            const legacyRaw = fs.readFileSync(LEGACY_CRATES_DB_FILE, 'utf-8');
            const legacy = JSON.parse(legacyRaw) as Partial<SiteDbSchema>;
            const migrated: SiteDbSchema = {
              store_categories:
                Array.isArray(legacy.store_categories) && legacy.store_categories.length > 0
                  ? deduplicateStoreCategories(legacy.store_categories)
                  : deduplicateStoreCategories(INITIAL_CATEGORIES),
              theme_settings: normalizeThemeSettings(legacy.theme_settings),
              click_animations: normalizeClickAnimationsMap(legacy.click_animations),
            };
            this.save(migrated);
            return migrated;
          } catch {
            // fallback to fresh init
          }
        }
        const init = createInitialSiteDb();
        this.save(init);
        return init;
      }

      const raw = fs.readFileSync(SITE_DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<SiteDbSchema>;
      const hydrated: SiteDbSchema = {
        store_categories:
          Array.isArray(parsed.store_categories) && parsed.store_categories.length > 0
            ? deduplicateStoreCategories(parsed.store_categories)
            : deduplicateStoreCategories(INITIAL_CATEGORIES),
        theme_settings: normalizeThemeSettings(parsed.theme_settings),
        click_animations: normalizeClickAnimationsMap(parsed.click_animations),
        gamemode_visuals: normalizeGamemodeVisuals(parsed.gamemode_visuals),
      };
      this.cache = hydrated;
      return hydrated;
    } catch {
      const init = createInitialSiteDb();
      this.save(init);
      return init;
    }
  }

  private save(data: SiteDbSchema): void {
    ensureDataDir();
    this.cache = data;
    const tmp = `${SITE_DB_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmp, SITE_DB_FILE);
  }

  getStoreCategories(): StoreCategory[] {
    const db = this.load();
    return [...deduplicateStoreCategories(db.store_categories)].sort(
      (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)
    );
  }

  syncStoreCategories(incoming: StoreCategory[]): { storeCategories: StoreCategory[] } {
    const db = this.load();
    if (!Array.isArray(incoming)) {
      throw new Error('Store categories array is required.');
    }
    const clean = deduplicateStoreCategories(incoming);
    if (clean.length === 0) {
      throw new Error('At least one valid store category is required.');
    }
    db.store_categories = clean;
    this.save(db);
    return { storeCategories: this.getStoreCategories() };
  }

  getThemeSettings(): Record<StoreThemeId, ThemeSettingItem> {
    const db = this.load();
    return normalizeThemeSettings(db.theme_settings);
  }

  updateThemeSettings(
    settings: Partial<Record<StoreThemeId, Partial<ThemeSettingItem>>>
  ): Record<StoreThemeId, ThemeSettingItem> {
    const db = this.load();
    const merged: Partial<Record<StoreThemeId, Partial<ThemeSettingItem>>> = {};
    (['default', 'winter', 'christmas', 'newyear2027', 'ramadan'] as StoreThemeId[]).forEach((id) => {
      const existing = db.theme_settings?.[id] || DEFAULT_THEME_SETTINGS[id];
      const incoming = settings?.[id];
      if (incoming && typeof incoming === 'object') {
        merged[id] = {
          ...DEFAULT_THEME_SETTINGS[id],
          // Preserve existing floating emoji config unless the payload includes floating emoji fields
          ...(typeof existing.floatingEmojisEnabled === 'boolean'
            ? { floatingEmojisEnabled: existing.floatingEmojisEnabled }
            : {}),
          ...(Array.isArray(existing.floatingEmojis)
            ? { floatingEmojis: existing.floatingEmojis }
            : {}),
          ...(existing.floatingEmojiDensity
            ? { floatingEmojiDensity: existing.floatingEmojiDensity }
            : {}),
          ...(existing.floatingEmojiSpeed
            ? { floatingEmojiSpeed: existing.floatingEmojiSpeed }
            : {}),
          ...incoming,
          id,
        };
      } else {
        merged[id] = existing;
      }
    });
    db.theme_settings = normalizeThemeSettings(merged);
    this.save(db);
    return db.theme_settings;
  }

  updateFloatingEmojis(
    updates: Partial<
      Record<
        StoreThemeId,
        Pick<
          ThemeSettingItem,
          'floatingEmojisEnabled' | 'floatingEmojis' | 'floatingEmojiDensity' | 'floatingEmojiSpeed'
        >
      >
    >
  ): Record<StoreThemeId, ThemeSettingItem> {
    const db = this.load();
    const merged: Partial<Record<StoreThemeId, Partial<ThemeSettingItem>>> = {};
    (['default', 'winter', 'christmas', 'newyear2027', 'ramadan'] as StoreThemeId[]).forEach((id) => {
      const existing = db.theme_settings?.[id] || DEFAULT_THEME_SETTINGS[id];
      const incoming = updates?.[id];
      if (incoming && typeof incoming === 'object') {
        const nextItem: Partial<ThemeSettingItem> = { ...existing, id };
        if (typeof incoming.floatingEmojisEnabled === 'boolean') {
          nextItem.floatingEmojisEnabled = incoming.floatingEmojisEnabled;
        }
        if ('floatingEmojis' in incoming) {
          if (Array.isArray(incoming.floatingEmojis) && incoming.floatingEmojis.length > 0) {
            nextItem.floatingEmojis = incoming.floatingEmojis;
          } else {
            delete nextItem.floatingEmojis;
          }
        }
        if (incoming.floatingEmojiDensity) {
          nextItem.floatingEmojiDensity = incoming.floatingEmojiDensity;
        }
        if (incoming.floatingEmojiSpeed) {
          nextItem.floatingEmojiSpeed = incoming.floatingEmojiSpeed;
        }
        merged[id] = nextItem;
      } else {
        merged[id] = existing;
      }
    });
    db.theme_settings = normalizeThemeSettings(merged);
    this.save(db);
    return db.theme_settings;
  }

  getClickAnimations(): Record<StoreThemeId, ClickAnimationConfig> {
    const db = this.load();
    return normalizeClickAnimationsMap(db.click_animations);
  }

  updateClickAnimations(
    animations: Partial<Record<StoreThemeId, Partial<ClickAnimationConfig>>>
  ): Record<StoreThemeId, ClickAnimationConfig> {
    const db = this.load();
    const merged: Partial<Record<StoreThemeId, Partial<ClickAnimationConfig>>> = {};
    (['default', 'winter', 'christmas', 'newyear2027', 'ramadan'] as StoreThemeId[]).forEach((id) => {
      const incoming = animations?.[id];
      if (incoming && typeof incoming === 'object') {
        merged[id] = {
          ...(db.click_animations?.[id] || DEFAULT_CLICK_ANIMATIONS[id]),
          ...incoming,
        };
      } else {
        merged[id] = db.click_animations?.[id] || DEFAULT_CLICK_ANIMATIONS[id];
      }
    });
    db.click_animations = normalizeClickAnimationsMap(merged);
    this.save(db);
    return db.click_animations;
  }

  getGamemodeVisuals(): GamemodeVisualSettings {
    const db = this.load();
    return normalizeGamemodeVisuals(db.gamemode_visuals);
  }

  updateGamemodeVisuals(
    updates: Partial<GamemodeVisualSettings>
  ): GamemodeVisualSettings {
    const db = this.load();
    const existing = normalizeGamemodeVisuals(db.gamemode_visuals);
    const next = normalizeGamemodeVisuals({
      ...existing,
      ...(updates && typeof updates === 'object' ? updates : {}),
    });
    db.gamemode_visuals = next;
    this.save(db);
    return next;
  }
}

export const siteDb = new SiteDatabase();
