import type { StoreThemeId, ThemeSettingItem } from '../types';

export type FloatingEmojiDensity = 'low' | 'normal' | 'high';
export type FloatingEmojiSpeed = 'slow' | 'normal' | 'fast';

export interface FloatingEmojiPreset {
  id: string;
  label: string;
  emojis: string[];
}

export const FLOATING_THEME_IDS: StoreThemeId[] = [
  'default',
  'winter',
  'christmas',
  'newyear2027',
  'ramadan',
];

export const DEFAULT_FLOATING_EMOJIS: Record<StoreThemeId, string[]> = {
  default: ['✨', '⭐', '💫', '✦', '🪙'],
  winter: ['❄', '❅', '❆', '•', '❄️'],
  christmas: ['❄️', '🎄', '🎁', '⭐', '❅'],
  newyear2027: ['✨', '🎆', '⭐', '🎇', '💫'],
  ramadan: ['🌙', '🪔', '⭐', '✨', '🌟'],
};

export const FLOATING_EMOJI_PRESETS: FloatingEmojiPreset[] = [
  {
    id: 'winter_snow',
    label: 'Winter Snowflakes',
    emojis: ['❄', '❅', '❆', '•', '❄️'],
  },
  {
    id: 'sparkles_stars',
    label: 'Stars & Sparkles',
    emojis: ['✨', '⭐', '💫', '🌟', '✦'],
  },
  {
    id: 'gaming_loot',
    label: 'Diamonds & Coins',
    emojis: ['💎', '🪙', '⚔️', '🏆', '✨'],
  },
  {
    id: 'fire_pvp',
    label: 'Fire & PvP',
    emojis: ['🔥', '⚔️', '💥', '⚡', '❤️'],
  },
  {
    id: 'hearts_love',
    label: 'Lifesteal Hearts',
    emojis: ['❤️', '💖', '💕', '✨', '🌸'],
  },
  {
    id: 'christmas_festive',
    label: 'Christmas Festive',
    emojis: ['❄️', '🎄', '🎁', '⭐', '🔔'],
  },
  {
    id: 'newyear_party',
    label: 'New Year Fireworks',
    emojis: ['✨', '🎆', '🎇', '🎉', '💫'],
  },
  {
    id: 'ramadan_nights',
    label: 'Ramadan Nights',
    emojis: ['🌙', '🪔', '⭐', '✨', '🌟'],
  },
  {
    id: 'cherry_blossom',
    label: 'Cherry Blossoms',
    emojis: ['🌸', '🌺', '🌷', '🦋', '✨'],
  },
  {
    id: 'galaxy_magic',
    label: 'Magic & Galaxy',
    emojis: ['🪄', '✨', '🔮', '💫', '⭐'],
  },
];

const MAX_EMOJI_COUNT = 12;

/**
 * Splits a string or array of emojis cleanly without breaking compound Unicode grapheme clusters (like ❄️ or ❤️).
 */
export function parseFloatingEmojiList(input: string | string[] | null | undefined): string[] {
  if (!input) return [];

  const tokens: string[] = [];

  const pushGraphemes = (chunk: string) => {
    const trimmed = chunk.trim();
    if (!trimmed) return;

    // If user typed space or comma separated items, check whether it's whitespace-delimited words/emojis
    // Split graphemes cleanly using Intl.Segmenter when available
    const SegmenterCtor = (Intl as unknown as { Segmenter?: new (loc?: string, opts?: { granularity: string }) => { segment: (s: string) => Iterable<{ segment: string }> } }).Segmenter;

    if (typeof SegmenterCtor === 'function') {
      const segmenter = new SegmenterCtor('en', { granularity: 'grapheme' });
      for (const seg of segmenter.segment(trimmed)) {
        const val = seg.segment.trim();
        if (val && val !== ',' && val !== '|' && val !== '/') {
          tokens.push(val.slice(0, 8));
        }
      }
    } else {
      for (const ch of Array.from(trimmed)) {
        const val = ch.trim();
        if (val && val !== ',' && val !== '|' && val !== '/') {
          tokens.push(val.slice(0, 8));
        }
      }
    }
  };

  if (Array.isArray(input)) {
    for (const item of input) {
      if (typeof item === 'string') {
        const clean = item.trim();
        if (clean) {
          // If array element itself contains multiple emojis pasted together, segment it; otherwise keep single grapheme
          pushGraphemes(clean);
        }
      }
    }
  } else if (typeof input === 'string') {
    const parts = input.split(/[\s,|]+/);
    for (const part of parts) {
      pushGraphemes(part);
    }
  }

  // Deduplicate while preserving order, max 12 emojis
  const deduped: string[] = [];
  for (const t of tokens) {
    if (!deduped.includes(t)) {
      deduped.push(t);
    }
    if (deduped.length >= MAX_EMOJI_COUNT) break;
  }
  return deduped;
}

export function sanitizeFloatingEmojisForTheme(
  themeId: StoreThemeId,
  emojis?: string[] | string | null
): string[] {
  const parsed = parseFloatingEmojiList(emojis);
  if (parsed.length > 0) return parsed;
  return [...(DEFAULT_FLOATING_EMOJIS[themeId] || DEFAULT_FLOATING_EMOJIS.default)];
}

export interface ResolvedFloatingEmojiConfig {
  enabled: boolean;
  emojis: string[];
  density: FloatingEmojiDensity;
  speed: FloatingEmojiSpeed;
  particleCount: number;
  durationMultiplier: number;
}

export function resolveFloatingEmojiConfig(
  themeId: StoreThemeId | undefined,
  themeSettings: Partial<Record<StoreThemeId, ThemeSettingItem>> | null | undefined
): ResolvedFloatingEmojiConfig {
  const safeId: StoreThemeId =
    themeId && FLOATING_THEME_IDS.includes(themeId) ? themeId : 'default';
  const item = themeSettings?.[safeId];

  const enabled = typeof item?.floatingEmojisEnabled === 'boolean' ? item.floatingEmojisEnabled : true;
  const emojis = sanitizeFloatingEmojisForTheme(safeId, item?.floatingEmojis);
  const density: FloatingEmojiDensity =
    item?.floatingEmojiDensity === 'low' ||
    item?.floatingEmojiDensity === 'normal' ||
    item?.floatingEmojiDensity === 'high'
      ? item.floatingEmojiDensity
      : 'normal';
  const speed: FloatingEmojiSpeed =
    item?.floatingEmojiSpeed === 'slow' ||
    item?.floatingEmojiSpeed === 'normal' ||
    item?.floatingEmojiSpeed === 'fast'
      ? item.floatingEmojiSpeed
      : 'normal';

  const particleCount = density === 'low' ? 14 : density === 'high' ? 44 : 28;
  const durationMultiplier = speed === 'slow' ? 1.45 : speed === 'fast' ? 0.65 : 1.0;

  return {
    enabled,
    emojis,
    density,
    speed,
    particleCount,
    durationMultiplier,
  };
}

export function applyFloatingEmojisToThemeSettings(
  currentSettings: Record<StoreThemeId, ThemeSettingItem>,
  target: StoreThemeId | 'all',
  update: {
    floatingEmojisEnabled?: boolean;
    floatingEmojis?: string[];
    floatingEmojiDensity?: FloatingEmojiDensity;
    floatingEmojiSpeed?: FloatingEmojiSpeed;
  }
): Record<StoreThemeId, ThemeSettingItem> {
  const next = { ...currentSettings };
  const targetIds = target === 'all' ? FLOATING_THEME_IDS : [target];

  for (const id of targetIds) {
    const existing = next[id] || { id, enabled: true };
    const cleanEmojis =
      update.floatingEmojis !== undefined
        ? sanitizeFloatingEmojisForTheme(id, update.floatingEmojis)
        : existing.floatingEmojis;

    next[id] = {
      ...existing,
      id,
      ...(typeof update.floatingEmojisEnabled === 'boolean'
        ? { floatingEmojisEnabled: update.floatingEmojisEnabled }
        : {}),
      ...(cleanEmojis ? { floatingEmojis: cleanEmojis } : {}),
      ...(update.floatingEmojiDensity ? { floatingEmojiDensity: update.floatingEmojiDensity } : {}),
      ...(update.floatingEmojiSpeed ? { floatingEmojiSpeed: update.floatingEmojiSpeed } : {}),
    };
  }

  return next;
}

export function getFloatingEmojisSummary(
  themeSettings: Partial<Record<StoreThemeId, ThemeSettingItem>> | null | undefined
): {
  total: number;
  enabledCount: number;
  allEnabled: boolean;
  allDisabled: boolean;
} {
  const total = FLOATING_THEME_IDS.length;
  const enabledCount = FLOATING_THEME_IDS.filter((id) => {
    const val = themeSettings?.[id]?.floatingEmojisEnabled;
    return typeof val === 'boolean' ? val : true;
  }).length;
  return {
    total,
    enabledCount,
    allEnabled: enabledCount === total,
    allDisabled: enabledCount === 0,
  };
}
