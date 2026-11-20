import type {
  CheckoutPaymentMode,
  PaymentDashboardStats,
  PaymentRecord,
  PaymentRefund,
  PaymentStatus,
  PaymentType,
  UserWallet,
  WalletOverviewStats,
  WalletTransactionType,
} from '../types';

export const CREDIT_TO_INR_RATE = 1;
export const WALLET_RECHARGE_PRESETS = [50, 100, 200, 500, 1000] as const;
export const MIN_RECHARGE_AMOUNT = 1;
export const MAX_RECHARGE_AMOUNT = 100000;

export interface CombinedCheckoutBreakdown {
  valid: boolean;
  error?: string;
  mode: CheckoutPaymentMode;
  totalAmount: number;
  walletUsed: number;
  onlineDue: number;
  walletRemainingAfter: number;
}

export function roundCurrency(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

export function validateRechargeAmount(rawAmount: number): {
  valid: boolean;
  amount: number;
  error?: string;
} {
  const amount = roundCurrency(Number(rawAmount));
  if (!Number.isFinite(amount) || amount < MIN_RECHARGE_AMOUNT) {
    return {
      valid: false,
      amount: 0,
      error: `Minimum wallet recharge amount is ₹${MIN_RECHARGE_AMOUNT}.`,
    };
  }
  if (amount > MAX_RECHARGE_AMOUNT) {
    return {
      valid: false,
      amount: 0,
      error: `Maximum single wallet recharge amount is ₹${MAX_RECHARGE_AMOUNT}.`,
    };
  }
  return { valid: true, amount };
}

export function calculateCombinedCheckoutBreakdown(
  totalAmountRaw: number,
  walletBalanceRaw: number,
  mode: CheckoutPaymentMode
): CombinedCheckoutBreakdown {
  const totalAmount = roundCurrency(Math.max(0, Number(totalAmountRaw) || 0));
  const walletBalance = roundCurrency(Math.max(0, Number(walletBalanceRaw) || 0));

  if (totalAmount <= 0) {
    return {
      valid: false,
      error: 'Order total must be greater than ₹0.',
      mode,
      totalAmount: 0,
      walletUsed: 0,
      onlineDue: 0,
      walletRemainingAfter: walletBalance,
    };
  }

  if (mode === 'direct_online') {
    return {
      valid: true,
      mode,
      totalAmount,
      walletUsed: 0,
      onlineDue: totalAmount,
      walletRemainingAfter: walletBalance,
    };
  }

  if (mode === 'full_wallet') {
    if (walletBalance < totalAmount) {
      return {
        valid: false,
        error: `Insufficient wallet balance (${walletBalance} Credits). Need ${roundCurrency(
          totalAmount - walletBalance
        )} more credits or choose Combined Wallet + Online Payment.`,
        mode,
        totalAmount,
        walletUsed: 0,
        onlineDue: totalAmount,
        walletRemainingAfter: walletBalance,
      };
    }
    return {
      valid: true,
      mode,
      totalAmount,
      walletUsed: totalAmount,
      onlineDue: 0,
      walletRemainingAfter: roundCurrency(walletBalance - totalAmount),
    };
  }

  // combined mode
  if (walletBalance <= 0) {
    return {
      valid: false,
      error: 'Your wallet balance is 0 credits. Use Direct Online Payment or recharge your wallet first.',
      mode,
      totalAmount,
      walletUsed: 0,
      onlineDue: totalAmount,
      walletRemainingAfter: 0,
    };
  }

  const walletUsed = roundCurrency(Math.min(walletBalance, totalAmount));
  const onlineDue = roundCurrency(Math.max(0, totalAmount - walletUsed));

  return {
    valid: true,
    mode,
    totalAmount,
    walletUsed,
    onlineDue,
    walletRemainingAfter: roundCurrency(walletBalance - walletUsed),
  };
}

export type AdminWalletAdjustmentAction = 'admin_credit' | 'admin_debit' | 'promotional_credit';

export function computeWalletAdjustment(
  currentBalanceRaw: number,
  action: AdminWalletAdjustmentAction,
  rawAmount: number,
  reason: string
): {
  valid: boolean;
  error?: string;
  amount: number;
  previousBalance: number;
  updatedBalance: number;
} {
  const previousBalance = roundCurrency(Math.max(0, Number(currentBalanceRaw) || 0));
  const amount = roundCurrency(Number(rawAmount));
  const cleanReason = (reason || '').trim();

  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      valid: false,
      error: 'Adjustment amount must be greater than 0.',
      amount: 0,
      previousBalance,
      updatedBalance: previousBalance,
    };
  }
  if (!cleanReason) {
    return {
      valid: false,
      error: 'A clear reason is required for every manual wallet adjustment.',
      amount,
      previousBalance,
      updatedBalance: previousBalance,
    };
  }

  if (action === 'admin_debit') {
    const next = roundCurrency(previousBalance - amount);
    if (next < 0) {
      return {
        valid: false,
        error: `Cannot deduct ${amount} credits: user only has ${previousBalance} credits (negative balances are forbidden).`,
        amount,
        previousBalance,
        updatedBalance: previousBalance,
      };
    }
    return {
      valid: true,
      amount,
      previousBalance,
      updatedBalance: next,
    };
  }

  return {
    valid: true,
    amount,
    previousBalance,
    updatedBalance: roundCurrency(previousBalance + amount),
  };
}

export function computePaymentDashboardStats(payments: PaymentRecord[]): PaymentDashboardStats {
  const stats: PaymentDashboardStats = {
    totalPayments: payments.length,
    successfulPayments: 0,
    pendingPayments: 0,
    failedPayments: 0,
    refundedPayments: 0,
    totalPaymentAmount: 0,
    totalWalletRecharges: 0,
    totalDirectPayments: 0,
    totalCombinedPayments: 0,
  };

  for (const p of payments) {
    if (p.status === 'successful') {
      stats.successfulPayments += 1;
      stats.totalPaymentAmount = roundCurrency(stats.totalPaymentAmount + p.amount);
    } else if (p.status === 'pending' || p.status === 'processing') {
      stats.pendingPayments += 1;
    } else if (p.status === 'failed' || p.status === 'cancelled') {
      stats.failedPayments += 1;
    } else if (p.status === 'refunded' || p.status === 'partially_refunded') {
      stats.refundedPayments += 1;
    }

    if (p.status === 'successful') {
      if (p.paymentType === 'wallet_recharge') {
        stats.totalWalletRecharges = roundCurrency(stats.totalWalletRecharges + p.amount);
      } else if (p.paymentType === 'direct_product') {
        stats.totalDirectPayments = roundCurrency(stats.totalDirectPayments + p.amount);
      } else if (p.paymentType === 'combined') {
        stats.totalCombinedPayments = roundCurrency(stats.totalCombinedPayments + p.amount);
      }
    }
  }

  return stats;
}

export function computeWalletOverviewStats(wallets: UserWallet[]): WalletOverviewStats {
  const stats: WalletOverviewStats = {
    totalWallets: wallets.length,
    totalOutstandingBalance: 0,
    totalCreditsAdded: 0,
    totalCreditsSpent: 0,
    totalRefunds: 0,
    totalPromotionalCredits: 0,
  };

  for (const w of wallets) {
    stats.totalOutstandingBalance = roundCurrency(stats.totalOutstandingBalance + (w.balance || 0));
    stats.totalCreditsAdded = roundCurrency(stats.totalCreditsAdded + (w.totalCreditsAdded || 0));
    stats.totalCreditsSpent = roundCurrency(stats.totalCreditsSpent + (w.totalCreditsSpent || 0));
    stats.totalRefunds = roundCurrency(stats.totalRefunds + (w.totalRefunds || 0));
    stats.totalPromotionalCredits = roundCurrency(
      stats.totalPromotionalCredits + (w.totalPromotionalCredits || 0)
    );
  }

  return stats;
}

export function computeEligibleRefundBreakdown(
  payment: PaymentRecord,
  existingRefunds: PaymentRefund[],
  walletBalance = 0
): {
  eligible: boolean;
  error?: string;
  totalRefundAmount: number;
  walletRefundAmount: number;
  onlineRefundAmount: number;
} {
  if (payment.status === 'refunded') {
    return {
      eligible: false,
      error: 'This payment has already been refunded.',
      totalRefundAmount: 0,
      walletRefundAmount: 0,
      onlineRefundAmount: 0,
    };
  }
  if (payment.status !== 'successful') {
    return {
      eligible: false,
      error: `Only successful payments can be refunded (current status: ${payment.status}).`,
      totalRefundAmount: 0,
      walletRefundAmount: 0,
      onlineRefundAmount: 0,
    };
  }
  if (existingRefunds.some((r) => r.paymentId === payment.id && r.status === 'successful')) {
    return {
      eligible: false,
      error: 'Duplicate refund blocked: a successful refund already exists for this payment.',
      totalRefundAmount: 0,
      walletRefundAmount: 0,
      onlineRefundAmount: 0,
    };
  }

  if (payment.paymentType === 'wallet_product') {
    const amt = roundCurrency(payment.amount);
    return {
      eligible: true,
      totalRefundAmount: amt,
      walletRefundAmount: amt,
      onlineRefundAmount: 0,
    };
  }

  if (payment.paymentType === 'combined') {
    const walletPart = roundCurrency(payment.walletAmount ?? 0);
    const onlinePart = roundCurrency(payment.onlineAmount ?? Math.max(0, payment.amount - walletPart));
    return {
      eligible: true,
      totalRefundAmount: roundCurrency(walletPart + onlinePart),
      walletRefundAmount: walletPart,
      onlineRefundAmount: onlinePart,
    };
  }

  if (payment.paymentType === 'wallet_recharge') {
    if (walletBalance < payment.amount) {
      return {
        eligible: false,
        error: `Cannot refund this recharge: customer already spent credits from wallet (available: ${walletBalance}, recharge: ${payment.amount}).`,
        totalRefundAmount: 0,
        walletRefundAmount: 0,
        onlineRefundAmount: 0,
      };
    }
    return {
      eligible: true,
      totalRefundAmount: roundCurrency(payment.amount),
      walletRefundAmount: 0,
      onlineRefundAmount: roundCurrency(payment.amount),
    };
  }

  if (payment.paymentType === 'direct_product') {
    return {
      eligible: true,
      totalRefundAmount: roundCurrency(payment.amount),
      walletRefundAmount: 0,
      onlineRefundAmount: roundCurrency(payment.amount),
    };
  }

  return {
    eligible: false,
    error: 'This payment type is not eligible for refund.',
    totalRefundAmount: 0,
    walletRefundAmount: 0,
    onlineRefundAmount: 0,
  };
}

export interface PaymentFilterCriteria {
  search?: string;
  paymentMethod?: string;
  paymentGateway?: string;
  paymentType?: PaymentType | 'all';
  status?: PaymentStatus | 'all';
  dateFrom?: string;
  dateTo?: string;
}

export function filterPayments(
  payments: PaymentRecord[],
  criteria: PaymentFilterCriteria
): PaymentRecord[] {
  const q = (criteria.search || '').trim().toLowerCase();
  const methodFilter = (criteria.paymentMethod || 'all').toLowerCase();
  const gatewayFilter = (criteria.paymentGateway || 'all').toLowerCase();
  const typeFilter = criteria.paymentType || 'all';
  const statusFilter = criteria.status || 'all';
  const dateFromMs = criteria.dateFrom ? new Date(`${criteria.dateFrom}T00:00:00.000Z`).getTime() : null;
  const dateToMs = criteria.dateTo ? new Date(`${criteria.dateTo}T23:59:59.999Z`).getTime() : null;

  return payments.filter((p) => {
    if (typeFilter !== 'all' && p.paymentType !== typeFilter) return false;
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (methodFilter !== 'all' && (p.paymentMethod || '').toLowerCase() !== methodFilter) {
      return false;
    }
    if (gatewayFilter !== 'all' && (p.paymentGateway || '').toLowerCase() !== gatewayFilter) {
      return false;
    }
    if (dateFromMs !== null || dateToMs !== null) {
      const createdMs = new Date(p.createdAt).getTime();
      if (dateFromMs !== null && createdMs < dateFromMs) return false;
      if (dateToMs !== null && createdMs > dateToMs) return false;
    }
    if (q) {
      const haystack = [
        p.id,
        p.transactionId,
        p.onlineTransactionId,
        p.gatewayOrderId,
        p.gatewayReference,
        p.orderId,
        p.userId,
        p.username,
        p.email,
        p.productName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

export function canTransitionPaymentStatus(
  currentStatus: PaymentStatus,
  nextStatus: PaymentStatus,
  isBackendVerified: boolean
): { allowed: boolean; reason?: string } {
  if (currentStatus === nextStatus) {
    return { allowed: true };
  }
  if (currentStatus === 'refunded') {
    return { allowed: false, reason: 'Refunded payments are terminal and cannot be modified.' };
  }
  if (nextStatus === 'successful' && !isBackendVerified) {
    return {
      allowed: false,
      reason: 'Unverified payments cannot be manually marked as successful without verified backend payment confirmation.',
    };
  }
  if (nextStatus === 'refunded' && currentStatus !== 'successful') {
    return {
      allowed: false,
      reason: 'Only successful payments can transition to refunded via the refund workflow.',
    };
  }
  return { allowed: true };
}

export function getWalletTxTypeLabel(type: WalletTransactionType): string {
  switch (type) {
    case 'wallet_recharge':
      return 'Wallet Recharge';
    case 'product_purchase':
      return 'Product Purchase';
    case 'refund':
      return 'Refund';
    case 'admin_credit':
      return 'Admin Credit';
    case 'admin_debit':
      return 'Admin Debit';
    case 'promotional_credit':
      return 'Promotional Credit';
    case 'COUPON_REWARD':
    case 'coupon_reward':
      return 'Coupon Reward';
    default:
      return type;
  }
}

export function getPaymentTypeLabel(type: PaymentType): string {
  switch (type) {
    case 'wallet_recharge':
      return 'Wallet Recharge';
    case 'direct_product':
      return 'Direct Online Purchase';
    case 'wallet_product':
      return 'Full Wallet Purchase';
    case 'combined':
      return 'Combined (Wallet + Online)';
    case 'refund':
      return 'Refund';
    default:
      return type;
  }
}

export function getPaymentStatusLabel(status: PaymentStatus): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'processing':
      return 'Processing';
    case 'successful':
      return 'Successful';
    case 'failed':
      return 'Failed';
    case 'cancelled':
      return 'Cancelled';
    case 'refunded':
      return 'Refunded';
    case 'partially_refunded':
      return 'Partially Refunded';
    default:
      return status;
  }
}
