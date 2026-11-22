import fs from 'fs';
import path from 'path';
import { getSupabaseAdmin } from './supabaseAdmin';
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

  /**
   * Hydrate the cache from Supabase (source of truth). Falls back to local JSON
   * on failure. Called once at server startup so every instance serves the
   * same central data and data survives restarts / redeployments.
   */
  public async hydrateFromSupabase(): Promise<void> {
    const admin = getSupabaseAdmin();
    if (!admin) return;
    try {
      const [catsRes, themesRes, clicksRes, gamemodeRes] = await Promise.all([
        admin.from('store_categories').select('*'),
        admin.from('theme_settings').select('*'),
        admin.from('click_animations').select('*'),
        admin.from('gamemode_visuals').select('*'),
      ]);
      const firstError = [catsRes, themesRes, clicksRes, gamemodeRes].find((r) => r.error);
      if (firstError?.error) throw firstError.error;

      // Only hydrate if Supabase actually has data (avoid wiping good local
      // defaults on a freshly created empty project before migration).
      const hasData =
        (catsRes.data?.length || 0) > 0 ||
        (themesRes.data?.length || 0) > 0 ||
        (clicksRes.data?.length || 0) > 0 ||
        (gamemodeRes.data?.length || 0) > 0;
      if (!hasData) return;

      const themeSettings: Record<string, any> = {};
      for (const row of themesRes.data || []) {
        themeSettings[row.id] = {
          id: row.id,
          enabled: row.enabled,
          isDefault: row.is_default,
          startDate: row.start_date,
          endDate: row.end_date,
          bannerUrl: row.banner_url,
          floatingEmojisEnabled: row.floating_emojis_enabled,
          floatingEmojis: row.floating_emojis,
          floatingEmojiDensity: row.floating_emoji_density,
          floatingEmojiSpeed: row.floating_emoji_speed,
        };
      }
      const clickAnimations: Record<string, any> = {};
      for (const row of clicksRes.data || []) {
        clickAnimations[row.theme_id] = row.config;
      }
      const gamemode = (gamemodeRes.data || [])[0];

      this.cache = {
        store_categories: (catsRes.data || []).map((c: any) => ({
          id: c.id,
          name: c.name,
          game_mode: c.game_mode,
          description: c.description,
          image_url: c.image_url,
          icon: c.icon,
          enabled: c.enabled,
          display_order: c.display_order,
          theme: c.theme,
        })),
        theme_settings: normalizeThemeSettings(themeSettings),
        click_animations: normalizeClickAnimationsMap(clickAnimations),
        gamemode_visuals: gamemode ? normalizeGamemodeVisuals(gamemode.settings) : normalizeGamemodeVisuals(DEFAULT_GAMEMODE_VISUALS),
      } as SiteDbSchema;
    } catch (err: any) {
      console.error('[siteDb] Supabase hydration failed, using local JSON:', err?.message || String(err));
    }
  }

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
    this.cache = data;
    // Persist to Supabase (primary)
    const admin = getSupabaseAdmin();
    if (admin) {
      // Categories
      admin.from('store_categories').upsert(
        data.store_categories.map((c) => ({
          id: c.id,
          name: c.name,
          game_mode: c.game_mode,
          description: c.description,
          image_url: c.image_url,
          icon: c.icon,
          enabled: c.enabled ?? true,
          display_order: c.display_order ?? 0,
          theme: c.theme ?? 'auto',
        })),
        { onConflict: 'id' }
      ).then(({ error }) => {
        if (error) console.error('[siteDb] categories upsert error', error.message);
      });

      // Theme settings
      const themeRows = Object.entries(data.theme_settings).map(([id, t]) => ({
        id,
        enabled: t.enabled,
        is_default: t.isDefault ?? false,
        start_date: t.startDate,
        end_date: t.endDate,
        banner_url: t.bannerUrl,
        floating_emojis_enabled: t.floatingEmojisEnabled,
        floating_emojis: t.floatingEmojis ?? [],
        floating_emoji_density: t.floatingEmojiDensity,
        floating_emoji_speed: t.floatingEmojiSpeed,
      }));
      admin.from('theme_settings').upsert(themeRows, { onConflict: 'id' }).then(({ error }) => {
        if (error) console.error('[siteDb] themes upsert error', error.message);
      });

      // Click animations
      const clickRows = Object.entries(data.click_animations).map(([theme_id, config]) => ({
        theme_id,
        config,
      }));
      admin.from('click_animations').upsert(clickRows, { onConflict: 'theme_id' }).then(({ error }) => {
        if (error) console.error('[siteDb] click upsert error', error.message);
      });

      // Gamemode visuals
      if (data.gamemode_visuals) {
        admin.from('gamemode_visuals').upsert(
          { id: 'default', settings: data.gamemode_visuals },
          { onConflict: 'id' }
        ).then(({ error }) => {
          if (error) console.error('[siteDb] gamemode upsert error', error.message);
        });
      }
    }

    // Keep local JSON as emergency fallback only
    try {
      ensureDataDir();
      const tmp = `${SITE_DB_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tmp, SITE_DB_FILE);
    } catch {
      // ignore local write failures
    }
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
