import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_FLOATING_EMOJIS,
  FLOATING_EMOJI_PRESETS,
  parseFloatingEmojiList,
  sanitizeFloatingEmojisForTheme,
  resolveFloatingEmojiConfig,
  applyFloatingEmojisToThemeSettings,
  getFloatingEmojisSummary,
} from '../src/utils/floatingEmojiHelpers';
import { DEFAULT_THEME_SETTINGS, normalizeThemeSettings } from '../src/utils/themeBannerHelpers';
import { siteDb } from '../server/siteDb';

test('Floating Emojis - Parsing & Multi-codepoint Grapheme Preservation', () => {
  // Space/comma separated
  assert.deepEqual(parseFloatingEmojiList('🔥, 💎, ⚔️'), ['🔥', '💎', '⚔️']);

  // Concatenated without spaces
  assert.deepEqual(parseFloatingEmojiList('❄️❤️⭐🌙'), ['❄️', '❤️', '⭐', '🌙']);

  // Deduplication & max cap (12)
  assert.deepEqual(parseFloatingEmojiList('🔥 🔥 💎 🔥'), ['🔥', '💎']);

  const many = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟', '🔥', '💎', '⚔️', '⭐'];
  assert.equal(parseFloatingEmojiList(many).length, 12);
});

test('Floating Emojis - Defaults, Resolution & Presets', () => {
  assert.ok(FLOATING_EMOJI_PRESETS.length >= 8);
  assert.deepEqual(sanitizeFloatingEmojisForTheme('winter', []), DEFAULT_FLOATING_EMOJIS.winter);

  const resolvedDefault = resolveFloatingEmojiConfig('winter', DEFAULT_THEME_SETTINGS);
  assert.equal(resolvedDefault.enabled, true);
  assert.deepEqual(resolvedDefault.emojis, DEFAULT_FLOATING_EMOJIS.winter);
  assert.equal(resolvedDefault.density, 'normal');
  assert.equal(resolvedDefault.speed, 'normal');
  assert.equal(resolvedDefault.particleCount, 28);
  assert.equal(resolvedDefault.durationMultiplier, 1.0);
});

test('Floating Emojis - Apply Single & All Themes + Density/Speed + ON/OFF', () => {
  let settings = normalizeThemeSettings(DEFAULT_THEME_SETTINGS);

  // Update single theme (winter)
  settings = applyFloatingEmojisToThemeSettings(settings, 'winter', {
    floatingEmojis: ['🔥', '💎'],
    floatingEmojiDensity: 'high',
    floatingEmojiSpeed: 'fast',
    floatingEmojisEnabled: true,
  });

  const winterCfg = resolveFloatingEmojiConfig('winter', settings);
  assert.deepEqual(winterCfg.emojis, ['🔥', '💎']);
  assert.equal(winterCfg.particleCount, 44);
  assert.equal(winterCfg.durationMultiplier, 0.65);

  // Other theme unaffected
  const ramadanCfg = resolveFloatingEmojiConfig('ramadan', settings);
  assert.deepEqual(ramadanCfg.emojis, DEFAULT_FLOATING_EMOJIS.ramadan);

  // Toggle OFF all themes
  settings = applyFloatingEmojisToThemeSettings(settings, 'all', {
    floatingEmojisEnabled: false,
  });
  const summaryOff = getFloatingEmojisSummary(settings);
  assert.equal(summaryOff.allDisabled, true);
  assert.equal(summaryOff.enabledCount, 0);

  // Toggle ON all themes
  settings = applyFloatingEmojisToThemeSettings(settings, 'all', {
    floatingEmojisEnabled: true,
  });
  const summaryOn = getFloatingEmojisSummary(settings);
  assert.equal(summaryOn.allEnabled, true);
  assert.equal(summaryOn.enabledCount, 5);
});

test('Floating Emojis - SiteDb Persistence Preserves Banners & Floating Emojis Together', () => {
  const original = siteDb.getThemeSettings();
  try {
    // 1. Update banner first
    siteDb.updateThemeSettings({
      winter: {
        ...original.winter,
        bannerUrl: 'https://example.com/winter-banner.png',
      },
    });

    // 2. Update floating emojis separately
    const afterFloating = siteDb.updateFloatingEmojis({
      winter: {
        floatingEmojisEnabled: true,
        floatingEmojis: ['💎', '🪙'],
        floatingEmojiDensity: 'low',
        floatingEmojiSpeed: 'slow',
      },
    });

    assert.equal(afterFloating.winter.bannerUrl, 'https://example.com/winter-banner.png');
    assert.deepEqual(afterFloating.winter.floatingEmojis, ['💎', '🪙']);
    assert.equal(afterFloating.winter.floatingEmojiDensity, 'low');
    assert.equal(afterFloating.winter.floatingEmojiSpeed, 'slow');

    // 3. Updating theme settings without floating fields should keep existing floating emojis intact
    const afterThemeToggle = siteDb.updateThemeSettings({
      winter: {
        id: 'winter',
        enabled: true,
        bannerUrl: 'https://example.com/winter-banner-v2.png',
      },
    });
    assert.equal(afterThemeToggle.winter.bannerUrl, 'https://example.com/winter-banner-v2.png');
    assert.deepEqual(afterThemeToggle.winter.floatingEmojis, ['💎', '🪙']);
  } finally {
    // Restore original DB state cleanly
    siteDb.updateThemeSettings(original);
    siteDb.updateFloatingEmojis({
      winter: {
        floatingEmojisEnabled: original.winter.floatingEmojisEnabled ?? true,
        floatingEmojis: original.winter.floatingEmojis,
        floatingEmojiDensity: original.winter.floatingEmojiDensity || 'normal',
        floatingEmojiSpeed: original.winter.floatingEmojiSpeed || 'normal',
      },
    });
  }
});
