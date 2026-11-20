import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_GAMEMODE_VISUALS,
  normalizeGamemodeVisuals,
  resolveGamemodeCardVisual,
  sanitizeIconEmoji,
} from '../src/utils/gamemodeVisualHelpers';
import { siteDb } from '../server/siteDb';

test('Gamemode Visuals - Emoji Grapheme Extraction Preserves Multi-codepoint Sequences', () => {
  assert.equal(sanitizeIconEmoji('❤️‍🔥'), '❤️‍🔥');
  assert.equal(sanitizeIconEmoji('⚔️'), '⚔️');
  assert.equal(sanitizeIconEmoji('💀🔥⚡'), '💀🔥');
  assert.equal(sanitizeIconEmoji('   '), '');
});

test('Gamemode Visuals - Normalization & XSS Sanitization', () => {
  const normalized = normalizeGamemodeVisuals({
    lifestealBgUrl: 'https://cdn.example.com/lifesteal.jpg',
    practiceBgUrl: 'javascript:alert(1)',
    lifestealIconType: 'emoji',
    lifestealIconValue: '💀',
    practiceIconType: 'image',
    practiceIconValue: 'javascript:evil()',
  });

  assert.equal(normalized.lifestealBgUrl, 'https://cdn.example.com/lifesteal.jpg');
  assert.equal(normalized.practiceBgUrl, '');
  assert.equal(normalized.lifestealIconType, 'emoji');
  assert.equal(normalized.lifestealIconValue, '💀');
  // Unsafe image URL reverts safely to default
  assert.equal(normalized.practiceIconType, 'default');
  assert.equal(normalized.practiceIconValue, '');
});

test('Gamemode Visuals - Card Resolution Fallback Logic', () => {
  const resolvedCustom = resolveGamemodeCardVisual(
    'practice',
    {
      practiceIconType: 'image',
      practiceIconValue: 'https://cdn.example.com/sword.png',
      practiceBgUrl: '/assets/custom-arena.png',
    },
    '/default-practice.jpg'
  );

  assert.equal(resolvedCustom.bgUrl, '/assets/custom-arena.png');
  assert.equal(resolvedCustom.isCustomBg, true);
  assert.equal(resolvedCustom.iconType, 'image');
  assert.equal(resolvedCustom.iconValue, 'https://cdn.example.com/sword.png');
  assert.equal(resolvedCustom.isCustomIcon, true);

  const resolvedDefault = resolveGamemodeCardVisual(
    'lifesteal',
    DEFAULT_GAMEMODE_VISUALS,
    '/default-lifesteal.jpg'
  );
  assert.equal(resolvedDefault.bgUrl, '/default-lifesteal.jpg');
  assert.equal(resolvedDefault.isCustomBg, false);
  assert.equal(resolvedDefault.iconType, 'default');
  assert.equal(resolvedDefault.isCustomIcon, false);
});

test('Gamemode Visuals - SiteDb Persistence Roundtrip & Reset', () => {
  const before = siteDb.getGamemodeVisuals();
  try {
    const saved = siteDb.updateGamemodeVisuals({
      lifestealIconType: 'emoji',
      lifestealIconValue: '🩸',
      practiceIconType: 'image',
      practiceIconValue: '/assets/netherite-axe.png',
    });
    assert.equal(saved.lifestealIconType, 'emoji');
    assert.equal(saved.lifestealIconValue, '🩸');
    assert.equal(saved.practiceIconType, 'image');
    assert.equal(saved.practiceIconValue, '/assets/netherite-axe.png');

    const reloaded = siteDb.getGamemodeVisuals();
    assert.equal(reloaded.lifestealIconValue, '🩸');
    assert.equal(reloaded.practiceIconValue, '/assets/netherite-axe.png');
  } finally {
    siteDb.updateGamemodeVisuals(before);
  }
});
