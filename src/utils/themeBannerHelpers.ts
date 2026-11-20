import type { StoreThemeId, ThemeSettingItem } from '../types';
import { sanitizeFloatingEmojisForTheme } from './floatingEmojiHelpers';

export const STORE_THEME_IDS: StoreThemeId[] = [
  'default',
  'winter',
  'christmas',
  'newyear2027',
  'ramadan',
];

export const DEFAULT_THEME_SETTINGS: Record<StoreThemeId, ThemeSettingItem> = {
  default: { id: 'default', enabled: true },
  winter: { id: 'winter', enabled: true },
  christmas: { id: 'christmas', enabled: true },
  newyear2027: { id: 'newyear2027', enabled: true },
  ramadan: { id: 'ramadan', enabled: true },
};

const MAX_BANNER_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB
const ALLOWED_BANNER_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);

export function sanitizeBannerUrl(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('data:')) {
    const match = trimmed.match(/^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) return '';
    const mime = match[1].toLowerCase();
    if (!ALLOWED_BANNER_MIME.has(mime)) return '';
    const base64Body = match[2];
    const padding = base64Body.endsWith('==') ? 2 : base64Body.endsWith('=') ? 1 : 0;
    const approxBytes = Math.floor((base64Body.length * 3) / 4) - padding;
    if (approxBytes <= 0 || approxBytes > MAX_BANNER_IMAGE_BYTES) return '';
    return trimmed;
  }

  if (/^https?:\/\/\S+$/i.test(trimmed) || (trimmed.startsWith('/') && !trimmed.startsWith('//'))) {
    return trimmed.slice(0, 2048);
  }

  return '';
}

export function normalizeThemeSettings(
  incoming?: Partial<Record<StoreThemeId, Partial<ThemeSettingItem>>> | null
): Record<StoreThemeId, ThemeSettingItem> {
  const result = {} as Record<StoreThemeId, ThemeSettingItem>;
  for (const id of STORE_THEME_IDS) {
    const base = DEFAULT_THEME_SETTINGS[id];
    const raw = incoming && typeof incoming === 'object' ? incoming[id] : undefined;
    const cleanBanner = sanitizeBannerUrl(raw?.bannerUrl);
    const hasCustomFloating =
      Array.isArray(raw?.floatingEmojis) && raw.floatingEmojis.length > 0;

    result[id] = {
      id,
      enabled: typeof raw?.enabled === 'boolean' ? raw.enabled : base.enabled,
      ...(typeof raw?.isDefault === 'boolean' ? { isDefault: raw.isDefault } : {}),
      ...(typeof raw?.startDate === 'string' && raw.startDate.trim()
        ? { startDate: raw.startDate.trim() }
        : {}),
      ...(typeof raw?.endDate === 'string' && raw.endDate.trim()
        ? { endDate: raw.endDate.trim() }
        : {}),
      ...(cleanBanner ? { bannerUrl: cleanBanner } : {}),
      ...(typeof raw?.floatingEmojisEnabled === 'boolean'
        ? { floatingEmojisEnabled: raw.floatingEmojisEnabled }
        : {}),
      ...(hasCustomFloating
        ? { floatingEmojis: sanitizeFloatingEmojisForTheme(id, raw?.floatingEmojis) }
        : {}),
      ...(raw?.floatingEmojiDensity === 'low' ||
      raw?.floatingEmojiDensity === 'normal' ||
      raw?.floatingEmojiDensity === 'high'
        ? { floatingEmojiDensity: raw.floatingEmojiDensity }
        : {}),
      ...(raw?.floatingEmojiSpeed === 'slow' ||
      raw?.floatingEmojiSpeed === 'normal' ||
      raw?.floatingEmojiSpeed === 'fast'
        ? { floatingEmojiSpeed: raw.floatingEmojiSpeed }
        : {}),
    };
  }
  return result;
}

export function resolveThemeBannerUrl(
  themeId: StoreThemeId | undefined,
  themeSettings: Partial<Record<StoreThemeId, ThemeSettingItem>> | null | undefined,
  fallbackUrl: string
): string {
  const safeId: StoreThemeId =
    themeId && STORE_THEME_IDS.includes(themeId) ? themeId : 'default';
  const candidate = themeSettings?.[safeId]?.bannerUrl;
  const sanitized = sanitizeBannerUrl(candidate);
  return sanitized || fallbackUrl;
}

export function applyBannerToThemeSettings(
  currentSettings: Record<StoreThemeId, ThemeSettingItem>,
  target: StoreThemeId | 'all',
  bannerUrl: string
): Record<StoreThemeId, ThemeSettingItem> {
  const cleaned = sanitizeBannerUrl(bannerUrl);
  const next = normalizeThemeSettings(currentSettings);
  const targetIds = target === 'all' ? STORE_THEME_IDS : [target];

  for (const id of targetIds) {
    const item = { ...next[id] };
    if (cleaned) {
      item.bannerUrl = cleaned;
    } else {
      delete item.bannerUrl;
    }
    next[id] = item;
  }

  return next;
}
