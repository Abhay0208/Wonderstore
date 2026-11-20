import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STORE_THEME_LIST,
  isValidStoreTheme,
  getThemeMeta,
  DEFAULT_STORE_THEME,
} from '../src/utils/categoryTheme';
import {
  DEFAULT_CLICK_CONFIGS,
  ANIMATION_PRESETS,
  getClickVisualStyle,
  generateClickParticles,
  setAllClickAnimationsEnabled,
  setThemeClickAnimationEnabled,
  getClickAnimationsEnabledSummary,
} from '../src/utils/clickAnimationHelpers';
import {
  DEFAULT_THEME_SETTINGS,
  sanitizeBannerUrl,
  resolveThemeBannerUrl,
  applyBannerToThemeSettings,
} from '../src/utils/themeBannerHelpers';
import { siteDb } from '../server/siteDb';

test('Theme System - 5 Themes Configuration', () => {
  const themeIds = STORE_THEME_LIST.map((t) => t.id);
  assert.equal(themeIds.length, 5, 'Should have exactly 5 themes');
  assert.deepEqual(
    themeIds,
    ['default', 'winter', 'christmas', 'newyear2027', 'ramadan'],
    'Should contain default, winter, christmas, newyear2027, and ramadan'
  );

  assert.equal(isValidStoreTheme('default'), true);
  assert.equal(isValidStoreTheme('ramadan'), true);
  assert.equal(isValidStoreTheme('winter'), true);
  assert.equal(isValidStoreTheme('christmas'), true);
  assert.equal(isValidStoreTheme('newyear2027'), true);
  assert.equal(isValidStoreTheme('unknown_theme'), false);
  assert.equal(isValidStoreTheme(null), false);
  assert.equal(isValidStoreTheme(undefined), false);

  const ramadanMeta = getThemeMeta('ramadan');
  assert.equal(ramadanMeta.id, 'ramadan');
  assert.equal(ramadanMeta.emoji, '🌙');
  assert.equal(ramadanMeta.label, 'Ramadan Theme');
  assert.ok(ramadanMeta.tagline.toLowerCase().includes('emerald'), 'Tagline should mention emerald');
  assert.ok(ramadanMeta.palette.includes('#10b981'), 'Palette should contain emerald color');
});

test('Click Animation System - 15 Preset Animations', () => {
  assert.equal(ANIMATION_PRESETS.length, 15, 'Should offer 15 required preset animations');

  const expectedTypes = [
    'crescent_moon',
    'star',
    'sparkle',
    'christmas_tree',
    'snowflake',
    'gift',
    'fireworks',
    'ramadan_lantern',
    'golden_star',
    'heart',
    'diamond',
    'coin',
    'celebration',
    'fire',
    'magic_wand',
  ];

  expectedTypes.forEach((type) => {
    const found = ANIMATION_PRESETS.find((opt) => opt.id === type);
    assert.ok(found, `Animation option for ${type} must exist`);
    assert.ok(found?.emoji, `Animation option ${type} must have an emoji`);
    assert.ok(found?.label, `Animation option ${type} must have a label`);
  });
});

test('Theme Independent Click Configurations - Winter Preserved & Other Themes Upgraded', () => {
  // Default: sleek Diamond Emerald Prism
  assert.equal(DEFAULT_CLICK_CONFIGS.default.animationType, 'diamond');
  assert.equal(DEFAULT_CLICK_CONFIGS.default.emoji, '💎');

  // Winter: preserved exact ❄️ Snowflake configuration
  assert.equal(DEFAULT_CLICK_CONFIGS.winter.animationType, 'snowflake');
  assert.equal(DEFAULT_CLICK_CONFIGS.winter.emoji, '❄️');
  assert.equal(DEFAULT_CLICK_CONFIGS.winter.rotation, true);

  // Christmas: upgraded to Gift 🎁 + festive sparkles
  assert.equal(DEFAULT_CLICK_CONFIGS.christmas.animationType, 'gift');
  assert.equal(DEFAULT_CLICK_CONFIGS.christmas.emoji, '🎁');

  // New Year 2027: upgraded to Celebration 🎉 + radial firework ring
  assert.equal(DEFAULT_CLICK_CONFIGS.newyear2027.animationType, 'celebration');
  assert.equal(DEFAULT_CLICK_CONFIGS.newyear2027.emoji, '🎉');

  // Ramadan: upgraded to Crescent Moon 🌙 + twinkling stars
  assert.equal(DEFAULT_CLICK_CONFIGS.ramadan.animationType, 'crescent_moon');
  assert.equal(DEFAULT_CLICK_CONFIGS.ramadan.emoji, '🌙');

  (['default', 'winter', 'christmas', 'newyear2027', 'ramadan'] as const).forEach((id) => {
    const config = DEFAULT_CLICK_CONFIGS[id];
    assert.equal(config.enabled, true);
    assert.ok(config.count >= 1 && config.count <= 8);
    assert.ok(['small', 'medium', 'large'].includes(config.size));
    assert.ok(['slow', 'normal', 'fast'].includes(config.speed));
    assert.ok(['up', 'burst', 'down'].includes(config.direction));
  });
});

test('Click Particle Physics - Gentle Tilt for Upright Emojis & Full Spin for Symmetrical Snowflakes', () => {
  const winterParticles = generateClickParticles(DEFAULT_CLICK_CONFIGS.winter, 'winter', () => 0.5);
  assert.equal(winterParticles.length, 6);
  assert.ok(winterParticles.every((p) => p.emoji === '❄️'), 'Winter preserves snowflake particles');
  assert.ok(winterParticles.every((p) => p.rotate >= 180), 'Symmetrical snowflake spins freely');

  const ramadanParticles = generateClickParticles(DEFAULT_CLICK_CONFIGS.ramadan, 'ramadan', () => 0.5);
  assert.equal(ramadanParticles.length, 5);
  assert.ok(
    ramadanParticles.every((p) => Math.abs(p.rotate) <= 30),
    'Crescent moon particles tilt gently instead of flipping upside down'
  );
  assert.ok(
    ramadanParticles.every((p) => Math.hypot(p.dx, p.dy) >= 40),
    'Ramadan radial particles fan out far enough from the center hero emoji'
  );

  const upArcParticles = generateClickParticles(
    { ...DEFAULT_CLICK_CONFIGS.ramadan, direction: 'up' },
    'ramadan',
    () => 0.5
  );
  assert.ok(
    upArcParticles.every((p) => p.dy < 0),
    'Upward direction lifts particles along a celestial arc above the cursor'
  );

  const nyStyle = getClickVisualStyle(DEFAULT_CLICK_CONFIGS.newyear2027, 'newyear2027');
  assert.equal(nyStyle.showFireworkRing, true, 'New Year theme activates celebratory firework ring');
});

test('Global & Per-Theme Click Animation Enable/Disable Helpers', () => {
  const allOff = setAllClickAnimationsEnabled(DEFAULT_CLICK_CONFIGS, false);
  const offSummary = getClickAnimationsEnabledSummary(allOff);
  assert.equal(offSummary.enabledCount, 0);
  assert.equal(offSummary.allDisabled, true);
  assert.equal(allOff.winter.emoji, '❄️', 'Toggling off must preserve custom emojis');
  assert.equal(allOff.ramadan.emoji, '🌙');

  const onlyWinterOn = setThemeClickAnimationEnabled(allOff, 'winter', true);
  const partialSummary = getClickAnimationsEnabledSummary(onlyWinterOn);
  assert.equal(partialSummary.enabledCount, 1);
  assert.equal(partialSummary.allEnabled, false);
  assert.equal(partialSummary.allDisabled, false);
  assert.equal(onlyWinterOn.winter.enabled, true);
  assert.equal(onlyWinterOn.ramadan.enabled, false);

  const allOn = setAllClickAnimationsEnabled(onlyWinterOn, true);
  assert.equal(getClickAnimationsEnabledSummary(allOn).allEnabled, true);
});

test('Theme Banner Helpers - Validation, Resolution & Multi-Theme Application', () => {
  assert.equal(sanitizeBannerUrl('https://cdn.example.com/banner.png'), 'https://cdn.example.com/banner.png');
  assert.equal(sanitizeBannerUrl('/assets/custom-banner.webp'), '/assets/custom-banner.webp');
  assert.equal(sanitizeBannerUrl('javascript:alert(1)'), '');
  assert.equal(sanitizeBannerUrl('//evil.example/banner.png'), '');

  const base = { ...DEFAULT_THEME_SETTINGS };
  assert.equal(resolveThemeBannerUrl('ramadan', base, '/fallback.jpg'), '/fallback.jpg');

  const singleUpdated = applyBannerToThemeSettings(base, 'ramadan', 'https://cdn.example.com/ramadan-banner.png');
  assert.equal(
    resolveThemeBannerUrl('ramadan', singleUpdated, '/fallback.jpg'),
    'https://cdn.example.com/ramadan-banner.png'
  );
  assert.equal(
    resolveThemeBannerUrl('winter', singleUpdated, '/fallback.jpg'),
    '/fallback.jpg',
    'Other themes still use fallback when only one theme banner is set'
  );

  const allUpdated = applyBannerToThemeSettings(singleUpdated, 'all', '/custom/wonder-banner.webp');
  (['default', 'winter', 'christmas', 'newyear2027', 'ramadan'] as const).forEach((id) => {
    assert.equal(resolveThemeBannerUrl(id, allUpdated, '/fallback.jpg'), '/custom/wonder-banner.webp');
  });

  const resetOne = applyBannerToThemeSettings(allUpdated, 'ramadan', '');
  assert.equal(resolveThemeBannerUrl('ramadan', resetOne, '/fallback.jpg'), '/fallback.jpg');
  assert.equal(resolveThemeBannerUrl('winter', resetOne, '/fallback.jpg'), '/custom/wonder-banner.webp');
});

test('Database Persistence - Theme Banners & Bulk Click Animations', () => {
  const initialThemes = siteDb.getThemeSettings();
  const initialAnimations = siteDb.getClickAnimations();

  // Disable all click animations in central DB and verify persistence
  const disabledAll = siteDb.updateClickAnimations(
    setAllClickAnimationsEnabled(initialAnimations, false)
  );
  assert.equal(getClickAnimationsEnabledSummary(disabledAll).allDisabled, true);
  assert.equal(getClickAnimationsEnabledSummary(siteDb.getClickAnimations()).allDisabled, true);

  // Set custom banner for Ramadan and verify persistence + reset
  const customBannerSettings = applyBannerToThemeSettings(
    initialThemes,
    'ramadan',
    'https://cdn.example.com/custom-ramadan.png'
  );
  const savedBannerDb = siteDb.updateThemeSettings(customBannerSettings);
  assert.equal(savedBannerDb.ramadan.bannerUrl, 'https://cdn.example.com/custom-ramadan.png');
  assert.equal(
    siteDb.getThemeSettings().ramadan.bannerUrl,
    'https://cdn.example.com/custom-ramadan.png'
  );

  // Reset banner back cleanly via updateThemeSettings
  const clearedSettings = applyBannerToThemeSettings(savedBannerDb, 'ramadan', '');
  const clearedDb = siteDb.updateThemeSettings(clearedSettings);
  assert.equal(clearedDb.ramadan.bannerUrl, undefined);

  // Restore original click animations & theme settings cleanly
  siteDb.updateClickAnimations(initialAnimations);
  siteDb.updateThemeSettings(initialThemes);
});
