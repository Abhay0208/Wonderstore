import type { StoreThemeId } from '../types';

export interface ClickAnimationConfig {
  enabled: boolean;
  animationType: string;
  emoji: string;
  count: number;
  size: 'small' | 'medium' | 'large';
  speed: 'slow' | 'normal' | 'fast';
  direction: 'up' | 'burst' | 'down';
  rotation: boolean;
  fade: boolean;
  duration: number;
}

export interface ClickPresetOption {
  id: string;
  label: string;
  emoji: string;
  symmetricalSpin: boolean;
  glowColor: string;
  ringColor: string;
  companions: string[];
}

export const ANIMATION_PRESETS: ClickPresetOption[] = [
  {
    id: 'sparkle',
    label: 'Sparkle Animation',
    emoji: '✨',
    symmetricalSpin: false,
    glowColor: 'rgba(52, 211, 153, 0.88)',
    ringColor: 'rgba(56, 189, 248, 0.58)',
    companions: ['✨', '💫', '⭐'],
  },
  {
    id: 'crescent_moon',
    label: 'Crescent Moon Animation',
    emoji: '🌙',
    symmetricalSpin: false,
    glowColor: 'rgba(251, 191, 36, 0.94)',
    ringColor: 'rgba(16, 185, 129, 0.65)',
    companions: ['✨', '⭐', '💫'],
  },
  {
    id: 'star',
    label: 'Star Animation',
    emoji: '⭐',
    symmetricalSpin: true,
    glowColor: 'rgba(250, 204, 21, 0.92)',
    ringColor: 'rgba(253, 224, 71, 0.55)',
    companions: ['✨', '🌟', '💫'],
  },
  {
    id: 'christmas_tree',
    label: 'Christmas Tree Animation',
    emoji: '🎄',
    symmetricalSpin: false,
    glowColor: 'rgba(34, 197, 94, 0.9)',
    ringColor: 'rgba(239, 68, 68, 0.58)',
    companions: ['✨', '❄️', '⭐'],
  },
  {
    id: 'snowflake',
    label: 'Snowflake Animation',
    emoji: '❄️',
    symmetricalSpin: true,
    glowColor: 'rgba(125, 211, 252, 0.95)',
    ringColor: 'rgba(186, 230, 253, 0.65)',
    companions: ['❄️', '❅', '❄️'],
  },
  {
    id: 'gift',
    label: 'Gift Animation',
    emoji: '🎁',
    symmetricalSpin: false,
    glowColor: 'rgba(248, 113, 113, 0.9)',
    ringColor: 'rgba(34, 197, 94, 0.64)',
    companions: ['✨', '⭐', '🎄'],
  },
  {
    id: 'fireworks',
    label: 'Fireworks Animation',
    emoji: '🎆',
    symmetricalSpin: false,
    glowColor: 'rgba(251, 191, 36, 0.95)',
    ringColor: 'rgba(168, 85, 247, 0.68)',
    companions: ['✨', '🌟', '💫'],
  },
  {
    id: 'ramadan_lantern',
    label: 'Ramadan Lantern Animation',
    emoji: '🪔',
    symmetricalSpin: false,
    glowColor: 'rgba(251, 191, 36, 0.92)',
    ringColor: 'rgba(16, 185, 129, 0.58)',
    companions: ['✨', '🌙', '⭐'],
  },
  {
    id: 'golden_star',
    label: 'Golden Star Animation',
    emoji: '🌟',
    symmetricalSpin: true,
    glowColor: 'rgba(253, 224, 71, 0.95)',
    ringColor: 'rgba(245, 158, 11, 0.62)',
    companions: ['✨', '⭐', '💫'],
  },
  {
    id: 'heart',
    label: 'Heart Animation',
    emoji: '❤️',
    symmetricalSpin: false,
    glowColor: 'rgba(244, 63, 94, 0.9)',
    ringColor: 'rgba(251, 113, 133, 0.58)',
    companions: ['💖', '✨', '💕'],
  },
  {
    id: 'diamond',
    label: 'Diamond Animation',
    emoji: '💎',
    symmetricalSpin: false,
    glowColor: 'rgba(56, 189, 248, 0.94)',
    ringColor: 'rgba(16, 185, 129, 0.65)',
    companions: ['✨', '💠', '💫'],
  },
  {
    id: 'coin',
    label: 'Coin Animation',
    emoji: '🪙',
    symmetricalSpin: false,
    glowColor: 'rgba(245, 158, 11, 0.94)',
    ringColor: 'rgba(253, 224, 71, 0.58)',
    companions: ['✨', '⭐', '💫'],
  },
  {
    id: 'celebration',
    label: 'Celebration Animation',
    emoji: '🎉',
    symmetricalSpin: false,
    glowColor: 'rgba(251, 191, 36, 0.95)',
    ringColor: 'rgba(168, 85, 247, 0.72)',
    companions: ['✨', '🌟', '🎊'],
  },
  {
    id: 'fire',
    label: 'Fire Animation',
    emoji: '🔥',
    symmetricalSpin: false,
    glowColor: 'rgba(249, 115, 22, 0.92)',
    ringColor: 'rgba(239, 68, 68, 0.58)',
    companions: ['✨', '💥', '🔥'],
  },
  {
    id: 'magic_wand',
    label: 'Magic Wand Animation',
    emoji: '🪄',
    symmetricalSpin: false,
    glowColor: 'rgba(192, 132, 252, 0.92)',
    ringColor: 'rgba(236, 72, 153, 0.58)',
    companions: ['✨', '💫', '⭐'],
  },
];

export const DEFAULT_CLICK_CONFIGS: Record<StoreThemeId, ClickAnimationConfig> = {
  default: {
    enabled: true,
    animationType: 'diamond',
    emoji: '💎',
    count: 5,
    size: 'medium',
    speed: 'normal',
    direction: 'burst',
    rotation: false,
    fade: true,
    duration: 720,
  },
  winter: {
    enabled: true,
    animationType: 'snowflake',
    emoji: '❄️',
    count: 6,
    size: 'medium',
    speed: 'normal',
    direction: 'burst',
    rotation: true,
    fade: true,
    duration: 650,
  },
  christmas: {
    enabled: true,
    animationType: 'gift',
    emoji: '🎁',
    count: 5,
    size: 'medium',
    speed: 'normal',
    direction: 'burst',
    rotation: false,
    fade: true,
    duration: 750,
  },
  newyear2027: {
    enabled: true,
    animationType: 'celebration',
    emoji: '🎉',
    count: 6,
    size: 'medium',
    speed: 'fast',
    direction: 'burst',
    rotation: false,
    fade: true,
    duration: 780,
  },
  ramadan: {
    enabled: true,
    animationType: 'crescent_moon',
    emoji: '🌙',
    count: 5,
    size: 'medium',
    speed: 'normal',
    direction: 'burst',
    rotation: false,
    fade: true,
    duration: 820,
  },
};

export interface ResolvedClickVisualStyle {
  glowColor: string;
  ringColor: string;
  companions: string[];
  symmetricalSpin: boolean;
  showFireworkRing: boolean;
}

export function getClickVisualStyle(
  config: Pick<ClickAnimationConfig, 'animationType' | 'emoji'>,
  themeId: StoreThemeId
): ResolvedClickVisualStyle {
  const preset =
    ANIMATION_PRESETS.find((p) => p.id === config.animationType) ||
    ANIMATION_PRESETS.find((p) => p.emoji === config.emoji);

  const isSnowflake = config.animationType === 'snowflake' || config.emoji === '❄️';
  const showFireworkRing =
    config.animationType === 'celebration' ||
    config.animationType === 'fireworks' ||
    (themeId === 'newyear2027' && !isSnowflake);

  if (preset) {
    return {
      glowColor: preset.glowColor,
      ringColor: preset.ringColor,
      companions: preset.companions,
      symmetricalSpin: preset.symmetricalSpin,
      showFireworkRing,
    };
  }

  // Fallback for custom emoji
  const themeRing: Record<StoreThemeId, string> = {
    default: 'rgba(16, 185, 129, 0.55)',
    winter: 'rgba(125, 211, 252, 0.65)',
    christmas: 'rgba(239, 68, 68, 0.55)',
    newyear2027: 'rgba(168, 85, 247, 0.65)',
    ramadan: 'rgba(251, 191, 36, 0.65)',
  };

  return {
    glowColor: themeRing[themeId] || 'rgba(56, 189, 248, 0.75)',
    ringColor: themeRing[themeId] || 'rgba(56, 189, 248, 0.55)',
    companions: ['✨', '💫', config.emoji || '✨'],
    symmetricalSpin: false,
    showFireworkRing,
  };
}

export interface GeneratedClickParticle {
  id: string;
  emoji: string;
  dx: number;
  dy: number;
  midRotate: number;
  rotate: number;
  sizePx: number;
  delayMs: number;
}

export function generateClickParticles(
  config: ClickAnimationConfig,
  themeId: StoreThemeId,
  randomFn: () => number = Math.random
): GeneratedClickParticle[] {
  const count = Math.max(1, Math.min(8, Number(config.count) || 5));
  const speedMult = config.speed === 'slow' ? 0.8 : config.speed === 'fast' ? 1.28 : 1.0;
  const baseHeroPx = config.size === 'small' ? 20 : config.size === 'large' ? 34 : 26;
  const style = getClickVisualStyle(config, themeId);

  const isWinterSnowflake = config.animationType === 'snowflake' || config.emoji === '❄️';
  const baseAngleOffset = randomFn() * Math.PI * 2;

  return Array.from({ length: count }).map((_, idx) => {
    // Evenly distribute particles around a spacious ring or fountain arc so they frame the hero cleanly
    const angleFraction = (idx / count) * Math.PI * 2 + (randomFn() - 0.5) * 0.25 + baseAngleOffset;
    const radialDist = (isWinterSnowflake ? 32 + randomFn() * 20 : 44 + randomFn() * 18) * speedMult;

    let dx = Math.cos(angleFraction) * radialDist;
    let dy = Math.sin(angleFraction) * radialDist;

    if (config.direction === 'up') {
      // Wide celestial upward arc fanning away from the hero emoji
      const arcAngle = -Math.PI * 0.85 + (count === 1 ? 0.5 : idx / (count - 1)) * (Math.PI * 0.7);
      const arcDist = (48 + randomFn() * 20) * speedMult;
      dx = Math.cos(arcAngle) * arcDist;
      dy = Math.sin(arcAngle) * arcDist;
    } else if (config.direction === 'down') {
      // Wide downward arc
      const arcAngle = Math.PI * 0.15 + (count === 1 ? 0.5 : idx / (count - 1)) * (Math.PI * 0.7);
      const arcDist = (46 + randomFn() * 18) * speedMult;
      dx = Math.cos(arcAngle) * arcDist;
      dy = Math.sin(arcAngle) * arcDist;
    }

    // Symmetrical snowflakes look crisp rotating full turns; asymmetric emojis gently tilt instead of flipping upside down
    let rotate = 0;
    let midRotate = 0;
    if (config.rotation) {
      if (style.symmetricalSpin) {
        rotate = Math.round(180 + randomFn() * 180);
        midRotate = Math.round(rotate * 0.5);
      } else {
        rotate = (idx % 2 === 0 ? 1 : -1) * Math.round(12 + randomFn() * 14);
        midRotate = Math.round(rotate * 0.5);
      }
    } else if (!isWinterSnowflake) {
      rotate = (idx % 2 === 0 ? 1 : -1) * Math.round(6 + randomFn() * 8);
      midRotate = Math.round(rotate * 0.5);
    }

    // Hero vs delicate companion particles (Winter keeps all crisp snowflakes as user loves)
    const particleEmoji = isWinterSnowflake
      ? config.emoji || '❄️'
      : style.companions[idx % style.companions.length];

    const sizeFactor = isWinterSnowflake
      ? 0.78 + randomFn() * 0.16
      : 0.56 + randomFn() * 0.14;

    return {
      id: `p-${idx}-${Math.floor(randomFn() * 100000)}`,
      emoji: particleEmoji,
      dx: Math.round(dx * 10) / 10,
      dy: Math.round(dy * 10) / 10,
      midRotate,
      rotate,
      sizePx: Math.max(12, Math.round(baseHeroPx * sizeFactor)),
      delayMs: 0,
    };
  });
}

const CLICK_THEME_IDS: StoreThemeId[] = [
  'default',
  'winter',
  'christmas',
  'newyear2027',
  'ramadan',
];

export function normalizeClickAnimationsMap(
  incoming?: Partial<Record<StoreThemeId, Partial<ClickAnimationConfig>>> | null
): Record<StoreThemeId, ClickAnimationConfig> {
  const normalized = {} as Record<StoreThemeId, ClickAnimationConfig>;
  for (const id of CLICK_THEME_IDS) {
    const def = DEFAULT_CLICK_CONFIGS[id];
    const raw = incoming && typeof incoming === 'object' ? incoming[id] : undefined;
    const rawCount = Number(raw?.count);
    const rawDuration = Number(raw?.duration);
    normalized[id] = {
      enabled: typeof raw?.enabled === 'boolean' ? raw.enabled : def.enabled,
      animationType:
        typeof raw?.animationType === 'string' && raw.animationType.trim()
          ? raw.animationType.trim().slice(0, 40)
          : def.animationType,
      emoji:
        typeof raw?.emoji === 'string' && raw.emoji.trim()
          ? raw.emoji.trim().slice(0, 8)
          : def.emoji,
      count: Number.isFinite(rawCount) ? Math.max(1, Math.min(8, Math.round(rawCount))) : def.count,
      size:
        raw?.size === 'small' || raw?.size === 'medium' || raw?.size === 'large'
          ? raw.size
          : def.size,
      speed:
        raw?.speed === 'slow' || raw?.speed === 'normal' || raw?.speed === 'fast'
          ? raw.speed
          : def.speed,
      direction:
        raw?.direction === 'up' || raw?.direction === 'burst' || raw?.direction === 'down'
          ? raw.direction
          : def.direction,
      rotation: typeof raw?.rotation === 'boolean' ? raw.rotation : def.rotation,
      fade: typeof raw?.fade === 'boolean' ? raw.fade : def.fade,
      duration: Number.isFinite(rawDuration)
        ? Math.max(300, Math.min(1500, Math.round(rawDuration)))
        : def.duration,
    };
  }
  return normalized;
}

export function setAllClickAnimationsEnabled(
  animations: Partial<Record<StoreThemeId, Partial<ClickAnimationConfig>>> | null | undefined,
  enabled: boolean
): Record<StoreThemeId, ClickAnimationConfig> {
  const base = normalizeClickAnimationsMap(animations);
  const next = {} as Record<StoreThemeId, ClickAnimationConfig>;
  for (const id of CLICK_THEME_IDS) {
    next[id] = {
      ...base[id],
      enabled,
    };
  }
  return next;
}

export function setThemeClickAnimationEnabled(
  animations: Partial<Record<StoreThemeId, Partial<ClickAnimationConfig>>> | null | undefined,
  themeId: StoreThemeId,
  enabled: boolean
): Record<StoreThemeId, ClickAnimationConfig> {
  const base = normalizeClickAnimationsMap(animations);
  return {
    ...base,
    [themeId]: {
      ...base[themeId],
      enabled,
    },
  };
}

export function getClickAnimationsEnabledSummary(
  animations: Partial<Record<StoreThemeId, Partial<ClickAnimationConfig>>> | null | undefined
): {
  total: number;
  enabledCount: number;
  disabledCount: number;
  allEnabled: boolean;
  allDisabled: boolean;
} {
  const base = normalizeClickAnimationsMap(animations);
  const total = CLICK_THEME_IDS.length;
  const enabledCount = CLICK_THEME_IDS.filter((id) => base[id].enabled).length;
  return {
    total,
    enabledCount,
    disabledCount: total - enabledCount,
    allEnabled: enabledCount === total,
    allDisabled: enabledCount === 0,
  };
}

