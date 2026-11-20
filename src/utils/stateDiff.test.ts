import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  stripTestKeys,
  areValuesEqual,
  computeChangedSections,
  getNextQuotaResetMs,
} from './stateDiff.ts';

describe('stateDiff helpers', () => {
  it('stripTestKeys removes legacy diagnostic keys while preserving real data', () => {
    const cleaned = stripTestKeys({
      config: { storeTheme: 'winter' },
      orders: [{ id: '1' }],
      test_ping: 123,
      testTimestamp: 456,
      test_quota_check: 789,
      test_quota_fixed: true,
      testPing: true,
      test_verify: 111,
    });
    assert.deepEqual(cleaned, {
      config: { storeTheme: 'winter' },
      orders: [{ id: '1' }],
    });
  });

  it('areValuesEqual compares nested objects and arrays accurately', () => {
    assert.equal(areValuesEqual({ a: 1, b: [2, 3] }, { b: [2, 3], a: 1 }), true);
    assert.equal(areValuesEqual({ a: 1, b: [2, 3] }, { a: 1, b: [2, 4] }), false);
    assert.equal(areValuesEqual([{ id: 'x' }], [{ id: 'x' }]), true);
    assert.equal(areValuesEqual(null, {}), false);
  });

  it('computeChangedSections returns empty array for identical polled state', () => {
    const current = {
      config: { storeTheme: 'winter', brand: 'WonderMC' },
      orders: [{ id: 'o1', status: 'pending' }],
      tickets: [{ id: 't1', status: 'open' }],
      _lastUpdated: 1000,
    };
    const incoming = {
      orders: [{ id: 'o1', status: 'pending' }],
      _lastUpdated: 2000,
      test_ping: 999,
    };
    assert.deepEqual(computeChangedSections(current, incoming), []);
  });

  it('computeChangedSections returns only modified section keys', () => {
    const current = {
      config: { storeTheme: 'winter' },
      orders: [{ id: 'o1', status: 'pending' }],
      items: [{ id: 'i1', price: 100 }],
    };
    const incoming = {
      config: { storeTheme: 'winter' },
      orders: [{ id: 'o1', status: 'completed' }],
    };
    assert.deepEqual(computeChangedSections(current, incoming), ['orders']);
  });

  it('getNextQuotaResetMs returns a timestamp between 5m and 24h in the future', () => {
    const now = Date.UTC(2026, 10, 13, 3, 15, 0);
    const reset = getNextQuotaResetMs(now);
    assert.ok(reset >= now + 5 * 60 * 1000);
    assert.ok(reset <= now + 24 * 60 * 60 * 1000);
  });
});
