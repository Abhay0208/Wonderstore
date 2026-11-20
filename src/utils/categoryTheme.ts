import { CategoryThemeOption, StoreThemeId } from '../types';

export const DEFAULT_STORE_THEME: StoreThemeId = 'default';

export interface ThemeMeta {
  id: StoreThemeId;
  label: string;
  shortLabel: string;
  emoji: string;
  tagline: string;
  description: string;
  couponHeading: string;
  footerGreeting: string;
  palette: [string, string, string];
  highlights: string[];
  previewImagePath: string;
}

export const STORE_THEMES: Record<StoreThemeId, ThemeMeta> = {
  default: {
    id: 'default',
    label: 'Default Theme',
    shortLabel: 'Default',
    emoji: '🎮',
    tagline: 'Classic WonderMC Dark Gaming & Sparkles',
    description: 'Our signature dark gaming theme with smooth gradients & dynamic sparkle effects.',
    couponHeading: '⚡ Festive WonderMC Promo Coupons 🎁',
    footerGreeting: 'Happy Gaming Season 🎮',
    palette: ['#38bdf8', '#0284c7', '#090d16'],
    highlights: [
      'Classic WonderMC dark gaming aesthetic',
      'Smooth gradients & dynamic sparkle effects',
      'Optimized high-performance animations',
    ],
    previewImagePath: '/src/assets/images/theme_preview_default_1794741339580.jpg',
  },
  winter: {
    id: 'winter',
    label: 'Winter Theme',
    shortLabel: 'Winter',
    emoji: '❄️',
    tagline: 'Ice Blue, White & Deep Arctic Navy',
    description: 'Premium winter atmosphere with snowfall, frosted glass UI & ice blue cards.',
    couponHeading: '❄️ Festive Winter Promo Coupons 🎁',
    footerGreeting: 'Happy Winter Season ❄️',
    palette: ['#38bdf8', '#e0f2fe', '#071224'],
    highlights: [
      'Continuous snowfall animation',
      'Frosted glass panels & arctic moon',
      'Ice blue, crisp white & dark blue UI',
    ],
    previewImagePath: '/src/assets/images/theme_preview_winter_1794541294807.jpg',
  },
  christmas: {
    id: 'christmas',
    label: 'Christmas Theme',
    shortLabel: 'Christmas',
    emoji: '🎄',
    tagline: 'Festive Red, Evergreen & Warm Gold',
    description: 'Festive holiday atmosphere with Christmas trees, subtle snow & warm gold cards.',
    couponHeading: '🎄 Christmas Holiday Promo Coupons 🎁',
    footerGreeting: 'Merry Christmas & Happy Holidays 🎄',
    palette: ['#dc2626', '#15803d', '#fbbf24'],
    highlights: [
      'Subtle snowfall & floating tree ornaments',
      'Crimson, evergreen & warm gold palette',
      'Festive holiday buttons & glowing borders',
    ],
    previewImagePath: '/src/assets/images/theme_preview_christmas_1794541296524.jpg',
  },
  newyear2027: {
    id: 'newyear2027',
    label: 'New Year 2027 Theme',
    shortLabel: 'New Year 2027',
    emoji: '🎆',
    tagline: 'Midnight Black, Radiant Gold & Royal Purple',
    description: 'Grand 2027 celebration design with animated fireworks, glowing gold accents & purple aura.',
    couponHeading: '🎆 New Year 2027 Celebration Coupons ✨',
    footerGreeting: 'Happy New Year 2027 🎆',
    palette: ['#090617', '#f59e0b', '#7c3aed'],
    highlights: [
      'Animated midnight firework bursts',
      'Obsidian black, gold & royal purple UI',
      '2027 celebration glow across cards & nav',
    ],
    previewImagePath: '/src/assets/images/theme_preview_newyear_2027_1794541296316.jpg',
  },
  ramadan: {
    id: 'ramadan',
    label: 'Ramadan Theme',
    shortLabel: 'Ramadan',
    emoji: '🌙',
    tagline: 'Deep Emerald Green, Radiant Gold & Crescent Moon',
    description: 'Premium Ramadan atmosphere with hanging lanterns, crescent moons & golden geometry.',
    couponHeading: '🌙 Ramadan Kareem Promo Coupons 🪔',
    footerGreeting: 'Ramadan Kareem 🌙',
    palette: ['#10b981', '#fbbf24', '#061a12'],
    highlights: [
      'Hanging lanterns & crescent moons',
      'Deep emerald green & radiant gold palette',
      'Islamic geometric patterns & subtle glowing stars',
    ],
    previewImagePath: '/src/assets/images/theme_preview_ramadan_1794741317519.jpg',
  },
};

export const STORE_THEME_LIST: ThemeMeta[] = [
  STORE_THEMES.default,
  STORE_THEMES.winter,
  STORE_THEMES.christmas,
  STORE_THEMES.newyear2027,
  STORE_THEMES.ramadan,
];

export function isValidStoreTheme(value: unknown): value is StoreThemeId {
  return (
    value === 'default' ||
    value === 'winter' ||
    value === 'christmas' ||
    value === 'newyear2027' ||
    value === 'ramadan'
  );
}

export function resolveCategoryTheme(
  categoryTheme: CategoryThemeOption | undefined,
  storeTheme: StoreThemeId | undefined
): StoreThemeId {
  if (categoryTheme && categoryTheme !== 'auto' && isValidStoreTheme(categoryTheme)) {
    return categoryTheme;
  }
  return isValidStoreTheme(storeTheme) ? storeTheme : DEFAULT_STORE_THEME;
}

export function getCategoryTileClasses(
  categoryTheme: CategoryThemeOption | undefined,
  storeTheme: StoreThemeId | undefined,
  index: number
): string {
  const safeIndex = Number.isFinite(index) && index >= 0 ? Math.floor(index) : 0;
  const tileNumber = (safeIndex % 6) + 1;
  const resolved = resolveCategoryTheme(categoryTheme, storeTheme);
  return `cat-tile cat-tile-${tileNumber} cat-theme-${resolved}`;
}

export function getThemeMeta(theme: StoreThemeId | undefined): ThemeMeta {
  return isValidStoreTheme(theme) ? STORE_THEMES[theme] : STORE_THEMES[DEFAULT_STORE_THEME];
}

export interface ThemeCardEffectConfig {
  id: StoreThemeId;
  primaryEmoji: string;
  secondaryEmojis: string[];
  effectLabel: string;
  clickCelebrationText: string;
  glowClassName: string;
  accentHex: string;
  secondaryGlowHex: string;
  iconAnimationClass: string;
}

export const THEME_CARD_EFFECTS: Record<StoreThemeId, ThemeCardEffectConfig> = {
  default: {
    id: 'default',
    primaryEmoji: '✨',
    secondaryEmojis: ['✨', '⭐', '💫'],
    effectLabel: 'Sparkle & Glow',
    clickCelebrationText: 'WONDERMC ✨',
    glowClassName: 'theme-card-selected-default',
    accentHex: '#38bdf8',
    secondaryGlowHex: '#0284c7',
    iconAnimationClass: 'theme-emoji-default',
  },
  winter: {
    id: 'winter',
    primaryEmoji: '❄️',
    secondaryEmojis: ['❄️', '❅', '❆'],
    effectLabel: 'Snowfall & Ice Shimmer',
    clickCelebrationText: 'FROST ACTIVE ❄️',
    glowClassName: 'theme-card-selected-winter',
    accentHex: '#38bdf8',
    secondaryGlowHex: '#e0f2fe',
    iconAnimationClass: 'theme-emoji-winter',
  },
  christmas: {
    id: 'christmas',
    primaryEmoji: '🎄',
    secondaryEmojis: ['✨', '🎁', '🎄'],
    effectLabel: 'Twinkling Lights & Gifts',
    clickCelebrationText: 'HOLIDAY CHEER 🎁',
    glowClassName: 'theme-card-selected-christmas',
    accentHex: '#ef4444',
    secondaryGlowHex: '#22c55e',
    iconAnimationClass: 'theme-emoji-christmas',
  },
  newyear2027: {
    id: 'newyear2027',
    primaryEmoji: '🎆',
    secondaryEmojis: ['🎆', '✨', '🎇'],
    effectLabel: '2027 Fireworks Burst',
    clickCelebrationText: '2027',
    glowClassName: 'theme-card-selected-newyear2027',
    accentHex: '#fbbf24',
    secondaryGlowHex: '#a855f7',
    iconAnimationClass: 'theme-emoji-newyear2027',
  },
  ramadan: {
    id: 'ramadan',
    primaryEmoji: '🪔',
    secondaryEmojis: ['🪔', '🌙', '⭐'],
    effectLabel: 'Lantern & Crescent Moon',
    clickCelebrationText: 'RAMADAN KAREEM 🌙',
    glowClassName: 'theme-card-selected-ramadan',
    accentHex: '#fbbf24',
    secondaryGlowHex: '#10b981',
    iconAnimationClass: 'theme-emoji-ramadan',
  },
};

export function getThemeCardEffectConfig(theme: StoreThemeId | undefined): ThemeCardEffectConfig {
  return isValidStoreTheme(theme) ? THEME_CARD_EFFECTS[theme] : THEME_CARD_EFFECTS[DEFAULT_STORE_THEME];
}

