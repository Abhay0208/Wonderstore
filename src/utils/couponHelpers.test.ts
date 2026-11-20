import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeCouponCode,
  validateCouponCodeFormat,
  generateRandomCouponCode,
  computeCouponStatus,
  evaluateCouponRedemptionEligibility,
  filterWalletCoupons,
  filterWalletCouponRedemptions,
} from './couponHelpers';
import type { WalletCoupon, WalletCouponRedemption } from '../types';

test('normalizeCouponCode trims and uppercases code', () => {
  assert.equal(normalizeCouponCode('  wonder500  '), 'WONDER500');
  assert.equal(normalizeCouponCode('gift-100'), 'GIFT-100');
  assert.equal(normalizeCouponCode(''), '');
});

test('validateCouponCodeFormat validates length and character set', () => {
  assert.equal(validateCouponCodeFormat('WONDER500').valid, true);
  assert.equal(validateCouponCodeFormat('WONDER-2026_X').valid, true);
  assert.equal(validateCouponCodeFormat('AB').valid, false); // < 3 chars
  assert.equal(validateCouponCodeFormat('INVALID CODE!').valid, false); // spaces/exclamation
  assert.equal(validateCouponCodeFormat('').valid, false);
});

test('generateRandomCouponCode produces unique prefixed code', () => {
  const code1 = generateRandomCouponCode('WONDER', 6);
  const code2 = generateRandomCouponCode('WONDER', 6);
  assert.match(code1, /^WONDER-[A-Z0-9]{6}$/);
  assert.notEqual(code1, code2);
});

test('computeCouponStatus identifies disabled, expired, depleted and active states', () => {
  const baseCoupon: WalletCoupon = {
    id: 'c-1',
    code: 'WONDER100',
    rewardAmount: 100,
    couponType: 'multi_use',
    redeemedCount: 0,
    status: 'active',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  assert.equal(computeCouponStatus({ ...baseCoupon, status: 'disabled' }, '2026-05-01'), 'disabled');
  assert.equal(
    computeCouponStatus({ ...baseCoupon, expiryDate: '2026-04-01' }, '2026-05-01'),
    'expired'
  );
  assert.equal(
    computeCouponStatus({ ...baseCoupon, startDate: '2026-06-01' }, '2026-05-01'),
    'not_started'
  );
  assert.equal(
    computeCouponStatus({ ...baseCoupon, totalLimit: 5, redeemedCount: 5 }, '2026-05-01'),
    'depleted'
  );
  assert.equal(computeCouponStatus(baseCoupon, '2026-05-01'), 'active');
});

test('evaluateCouponRedemptionEligibility enforces single_use global lock', () => {
  const singleCoupon: WalletCoupon = {
    id: 'c-single',
    code: 'EXCLUSIVE500',
    rewardAmount: 500,
    couponType: 'single_use',
    redeemedCount: 0,
    status: 'active',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  // 1st claim is eligible
  const res1 = evaluateCouponRedemptionEligibility({
    coupon: singleCoupon,
    userId: 'user-1',
    priorUserRedemptions: [],
    nowStr: '2026-05-01',
  });
  assert.equal(res1.eligible, true);

  // Once claimed once globally, second claim must be rejected
  const res2 = evaluateCouponRedemptionEligibility({
    coupon: { ...singleCoupon, redeemedCount: 1 },
    userId: 'user-2',
    priorUserRedemptions: [],
    nowStr: '2026-05-01',
  });
  assert.equal(res2.eligible, false);
  assert.match(res2.error || '', /already been claimed/i);
});

test('evaluateCouponRedemptionEligibility enforces perUserLimit and totalLimit', () => {
  const coupon: WalletCoupon = {
    id: 'c-multi',
    code: 'FESTIVE100',
    rewardAmount: 100,
    couponType: 'user_limited',
    perUserLimit: 2,
    totalLimit: 10,
    redeemedCount: 2,
    status: 'active',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  const existingRedemptions: WalletCouponRedemption[] = [
    {
      id: 'r-1',
      couponId: 'c-multi',
      couponCode: 'FESTIVE100',
      userId: 'user-1',
      username: 'Player1',
      userEmail: 'p1@test.com',
      walletTransactionId: 'tx-1',
      rewardAmount: 100,
      previousBalance: 0,
      newBalance: 100,
      status: 'successful',
      createdAt: '2026-05-01',
    },
  ];

  // User 1 has 1 claim, limit is 2 -> eligible, 1 claim remaining
  const check1 = evaluateCouponRedemptionEligibility({
    coupon,
    userId: 'user-1',
    priorUserRedemptions: existingRedemptions,
    nowStr: '2026-05-01',
  });
  assert.equal(check1.eligible, true);
  assert.equal(check1.remainingUserClaims, 1);

  // User 1 after 2 claims -> rejected
  const doubleRedemptions: WalletCouponRedemption[] = [
    ...existingRedemptions,
    {
      ...existingRedemptions[0],
      id: 'r-2',
      walletTransactionId: 'tx-2',
      previousBalance: 100,
      newBalance: 200,
    },
  ];

  const check2 = evaluateCouponRedemptionEligibility({
    coupon,
    userId: 'user-1',
    priorUserRedemptions: doubleRedemptions,
    nowStr: '2026-05-01',
  });
  assert.equal(check2.eligible, false);
  assert.match(check2.error || '', /maximum claim limit/i);
});

test('filterWalletCoupons and filterWalletCouponRedemptions filter properly', () => {
  const coupons: WalletCoupon[] = [
    {
      id: '1',
      code: 'WONDER100',
      rewardAmount: 100,
      couponType: 'multi_use',
      redeemedCount: 0,
      status: 'active',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
    {
      id: '2',
      code: 'SUMMER200',
      rewardAmount: 200,
      couponType: 'multi_use',
      redeemedCount: 0,
      status: 'disabled',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
  ];

  assert.equal(filterWalletCoupons(coupons, 'WONDER', 'all').length, 1);
  assert.equal(filterWalletCoupons(coupons, '', 'disabled').length, 1);

  const redemptions: WalletCouponRedemption[] = [
    {
      id: 'r-1',
      couponId: '1',
      couponCode: 'WONDER100',
      userId: 'user-alpha',
      username: 'AlphaHero',
      userEmail: 'alpha@wondermc.fun',
      walletTransactionId: 'tx-1',
      rewardAmount: 100,
      previousBalance: 0,
      newBalance: 100,
      status: 'successful',
      createdAt: '2026-05-01',
    },
  ];

  assert.equal(filterWalletCouponRedemptions(redemptions, 'Alpha').length, 1);
  assert.equal(filterWalletCouponRedemptions(redemptions, 'Omega').length, 0);
});
