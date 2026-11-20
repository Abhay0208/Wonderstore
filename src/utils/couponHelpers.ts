import type {
  WalletCoupon,
  WalletCouponRedemption,
  WalletCouponType,
  WalletCouponStatus,
} from '../types';

export function normalizeCouponCode(code: string): string {
  if (typeof code !== 'string') return '';
  return code.trim().toUpperCase();
}

export function validateCouponCodeFormat(code: string): {
  valid: boolean;
  normalized: string;
  error?: string;
} {
  const normalized = normalizeCouponCode(code);
  if (!normalized) {
    return { valid: false, normalized: '', error: 'Coupon code cannot be empty.' };
  }
  if (normalized.length < 3) {
    return { valid: false, normalized, error: 'Coupon code must be at least 3 characters.' };
  }
  if (normalized.length > 32) {
    return { valid: false, normalized, error: 'Coupon code cannot exceed 32 characters.' };
  }
  if (!/^[A-Z0-9_-]+$/.test(normalized)) {
    return {
      valid: false,
      normalized,
      error: 'Coupon code may only contain uppercase letters, numbers, hyphens, and underscores.',
    };
  }
  return { valid: true, normalized };
}

export function generateRandomCouponCode(prefix = 'WONDER', randomLength = 6): string {
  const cleanPrefix = normalizeCouponCode(prefix) || 'WONDER';
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // omit ambiguous 0, O, 1, I
  let randomPart = '';
  for (let i = 0; i < randomLength; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${cleanPrefix}-${randomPart}`;
}

export function getTodayDateString(date = new Date()): string {
  return date.toISOString().split('T')[0];
}

export function computeCouponStatus(
  coupon: WalletCoupon,
  nowStr = getTodayDateString()
): 'active' | 'expired' | 'disabled' | 'depleted' | 'not_started' {
  if (coupon.status === 'disabled') {
    return 'disabled';
  }
  if (coupon.startDate && coupon.startDate > nowStr) {
    return 'not_started';
  }
  if (coupon.expiryDate && coupon.expiryDate < nowStr) {
    return 'expired';
  }
  if (typeof coupon.totalLimit === 'number' && coupon.totalLimit > 0 && coupon.redeemedCount >= coupon.totalLimit) {
    return 'depleted';
  }
  return 'active';
}

export function evaluateCouponRedemptionEligibility(args: {
  coupon: WalletCoupon | null | undefined;
  userId: string;
  priorUserRedemptions: WalletCouponRedemption[];
  nowStr?: string;
}): {
  eligible: boolean;
  error?: string;
  remainingUserClaims?: number;
} {
  const { coupon, userId, priorUserRedemptions, nowStr = getTodayDateString() } = args;

  if (!coupon) {
    return { eligible: false, error: 'Coupon code does not exist. Please check and try again.' };
  }

  if (coupon.status === 'disabled') {
    return { eligible: false, error: 'This coupon is currently inactive or disabled.' };
  }

  if (coupon.startDate && coupon.startDate > nowStr) {
    return {
      eligible: false,
      error: `This coupon is not active yet. It can be claimed starting ${coupon.startDate}.`,
    };
  }

  if (coupon.expiryDate && coupon.expiryDate < nowStr) {
    return {
      eligible: false,
      error: `This coupon has expired on ${coupon.expiryDate}.`,
    };
  }

  if (!coupon.rewardAmount || coupon.rewardAmount <= 0) {
    return { eligible: false, error: 'Coupon reward configuration is invalid.' };
  }

  // 1. Single Use globally
  if (coupon.couponType === 'single_use') {
    if (coupon.redeemedCount >= 1) {
      return { eligible: false, error: 'This single-use coupon has already been claimed.' };
    }
  }

  // 2. Total redemption limit check
  if (typeof coupon.totalLimit === 'number' && coupon.totalLimit > 0) {
    if (coupon.redeemedCount >= coupon.totalLimit) {
      return {
        eligible: false,
        error: `Coupon redemption limit has been reached (${coupon.redeemedCount}/${coupon.totalLimit} claimed).`,
      };
    }
  }

  // 3. Per user redemption limit check
  const userSuccessfulRedemptions = priorUserRedemptions.filter(
    (r) =>
      r.couponId === coupon.id &&
      r.userId === userId &&
      (r.status === 'successful' || !r.status)
  ).length;

  const perUserLimit =
    coupon.couponType === 'single_use'
      ? 1
      : typeof coupon.perUserLimit === 'number' && coupon.perUserLimit > 0
      ? coupon.perUserLimit
      : 1;

  if (userSuccessfulRedemptions >= perUserLimit) {
    return {
      eligible: false,
      error:
        perUserLimit === 1
          ? 'You have already claimed this coupon on your account.'
          : `You have reached your maximum claim limit (${userSuccessfulRedemptions}/${perUserLimit}) for this coupon.`,
    };
  }

  const remainingUserClaims = Math.max(0, perUserLimit - userSuccessfulRedemptions);

  return {
    eligible: true,
    remainingUserClaims,
  };
}

export function filterWalletCoupons(
  coupons: WalletCoupon[],
  query: string,
  statusFilter: 'all' | 'active' | 'expired' | 'disabled'
): WalletCoupon[] {
  const cleanQ = query.trim().toUpperCase();
  const today = getTodayDateString();

  return coupons.filter((c) => {
    // Search query matches code or description
    if (cleanQ) {
      const matchCode = c.code.toUpperCase().includes(cleanQ);
      const matchDesc = c.description ? c.description.toUpperCase().includes(cleanQ) : false;
      if (!matchCode && !matchDesc) return false;
    }

    const computed = computeCouponStatus(c, today);
    if (statusFilter === 'active') {
      return computed === 'active';
    }
    if (statusFilter === 'expired') {
      return computed === 'expired' || computed === 'depleted';
    }
    if (statusFilter === 'disabled') {
      return computed === 'disabled';
    }
    return true;
  });
}

export function filterWalletCouponRedemptions(
  redemptions: WalletCouponRedemption[],
  query: string
): WalletCouponRedemption[] {
  const cleanQ = query.trim().toLowerCase();
  if (!cleanQ) return redemptions;

  return redemptions.filter((r) => {
    return (
      r.couponCode.toLowerCase().includes(cleanQ) ||
      (r.username && r.username.toLowerCase().includes(cleanQ)) ||
      (r.userEmail && r.userEmail.toLowerCase().includes(cleanQ)) ||
      (r.userId && r.userId.toLowerCase().includes(cleanQ))
    );
  });
}
