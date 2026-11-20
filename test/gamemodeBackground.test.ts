import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_STORE_CONFIG, StoreConfigState } from '../src/context/StoreConfigContext';
import { sanitizeBannerUrl } from '../src/utils/themeBannerHelpers';

test('Gamemode Backgrounds - Default Store Config Structure', () => {
  assert.equal(typeof DEFAULT_STORE_CONFIG.lifestealBgUrl, 'string', 'lifestealBgUrl should default to string');
  assert.equal(typeof DEFAULT_STORE_CONFIG.practiceBgUrl, 'string', 'practiceBgUrl should default to string');
  assert.equal(DEFAULT_STORE_CONFIG.lifestealBgUrl, '', 'lifestealBgUrl defaults to empty string (fallback to bundled asset)');
  assert.equal(DEFAULT_STORE_CONFIG.practiceBgUrl, '', 'practiceBgUrl defaults to empty string (fallback to bundled asset)');
});

test('Gamemode Backgrounds - URL & Data URI Sanitization', () => {
  // Test valid HTTPS URLs
  const httpsUrl = 'https://example.com/assets/minecraft-lifesteal.jpg';
  assert.equal(sanitizeBannerUrl(httpsUrl), httpsUrl, 'Valid HTTPS URL should be preserved');

  // Test root-relative path
  const relativePath = '/assets/images/custom_practice.png';
  assert.equal(sanitizeBannerUrl(relativePath), relativePath, 'Root-relative path should be preserved');

  // Test valid data URI
  const sampleDataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  assert.equal(sanitizeBannerUrl(sampleDataUri), sampleDataUri, 'Valid base64 image data URI should be accepted');

  // Test malicious or invalid URLs
  assert.equal(sanitizeBannerUrl('javascript:alert(1)'), '', 'javascript: protocol should be rejected');
  assert.equal(sanitizeBannerUrl('data:text/html;base64,PHNjcmlwdD4='), '', 'data:text/html should be rejected');
  assert.equal(sanitizeBannerUrl(''), '', 'Empty string should return empty string');
  assert.equal(sanitizeBannerUrl(null), '', 'Null should return empty string');
  assert.equal(sanitizeBannerUrl(undefined), '', 'Undefined should return empty string');
});

test('Gamemode Backgrounds - Store Configuration Merge & Fallback Logic', () => {
  const customConfig: Partial<StoreConfigState> = {
    lifestealBgUrl: 'https://images.unsplash.com/photo-1542751371-adc38448a05e',
    practiceBgUrl: '/store/custom_sword_bg.png',
  };

  const merged = { ...DEFAULT_STORE_CONFIG, ...customConfig };
  assert.equal(merged.lifestealBgUrl, 'https://images.unsplash.com/photo-1542751371-adc38448a05e');
  assert.equal(merged.practiceBgUrl, '/store/custom_sword_bg.png');

  // Resolving display background: custom string if non-empty, otherwise fallback bundled image
  const defaultFallbackLifesteal = '/src/assets/images/lifesteal_bg_1794678969598.jpg';
  const defaultFallbackPractice = '/src/assets/images/practice_bg_1794678987213.jpg';

  const resolvedLifestealCustom = merged.lifestealBgUrl && merged.lifestealBgUrl.trim()
    ? merged.lifestealBgUrl.trim()
    : defaultFallbackLifesteal;

  const resolvedPracticeCustom = merged.practiceBgUrl && merged.practiceBgUrl.trim()
    ? merged.practiceBgUrl.trim()
    : defaultFallbackPractice;

  assert.equal(resolvedLifestealCustom, 'https://images.unsplash.com/photo-1542751371-adc38448a05e');
  assert.equal(resolvedPracticeCustom, '/store/custom_sword_bg.png');

  // Resetting returns to fallback
  const resetConfig: Partial<StoreConfigState> = {
    lifestealBgUrl: '',
    practiceBgUrl: '',
  };
  const resetMerged = { ...merged, ...resetConfig };
  const resolvedLifestealReset = resetMerged.lifestealBgUrl && resetMerged.lifestealBgUrl.trim()
    ? resetMerged.lifestealBgUrl.trim()
    : defaultFallbackLifesteal;
  const resolvedPracticeReset = resetMerged.practiceBgUrl && resetMerged.practiceBgUrl.trim()
    ? resetMerged.practiceBgUrl.trim()
    : defaultFallbackPractice;

  assert.equal(resolvedLifestealReset, defaultFallbackLifesteal);
  assert.equal(resolvedPracticeReset, defaultFallbackPractice);
});
