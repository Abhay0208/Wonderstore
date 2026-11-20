import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  STORE_THEME_LIST,
  THEME_CARD_EFFECTS,
  isValidStoreTheme,
  resolveCategoryTheme,
  getCategoryTileClasses,
  getThemeMeta,
  getThemeCardEffectConfig,
} from './categoryTheme.ts';

describe('categoryTheme helpers', () => {
  it('exposes all 3 required themes in STORE_THEME_LIST', () => {
    assert.deepEqual(
      STORE_THEME_LIST.map((t) => t.id),
      ['winter', 'christmas', 'newyear2027']
    );
  });

  it('resolveCategoryTheme respects explicit category override over global storeTheme', () => {
    assert.equal(resolveCategoryTheme('christmas', 'winter'), 'christmas');
    assert.equal(resolveCategoryTheme('newyear2027', 'christmas'), 'newyear2027');
    assert.equal(resolveCategoryTheme('winter', 'newyear2027'), 'winter');
  });

  it('resolveCategoryTheme falls back to global storeTheme when auto or undefined', () => {
    assert.equal(resolveCategoryTheme('auto', 'christmas'), 'christmas');
    assert.equal(resolveCategoryTheme(undefined, 'newyear2027'), 'newyear2027');
    assert.equal(resolveCategoryTheme(undefined, undefined), 'winter');
  });

  it('getCategoryTileClasses builds deterministic 1-6 tile classes and theme class', () => {
    assert.equal(
      getCategoryTileClasses('auto', 'christmas', 0),
      'cat-tile cat-tile-1 cat-theme-christmas'
    );
    assert.equal(
      getCategoryTileClasses('newyear2027', 'winter', 7),
      'cat-tile cat-tile-2 cat-theme-newyear2027'
    );
  });

  it('isValidStoreTheme and getThemeMeta validate safely', () => {
    assert.equal(isValidStoreTheme('winter'), true);
    assert.equal(isValidStoreTheme('christmas'), true);
    assert.equal(isValidStoreTheme('newyear2027'), true);
    assert.equal(isValidStoreTheme('halloween'), false);
    assert.equal(getThemeMeta('newyear2027').shortLabel, 'New Year 2027');
    assert.equal(getThemeMeta(undefined).id, 'winter');
  });

  it('provides distinct animated emoji and glow configs for all 3 themes', () => {
    const winter = getThemeCardEffectConfig('winter');
    const christmas = getThemeCardEffectConfig('christmas');
    const ny = getThemeCardEffectConfig('newyear2027');

    assert.equal(winter.primaryEmoji, '❄️');
    assert.equal(winter.glowClassName, 'theme-card-selected-winter');
    assert.equal(christmas.primaryEmoji, '🎄');
    assert.ok(christmas.secondaryEmojis.includes('✨'));
    assert.ok(christmas.secondaryEmojis.includes('🎁'));
    assert.equal(ny.primaryEmoji, '🎆');
    assert.equal(ny.clickCelebrationText, '2027');
    assert.equal(getThemeCardEffectConfig(undefined).id, THEME_CARD_EFFECTS.winter.id);
  });
});

