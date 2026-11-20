import type { GamemodeIconType, GamemodeVisualSettings } from '../types';
import { sanitizeBannerUrl } from './themeBannerHelpers';

export const DEFAULT_GAMEMODE_VISUALS: GamemodeVisualSettings = {
  lifestealBgUrl: '',
  practiceBgUrl: '',
  lifestealIconType: 'default',
  lifestealIconValue: '',
  practiceIconType: 'default',
  practiceIconValue: '',
};

export const LIFESTEAL_ICON_PRESETS: { label: string; emoji: string }[] = [
  { label: 'Blazing Heart', emoji: '❤️‍🔥' },
  { label: 'Blood Drop', emoji: '🩸' },
  { label: 'Pink Heart', emoji: '💖' },
  { label: 'Purple Heart', emoji: '💜' },
  { label: 'Skull', emoji: '💀' },
  { label: 'Crown', emoji: '👑' },
  { label: 'Diamond', emoji: '💎' },
  { label: 'Crystal', emoji: '🔮' },
];

export const PRACTICE_ICON_PRESETS: { label: string; emoji: string }[] = [
  { label: 'Crossed Swords', emoji: '⚔️' },
  { label: 'Dagger', emoji: '🗡️' },
  { label: 'Battle Axe', emoji: '🪓' },
  { label: 'Shield', emoji: '🛡️' },
  { label: 'Bow', emoji: '🏹' },
  { label: 'Lightning', emoji: '⚡' },
  { label: 'Fire', emoji: '🔥' },
  { label: 'Trophy', emoji: '🏆' },
];

/**
 * Extracts at most 2 clean grapheme clusters from custom icon emoji input.
 */
export function sanitizeIconEmoji(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const SegmenterCtor = (
    Intl as unknown as {
      Segmenter?: new (
        loc?: string,
        opts?: { granularity: string }
      ) => { segment: (s: string) => Iterable<{ segment: string }> };
    }
  ).Segmenter;

  if (typeof SegmenterCtor === 'function') {
    const segs = Array.from(new SegmenterCtor('en', { granularity: 'grapheme' }).segment(trimmed))
      .map((s) => s.segment.trim())
      .filter(Boolean);
    return segs.slice(0, 2).join('');
  }

  return Array.from(trimmed.replace(/\s+/g, '')).slice(0, 2).join('');
}

function normalizeIconPair(
  rawType: unknown,
  rawValue: unknown
): { iconType: GamemodeIconType; iconValue: string } {
  if (rawType === 'image') {
    const cleanUrl = sanitizeBannerUrl(typeof rawValue === 'string' ? rawValue : '');
    if (cleanUrl) {
      return { iconType: 'image', iconValue: cleanUrl };
    }
    return { iconType: 'default', iconValue: '' };
  }

  if (rawType === 'emoji') {
    const cleanEmoji = sanitizeIconEmoji(rawValue);
    if (cleanEmoji) {
      return { iconType: 'emoji', iconValue: cleanEmoji };
    }
    return { iconType: 'default', iconValue: '' };
  }

  return { iconType: 'default', iconValue: '' };
}

export function normalizeGamemodeVisuals(
  input?: Partial<GamemodeVisualSettings> | null
): GamemodeVisualSettings {
  if (!input || typeof input !== 'object') {
    return { ...DEFAULT_GAMEMODE_VISUALS };
  }

  const lifestealBgUrl = sanitizeBannerUrl(input.lifestealBgUrl || '');
  const practiceBgUrl = sanitizeBannerUrl(input.practiceBgUrl || '');
  const lifestealIcon = normalizeIconPair(input.lifestealIconType, input.lifestealIconValue);
  const practiceIcon = normalizeIconPair(input.practiceIconType, input.practiceIconValue);

  return {
    lifestealBgUrl,
    practiceBgUrl,
    lifestealIconType: lifestealIcon.iconType,
    lifestealIconValue: lifestealIcon.iconValue,
    practiceIconType: practiceIcon.iconType,
    practiceIconValue: practiceIcon.iconValue,
  };
}

export function resolveGamemodeCardVisual(
  mode: 'lifesteal' | 'practice',
  visuals: Partial<GamemodeVisualSettings> | null | undefined,
  defaultBgUrl: string
): {
  bgUrl: string;
  isCustomBg: boolean;
  iconType: GamemodeIconType;
  iconValue: string;
  isCustomIcon: boolean;
} {
  const normalized = normalizeGamemodeVisuals(visuals);
  if (mode === 'lifesteal') {
    return {
      bgUrl: normalized.lifestealBgUrl || defaultBgUrl,
      isCustomBg: Boolean(normalized.lifestealBgUrl),
      iconType: normalized.lifestealIconType,
      iconValue: normalized.lifestealIconValue,
      isCustomIcon: normalized.lifestealIconType !== 'default',
    };
  }

  return {
    bgUrl: normalized.practiceBgUrl || defaultBgUrl,
    isCustomBg: Boolean(normalized.practiceBgUrl),
    iconType: normalized.practiceIconType,
    iconValue: normalized.practiceIconValue,
    isCustomIcon: normalized.practiceIconType !== 'default',
  };
}
