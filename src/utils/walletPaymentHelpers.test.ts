import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCombinedCheckoutBreakdown,
  validateRechargeAmount,
  computeWalletAdjustment,
  computePaymentDashboardStats,
  computeEligibleRefundBreakdown,
  filterPayments,
  canTransitionPaymentStatus,
} from './walletPaymentHelpers';
import type { PaymentRecord, PaymentRefund } from '../types';

test('calculateCombinedCheckoutBreakdown handles direct, full_wallet, combined & prevents negative balance', () => {
  // Full wallet sufficient
  const fullOk = calculateCombinedCheckoutBreakdown(300, 500, 'full_wallet');
  assert.equal(fullOk.valid, true);
  assert.equal(fullOk.walletUsed, 300);
  assert.equal(fullOk.onlineDue, 0);
  assert.equal(fullOk.walletRemainingAfter, 200);

  // Full wallet insufficient
  const fullFail = calculateCombinedCheckoutBreakdown(500, 300, 'full_wallet');
  assert.equal(fullFail.valid, false);
  assert.ok(fullFail.error?.includes('Insufficient'));

  // Combined exact example: Price 500, Wallet 300 -> Wallet 300, Online 200
  const combinedOk = calculateCombinedCheckoutBreakdown(500, 300, 'combined');
  assert.equal(combinedOk.valid, true);
  assert.equal(combinedOk.walletUsed, 300);
  assert.equal(combinedOk.onlineDue, 200);
  assert.equal(combinedOk.walletRemainingAfter, 0);

  // Direct online with 0 balance always works without recharging wallet
  const directOk = calculateCombinedCheckoutBreakdown(500, 0, 'direct_online');
  assert.equal(directOk.valid, true);
  assert.equal(directOk.walletUsed, 0);
  assert.equal(directOk.onlineDue, 500);
});

test('validateRechargeAmount validates presets and custom limits', () => {
  assert.equal(validateRechargeAmount(50).valid, true);
  assert.equal(validateRechargeAmount(500).amount, 500);
  assert.equal(validateRechargeAmount(0).valid, false);
  assert.equal(validateRechargeAmount(-100).valid, false);
  assert.equal(validateRechargeAmount(150000).valid, false);
});

test('computeWalletAdjustment enforces reason and blocks negative debit balances', () => {
  const credit = computeWalletAdjustment(200, 'promotional_credit', 150, 'Diwali reward');
  assert.equal(credit.valid, true);
  assert.equal(credit.updatedBalance, 350);

  const debitFail = computeWalletAdjustment(100, 'admin_debit', 250, 'Overcharge');
  assert.equal(debitFail.valid, false);
  assert.equal(debitFail.updatedBalance, 100);

  const missingReason = computeWalletAdjustment(100, 'admin_credit', 50, '   ');
  assert.equal(missingReason.valid, false);
});

test('computeEligibleRefundBreakdown splits combined payment refunds accurately & blocks duplicates', () => {
  const combinedPayment: PaymentRecord = {
    id: 'PAY-COMB-1',
    transactionId: 'TXN-COMB-1',
    orderId: 'ORD-1',
    userId: 'u1',
    username: 'Steve',
    email: 'steve@example.com',
    amount: 500,
    walletAmount: 200,
    onlineAmount: 300,
    onlineTransactionId: 'pay_rzp_123',
    paymentMethod: 'wallet+upi',
    paymentGateway: 'razorpay',
    paymentType: 'combined',
    status: 'successful',
    verifiedByBackend: true,
    createdAt: '2026-11-12T10:00:00.000Z',
    updatedAt: '2026-11-12T10:00:00.000Z',
  };

  const breakdown = computeEligibleRefundBreakdown(combinedPayment, []);
  assert.equal(breakdown.eligible, true);
  assert.equal(breakdown.totalRefundAmount, 500);
  assert.equal(breakdown.walletRefundAmount, 200);
  assert.equal(breakdown.onlineRefundAmount, 300);

  const existingRefund: PaymentRefund = {
    id: 'REF-1',
    refundRef: 'RFD-1',
    paymentId: 'PAY-COMB-1',
    userId: 'u1',
    totalRefundAmount: 500,
    walletRefundAmount: 200,
    onlineRefundAmount: 300,
    reason: 'Duplicate purchase',
    adminId: 'owner',
    adminName: 'Owner',
    status: 'successful',
    createdAt: '2026-11-12T10:05:00.000Z',
  };

  const dupBlocked = computeEligibleRefundBreakdown(combinedPayment, [existingRefund]);
  assert.equal(dupBlocked.eligible, false);
});

test('canTransitionPaymentStatus prevents manual unverified successful override and locks refunded state', () => {
  assert.equal(canTransitionPaymentStatus('pending', 'successful', false).allowed, false);
  assert.equal(canTransitionPaymentStatus('failed', 'successful', false).allowed, false);
  assert.equal(canTransitionPaymentStatus('pending', 'successful', true).allowed, true);
  assert.equal(canTransitionPaymentStatus('refunded', 'failed', true).allowed, false);
});

test('computePaymentDashboardStats and filterPayments calculate accurate metrics & search by Payment ID', () => {
  const sample: PaymentRecord[] = [
    {
      id: 'PAY-1001',
      transactionId: 'pay_1',
      userId: 'u1',
      username: 'Alex',
      email: 'alex@mc.test',
      amount: 500,
      paymentMethod: 'upi',
      paymentGateway: 'razorpay',
      paymentType: 'wallet_recharge',
      status: 'successful',
      createdAt: '2026-11-10T10:00:00.000Z',
      updatedAt: '2026-11-10T10:00:00.000Z',
    },
    {
      id: 'PAY-1002',
      transactionId: 'wal_2',
      userId: 'u1',
      username: 'Alex',
      email: 'alex@mc.test',
      amount: 300,
      walletAmount: 300,
      paymentMethod: 'wallet',
      paymentGateway: 'wallet',
      paymentType: 'wallet_product',
      status: 'successful',
      createdAt: '2026-11-11T10:00:00.000Z',
      updatedAt: '2026-11-11T10:00:00.000Z',
    },
    {
      id: 'PAY-1003',
      transactionId: 'comb_3',
      userId: 'u1',
      username: 'Alex',
      email: 'alex@mc.test',
      amount: 500,
      walletAmount: 200,
      onlineAmount: 300,
      onlineTransactionId: 'pay_rzp_3',
      paymentMethod: 'wallet+card',
      paymentGateway: 'razorpay',
      paymentType: 'combined',
      status: 'successful',
      createdAt: '2026-11-12T10:00:00.000Z',
      updatedAt: '2026-11-12T10:00:00.000Z',
    },
    {
      id: 'PAY-1004',
      transactionId: 'dir_4',
      userId: 'u2',
      username: 'Herobrine',
      email: 'hb@mc.test',
      amount: 250,
      paymentMethod: 'netbanking',
      paymentGateway: 'razorpay',
      paymentType: 'direct_product',
      status: 'pending',
      createdAt: '2026-11-12T12:00:00.000Z',
      updatedAt: '2026-11-12T12:00:00.000Z',
    },
  ];

  const stats = computePaymentDashboardStats(sample);
  assert.equal(stats.totalPayments, 4);
  assert.equal(stats.successfulPayments, 3);
  assert.equal(stats.pendingPayments, 1);
  assert.equal(stats.totalPaymentAmount, 1300);
  assert.equal(stats.totalWalletRecharges, 500);
  assert.equal(stats.totalCombinedPayments, 500);

  const byId = filterPayments(sample, { search: 'PAY-1003' });
  assert.equal(byId.length, 1);
  assert.equal(byId[0].onlineTransactionId, 'pay_rzp_3');

  const byStatus = filterPayments(sample, { status: 'pending' });
  assert.equal(byStatus.length, 1);
  assert.equal(byStatus[0].id, 'PAY-1004');
});
