import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { getSupabaseAdmin } from './supabaseAdmin';
import type {
  GatewayPaymentMethod,
  Order,
  PaymentDashboardStats,
  PaymentGatewayPublicConfig,
  PaymentRecord,
  PaymentRefund,
  PaymentStatus,
  UserWallet,
  WalletCoupon,
  WalletCouponRedemption,
  WalletCouponStatus,
  WalletCouponType,
  WalletOverviewStats,
  WalletRecharge,
  WalletTransaction,
} from '../src/types';
import {
  calculateCombinedCheckoutBreakdown,
  canTransitionPaymentStatus,
  computeEligibleRefundBreakdown,
  computePaymentDashboardStats,
  computeWalletAdjustment,
  computeWalletOverviewStats,
  roundCurrency,
  validateRechargeAmount,
  type AdminWalletAdjustmentAction,
} from '../src/utils/walletPaymentHelpers';
import {
  computeCouponStatus,
  evaluateCouponRedemptionEligibility,
  normalizeCouponCode,
  validateCouponCodeFormat,
} from '../src/utils/couponHelpers';
import {
  createGatewayOrder,
  executeGatewayRefund,
  getPublicGatewayConfig,
  verifyGatewaySignature,
  verifyRazorpayWebhookSignature,
} from './paymentGateway';
import type { SessionTokenPayload } from './supportDb';

export interface WalletDbSchema {
  user_wallets: UserWallet[];
  wallet_transactions: WalletTransaction[];
  wallet_recharges: WalletRecharge[];
  payments: PaymentRecord[];
  payment_refunds: PaymentRefund[];
  orders: Order[];
  processedGatewayPaymentIds: string[];
  wallet_coupons: WalletCoupon[];
  wallet_coupon_redemptions: WalletCouponRedemption[];
}

export interface RealtimeWalletEvent {
  type:
    | 'wallet_updated'
    | 'recharge_updated'
    | 'payment_updated'
    | 'refund_created'
    | 'order_updated'
    | 'coupon_updated'
    | 'redemption_created';
  userId?: string;
  paymentId?: string;
  couponId?: string;
  timestamp: string;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'wallet_db.json');

function createEmptyDb(): WalletDbSchema {
  return {
    user_wallets: [],
    wallet_transactions: [],
    wallet_recharges: [],
    payments: [],
    payment_refunds: [],
    orders: [],
    processedGatewayPaymentIds: [],
    wallet_coupons: [],
    wallet_coupon_redemptions: [],
  };
}

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto
    .randomBytes(3)
    .toString('hex')
    .toUpperCase()}`;
}

class WalletDatabase {
  private cache: WalletDbSchema | null = null;
  public readonly events = new EventEmitter();

  constructor() {
    this.events.setMaxListeners(200);
  }

  private ensureDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  // Supabase row → internal type mappers
  private mapWallet(r: any): UserWallet {
    return {
      userId: r.user_id, username: r.username, email: r.email,
      balance: Number(r.balance) || 0,
      totalCreditsAdded: Number(r.total_credits_added ?? r.total_credited) || 0,
      totalCreditsSpent: Number(r.total_credits_spent ?? r.total_spent) || 0,
      totalRefunds: Number(r.total_refunds) || 0,
      totalPromotionalCredits: Number(r.total_promotional_credits) || 0,
      createdAt: r.created_at, updatedAt: r.updated_at,
    } as UserWallet;
  }
  private mapTx(r: any): WalletTransaction {
    return {
      id: r.id, transactionRef: r.transaction_ref, userId: r.user_id,
      type: r.type, amount: Number(r.amount) || 0,
      previousBalance: Number(r.previous_balance) || 0,
      updatedBalance: Number(r.updated_balance ?? r.balance_after) || 0,
      description: r.description, relatedOrderId: r.related_order_id,
      paymentId: r.payment_id, status: r.status, adminId: r.admin_id,
      adminName: r.admin_name, reason: r.reason, createdAt: r.created_at,
    } as WalletTransaction;
  }
  private mapRecharge(r: any): WalletRecharge {
    return {
      id: r.id, rechargeRef: r.recharge_ref ?? r.id, userId: r.user_id,
      username: r.username, email: r.email, amount: Number(r.amount) || 0,
      credits: Number(r.credits ?? r.amount), paymentMethod: r.payment_method,
      paymentGateway: r.payment_gateway, gatewayOrderId: r.gateway_order_id,
      gatewayPaymentId: r.gateway_payment_id, paymentId: r.payment_id,
      status: r.status, failureReason: r.failure_reason,
      createdAt: r.created_at, updatedAt: r.updated_at,
    } as WalletRecharge;
  }
  private mapPayment(r: any): PaymentRecord {
    return {
      id: r.id, transactionId: r.transaction_id, orderId: r.order_id,
      userId: r.user_id, username: r.username, email: r.email,
      productName: r.product_name, amount: Number(r.amount) || 0,
      walletAmount: r.wallet_amount, onlineAmount: r.online_amount,
      onlineTransactionId: r.online_transaction_id, paymentMethod: r.payment_method,
      paymentGateway: r.payment_gateway, paymentType: r.payment_type,
      status: r.status, gatewayOrderId: r.gateway_order_id,
      gatewayReference: r.gateway_reference, verifiedByBackend: r.verified_by_backend,
      failureReason: r.failure_reason, createdAt: r.created_at, updatedAt: r.updated_at,
    } as PaymentRecord;
  }
  private mapRefund(r: any): PaymentRefund {
    return {
      id: r.id, refundRef: r.refund_ref, paymentId: r.payment_id, orderId: r.order_id,
      userId: r.user_id, totalRefundAmount: r.total_refund_amount,
      walletRefundAmount: r.wallet_refund_amount, onlineRefundAmount: r.online_refund_amount,
      gatewayRefundId: r.gateway_refund_id, walletTransactionId: r.wallet_transaction_id,
      reason: r.reason, adminId: r.admin_id, adminName: r.admin_name,
      status: r.status, createdAt: r.created_at,
    } as PaymentRefund;
  }
  private mapOrder(r: any): Order {
    return {
      id: r.id, orderNumber: r.order_number, ign: r.ign, userId: r.user_id,
      username: r.username, email: r.email, items: r.items ?? [],
      totalAmount: Number(r.total_amount) || 0, currency: r.currency ?? 'INR',
      status: r.status, paymentMethod: r.payment_method, paymentGateway: r.payment_gateway,
      paymentType: r.payment_type, paymentId: r.payment_id,
      walletUsed: r.wallet_used, onlinePaid: r.online_paid, utr: r.utr,
      screenshotUrl: r.screenshot_url, edition: r.edition, createdAt: r.created_at,
    } as Order;
  }
  private mapCoupon(r: any): WalletCoupon {
    return {
      id: r.id, code: r.code, rewardAmount: Number(r.reward_amount) || 0,
      couponType: r.coupon_type, totalLimit: r.total_limit, perUserLimit: r.per_user_limit,
      redeemedCount: r.redeemed_count ?? 0, startDate: r.start_date, expiryDate: r.expiry_date,
      status: r.status, description: r.description, createdBy: r.created_by,
      createdAt: r.created_at, updatedAt: r.updated_at,
    } as WalletCoupon;
  }
  private mapRedemption(r: any): WalletCouponRedemption {
    return {
      id: r.id, couponId: r.coupon_id, couponCode: r.coupon_code,
      userId: r.user_id, username: r.username, userEmail: r.user_email,
      walletId: r.wallet_id, walletTransactionId: r.wallet_transaction_id,
      rewardAmount: Number(r.reward_amount) || 0,
      previousBalance: Number(r.previous_balance) || 0,
      newBalance: Number(r.new_balance) || 0, status: r.status,
      errorMessage: r.error_message, createdAt: r.created_at,
    } as WalletCouponRedemption;
  }

  /** Load all wallet/payment tables from Supabase into the in-memory cache. */
  public async readAsync(): Promise<WalletDbSchema> {
    if (this.cache) return this.cache;
    const admin = getSupabaseAdmin();
    if (admin) {
      try {
        const [wallets, tx, recharges, payments, refunds, orders, coupons, redemptions] = await Promise.all([
          admin.from('user_wallets').select('*'),
          admin.from('wallet_transactions').select('*'),
          admin.from('wallet_recharges').select('*'),
          admin.from('payments').select('*'),
          admin.from('payment_refunds').select('*'),
          admin.from('orders').select('*'),
          admin.from('wallet_coupons').select('*'),
          admin.from('wallet_coupon_redemptions').select('*'),
        ]);
        const firstError = [wallets, tx, recharges, payments, refunds, orders, coupons, redemptions].find((r) => r.error);
        if (firstError?.error) throw firstError.error;
        const hydrated: WalletDbSchema = {
          user_wallets: (wallets.data || []).map(this.mapWallet),
          wallet_transactions: (tx.data || []).map(this.mapTx),
          wallet_recharges: (recharges.data || []).map(this.mapRecharge),
          payments: (payments.data || []).map(this.mapPayment),
          payment_refunds: (refunds.data || []).map(this.mapRefund),
          orders: (orders.data || []).map(this.mapOrder),
          processedGatewayPaymentIds: [],
          wallet_coupons: (coupons.data || []).map(this.mapCoupon),
          wallet_coupon_redemptions: (redemptions.data || []).map(this.mapRedemption),
        };
        // Rebuild the processed-gateway-id set from successful payments so that
        // idempotency survives a restart (prevents double-crediting).
        hydrated.processedGatewayPaymentIds = (payments.data || [])
          .filter((p: any) => p.status === 'successful' && p.online_transaction_id)
          .map((p: any) => String(p.online_transaction_id));
        this.cache = hydrated;
        return hydrated;
      } catch (err: any) {
        console.error('[walletDb] Supabase read failed, falling back to local JSON:', err?.message || String(err));
      }
    }
    return this.readSync();
  }

  public readSync(): WalletDbSchema {
    if (this.cache) return this.cache;
    this.ensureDir();
    if (!fs.existsSync(DB_FILE)) {
      const initial = createEmptyDb();
      this.cache = initial;
      return initial;
    }
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<WalletDbSchema>;
      const hydrated: WalletDbSchema = {
        user_wallets: Array.isArray(parsed.user_wallets) ? parsed.user_wallets : [],
        wallet_transactions: Array.isArray(parsed.wallet_transactions) ? parsed.wallet_transactions : [],
        wallet_recharges: Array.isArray(parsed.wallet_recharges) ? parsed.wallet_recharges : [],
        payments: Array.isArray(parsed.payments) ? parsed.payments : [],
        payment_refunds: Array.isArray(parsed.payment_refunds) ? parsed.payment_refunds : [],
        orders: Array.isArray(parsed.orders) ? parsed.orders : [],
        processedGatewayPaymentIds: Array.isArray(parsed.processedGatewayPaymentIds) ? parsed.processedGatewayPaymentIds : [],
        wallet_coupons: Array.isArray(parsed.wallet_coupons) ? parsed.wallet_coupons : [],
        wallet_coupon_redemptions: Array.isArray(parsed.wallet_coupon_redemptions) ? parsed.wallet_coupon_redemptions : [],
      };
      this.cache = hydrated;
      return hydrated;
    } catch {
      const initial = createEmptyDb();
      this.cache = initial;
      return initial;
    }
  }

  private write(db: WalletDbSchema): void {
    this.cache = db;

    const admin = getSupabaseAdmin();
    if (admin) {
      if (db.user_wallets?.length) {
        admin.from('user_wallets').upsert(
          db.user_wallets.map((w) => ({
            user_id: w.userId,
            username: w.username,
            email: w.email,
            balance: w.balance,
            total_credited: w.totalCreditsAdded ?? 0,
            total_spent: w.totalCreditsSpent ?? 0,
            total_credits_added: w.totalCreditsAdded ?? 0,
            total_credits_spent: w.totalCreditsSpent ?? 0,
            total_refunds: w.totalRefunds ?? 0,
            total_promotional_credits: w.totalPromotionalCredits ?? 0,
            created_at: w.createdAt,
            updated_at: new Date().toISOString(),
          })),
          { onConflict: 'user_id' }
        ).then(({ error }) => {
          if (error) console.error('[walletDb] wallets upsert', error.message);
        });
      }

      if (db.wallet_transactions?.length) {
        admin.from('wallet_transactions').upsert(
          db.wallet_transactions.map((tx) => ({
            id: tx.id,
            user_id: tx.userId,
            transaction_ref: tx.transactionRef,
            type: tx.type,
            amount: tx.amount,
            previous_balance: tx.previousBalance,
            balance_after: tx.updatedBalance,
            updated_balance: tx.updatedBalance,
            description: tx.description,
            related_order_id: tx.relatedOrderId,
            payment_id: tx.paymentId,
            status: tx.status,
            admin_id: tx.adminId,
            admin_name: tx.adminName,
            reason: tx.reason,
            created_at: tx.createdAt,
          })),
          { onConflict: 'id' }
        ).then(({ error }) => {
          if (error) console.error('[walletDb] tx upsert', error.message);
        });
      }

      if (db.payments?.length) {
        admin.from('payments').upsert(
          db.payments.map((p) => ({
            id: p.id,
            transaction_id: p.transactionId,
            order_id: p.orderId,
            user_id: p.userId,
            username: p.username,
            email: p.email,
            product_name: p.productName,
            amount: p.amount,
            wallet_amount: p.walletAmount,
            online_amount: p.onlineAmount,
            online_transaction_id: p.onlineTransactionId,
            payment_method: p.paymentMethod,
            payment_gateway: p.paymentGateway,
            payment_type: p.paymentType,
            status: p.status,
            gateway_order_id: p.gatewayOrderId,
            gateway_reference: p.gatewayReference,
            verified_by_backend: p.verifiedByBackend,
            failure_reason: p.failureReason,
            created_at: p.createdAt,
            updated_at: p.updatedAt,
          })),
          { onConflict: 'id' }
        ).then(({ error }) => {
          if (error) console.error('[walletDb] payments upsert', error.message);
        });
      }

      if (db.orders?.length) {
        admin.from('orders').upsert(
          db.orders.map((o) => ({
            id: o.id,
            user_id: o.userId,
            username: o.username,
            email: o.email,
            items: o.items ?? [],
            total_amount: o.totalAmount,
            wallet_used: o.walletUsed,
            online_paid: o.onlinePaid,
            payment_type: o.paymentType,
            payment_id: o.paymentId,
            status: o.status,
            utr: o.utr,
            screenshot_url: o.screenshotUrl,
            edition: o.edition,
            created_at: o.createdAt,
          })),
          { onConflict: 'id' }
        ).then(({ error }) => {
          if (error) console.error('[walletDb] orders upsert', error.message);
        });
      }
    }

    try {
      this.ensureDir();
      const tmpFile = `${DB_FILE}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf-8');
      fs.renameSync(tmpFile, DB_FILE);
    } catch {
      // ignore
    }
  }

  public resetCacheFromDisk(): void {
    this.cache = null;
  }

  private emitEvent(ev: Omit<RealtimeWalletEvent, 'timestamp'>) {
    this.events.emit('wallet_event', {
      ...ev,
      timestamp: new Date().toISOString(),
    } satisfies RealtimeWalletEvent);
  }

  private getOrCreateWallet(
    db: WalletDbSchema,
    userId: string,
    username?: string,
    email?: string
  ): UserWallet {
    const cleanUid = userId.trim();
    const now = new Date().toISOString();
    let wallet = db.user_wallets.find((w) => w.userId === cleanUid);
    if (!wallet) {
      wallet = {
        userId: cleanUid,
        username: (username || '').trim() || (email ? email.split('@')[0] : 'Player'),
        email: (email || '').trim(),
        balance: 0,
        totalCreditsAdded: 0,
        totalCreditsSpent: 0,
        totalRefunds: 0,
        totalPromotionalCredits: 0,
        createdAt: now,
        updatedAt: now,
      };
      db.user_wallets.push(wallet);
    } else {
      if (username && username.trim() && wallet.username !== username.trim()) {
        wallet.username = username.trim();
      }
      if (email && email.trim() && wallet.email !== email.trim()) {
        wallet.email = email.trim();
      }
    }
    return wallet;
  }

  // ==================== USER WALLET QUERIES ====================

  public getUserBundle(session: SessionTokenPayload): {
    wallet: UserWallet;
    transactions: WalletTransaction[];
    recharges: WalletRecharge[];
    payments: PaymentRecord[];
    gatewayConfig: PaymentGatewayPublicConfig;
  } {
    const db = this.readSync();
    const existed = db.user_wallets.some((w) => w.userId === session.uid);
    const wallet = this.getOrCreateWallet(db, session.uid, session.name, session.email);
    if (!existed) {
      this.write(db);
    }

    const transactions = db.wallet_transactions
      .filter((t) => t.userId === session.uid)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const recharges = db.wallet_recharges
      .filter((r) => r.userId === session.uid)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const payments = db.payments
      .filter((p) => p.userId === session.uid)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return {
      wallet,
      transactions,
      recharges,
      payments,
      gatewayConfig: getPublicGatewayConfig(),
    };
  }

  // ==================== RECHARGE FLOW ====================

  public async initiateRecharge(
    session: SessionTokenPayload,
    input: { amount: number; paymentMethod?: GatewayPaymentMethod }
  ) {
    const validation = validateRechargeAmount(input.amount);
    if (!validation.valid) {
      return { error: validation.error || 'Invalid recharge amount.', status: 400 as const };
    }

    const db = this.readSync();
    const wallet = this.getOrCreateWallet(db, session.uid, session.name, session.email);
    const rechargeId = genId('RCH');
    const paymentId = genId('PAY');
    const now = new Date().toISOString();

    const gwOrder = await createGatewayOrder({
      amountInr: validation.amount,
      receipt: rechargeId,
      userId: session.uid,
      purpose: 'recharge',
      notes: {
        userId: session.uid,
        username: wallet.username,
        rechargeId,
      },
    });

    if ('error' in gwOrder) {
      return { error: gwOrder.error, status: 400 as const };
    }

    const method: GatewayPaymentMethod = 'upi';

    const recharge: WalletRecharge = {
      id: rechargeId,
      rechargeRef: rechargeId,
      userId: session.uid,
      username: wallet.username,
      email: wallet.email,
      amount: validation.amount,
      credits: validation.amount, // 1 Wallet Credit = ₹1 INR
      paymentMethod: method,
      paymentGateway: 'razorpay',
      gatewayOrderId: gwOrder.challenge.gatewayOrderId,
      paymentId,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };

    const payment: PaymentRecord = {
      id: paymentId,
      transactionId: gwOrder.challenge.gatewayOrderId,
      userId: session.uid,
      username: wallet.username,
      email: wallet.email,
      productName: `Wallet Recharge (${validation.amount} Credits)`,
      amount: validation.amount,
      walletAmount: 0,
      onlineAmount: validation.amount,
      paymentMethod: method,
      paymentGateway: 'razorpay',
      paymentType: 'wallet_recharge',
      status: 'pending',
      gatewayOrderId: gwOrder.challenge.gatewayOrderId,
      verifiedByBackend: false,
      createdAt: now,
      updatedAt: now,
    };

    db.wallet_recharges.unshift(recharge);
    db.payments.unshift(payment);
    this.write(db);
    this.emitEvent({ type: 'recharge_updated', userId: session.uid, paymentId });

    return {
      recharge,
      payment,
      gatewayOrder: gwOrder.challenge,
    };
  }

  public verifyAndCreditRecharge(
    session: SessionTokenPayload,
    input: {
      rechargeId: string;
      gatewayOrderId: string;
      gatewayPaymentId: string;
      signature: string;
      challengeToken?: string;
      paymentMethod?: string;
    }
  ) {
    const db = this.readSync();
    const recharge = db.wallet_recharges.find(
      (r) => r.id === input.rechargeId && r.userId === session.uid
    );
    if (!recharge) {
      return { error: 'Wallet recharge record not found.', status: 404 as const };
    }

    const wallet = this.getOrCreateWallet(db, session.uid, session.name, session.email);
    const payment = db.payments.find((p) => p.id === recharge.paymentId);

    // Idempotency guard: if this exact recharge was already verified & credited, do NOT credit twice
    if (recharge.status === 'successful') {
      return {
        alreadyProcessed: true,
        wallet,
        recharge,
        payment,
      };
    }

    if (recharge.gatewayOrderId !== input.gatewayOrderId) {
      return { error: 'Gateway Order ID mismatch for this recharge.', status: 400 as const };
    }

    const cleanGwPayId = (input.gatewayPaymentId || '').trim();
    if (!cleanGwPayId) {
      return { error: 'Gateway Payment ID is required.', status: 400 as const };
    }

    if (db.processedGatewayPaymentIds.includes(cleanGwPayId)) {
      return {
        error: 'Duplicate payment gateway transaction ID rejected (replay prevented).',
        status: 409 as const,
      };
    }

    const sigCheck = verifyGatewaySignature({
      gatewayOrderId: input.gatewayOrderId,
      gatewayPaymentId: cleanGwPayId,
      signature: input.signature,
      amountInr: recharge.amount,
      userId: session.uid,
      challengeToken: input.challengeToken,
    });

    if (!sigCheck.ok) {
      return { error: sigCheck.error || 'Payment signature verification failed.', status: 400 as const };
    }

    const now = new Date().toISOString();
    const prevBalance = wallet.balance;
    const nextBalance = roundCurrency(prevBalance + recharge.credits);
    const methodLabel = (input.paymentMethod || recharge.paymentMethod || 'upi').toLowerCase();

    db.processedGatewayPaymentIds.push(cleanGwPayId);

    wallet.balance = nextBalance;
    wallet.totalCreditsAdded = roundCurrency(wallet.totalCreditsAdded + recharge.credits);
    wallet.updatedAt = now;

    recharge.status = 'successful';
    recharge.paymentMethod = methodLabel;
    recharge.gatewayPaymentId = cleanGwPayId;
    recharge.updatedAt = now;

    if (payment) {
      payment.status = 'successful';
      payment.paymentMethod = methodLabel;
      payment.transactionId = cleanGwPayId;
      payment.onlineTransactionId = cleanGwPayId;
      payment.gatewayReference = cleanGwPayId;
      payment.verifiedByBackend = true;
      payment.updatedAt = now;
    }

    const tx: WalletTransaction = {
      id: genId('WTX'),
      transactionRef: cleanGwPayId,
      userId: session.uid,
      type: 'wallet_recharge',
      amount: recharge.credits,
      previousBalance: prevBalance,
      updatedBalance: nextBalance,
      description: `Wallet recharge via ${methodLabel.toUpperCase()} (${cleanGwPayId})`,
      paymentId: payment?.id,
      status: 'successful',
      createdAt: now,
    };
    db.wallet_transactions.unshift(tx);

    this.write(db);
    this.emitEvent({ type: 'wallet_updated', userId: session.uid, paymentId: payment?.id });

    return {
      alreadyProcessed: false,
      wallet,
      recharge,
      payment,
      transaction: tx,
    };
  }

  public failRecharge(
    session: SessionTokenPayload,
    input: { rechargeId: string; reason?: string; cancelled?: boolean }
  ) {
    const db = this.readSync();
    const recharge = db.wallet_recharges.find(
      (r) => r.id === input.rechargeId && r.userId === session.uid
    );
    if (!recharge) {
      return { error: 'Recharge record not found.', status: 404 as const };
    }
    if (recharge.status === 'successful') {
      return { error: 'Cannot fail an already completed recharge.', status: 409 as const };
    }

    const now = new Date().toISOString();
    const nextStatus = input.cancelled ? 'cancelled' : 'failed';
    const cleanReason =
      (input.reason || '').trim() ||
      (input.cancelled ? 'Payment cancelled by user' : 'Online payment failed');

    recharge.status = nextStatus;
    recharge.failureReason = cleanReason;
    recharge.updatedAt = now;

    const payment = db.payments.find((p) => p.id === recharge.paymentId);
    if (payment && payment.status !== 'successful') {
      payment.status = nextStatus;
      payment.failureReason = cleanReason;
      payment.updatedAt = now;
    }

    const wallet = this.getOrCreateWallet(db, session.uid, session.name, session.email);
    const tx: WalletTransaction = {
      id: genId('WTX'),
      transactionRef: recharge.rechargeRef,
      userId: session.uid,
      type: 'wallet_recharge',
      amount: recharge.amount,
      previousBalance: wallet.balance,
      updatedBalance: wallet.balance,
      description: `Wallet recharge ${nextStatus}: ${cleanReason}`,
      paymentId: payment?.id,
      status: nextStatus,
      createdAt: now,
    };
    db.wallet_transactions.unshift(tx);

    this.write(db);
    this.emitEvent({ type: 'recharge_updated', userId: session.uid, paymentId: payment?.id });
    return { recharge, payment };
  }

  public recordManualUpiRecharge(
    session: SessionTokenPayload,
    input: {
      amount: number;
      utr: string;
      screenshotUrl?: string;
      ign?: string;
      orderNumber?: string;
    }
  ) {
    const validation = validateRechargeAmount(input.amount);
    if (!validation.valid) {
      return { error: validation.error || 'Invalid recharge amount.', status: 400 as const };
    }
    const cleanUtr = (input.utr || '').trim();
    if (!cleanUtr || cleanUtr.length < 8) {
      return { error: 'Valid UTR / Reference ID is required.', status: 400 as const };
    }

    const db = this.readSync();
    const wallet = this.getOrCreateWallet(db, session.uid, session.name, session.email);
    const rechargeId = genId('RCH');
    const paymentId = genId('PAY');
    const now = new Date().toISOString();

    const recharge: WalletRecharge = {
      id: rechargeId,
      rechargeRef: (input.orderNumber || '').trim() || rechargeId,
      userId: session.uid,
      username: wallet.username,
      email: wallet.email,
      amount: validation.amount,
      credits: validation.amount,
      paymentMethod: 'upi_qr',
      paymentGateway: 'wonderpay_upi_qr',
      gatewayOrderId: (input.orderNumber || '').trim() || rechargeId,
      gatewayPaymentId: cleanUtr,
      paymentId,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };

    const payment: PaymentRecord = {
      id: paymentId,
      transactionId: cleanUtr,
      userId: session.uid,
      username: wallet.username,
      email: wallet.email,
      productName: `Wallet Recharge (${validation.amount} Credits)`,
      amount: validation.amount,
      walletAmount: 0,
      onlineAmount: validation.amount,
      onlineTransactionId: cleanUtr,
      paymentMethod: 'upi_qr',
      paymentGateway: 'wonderpay_upi_qr',
      paymentType: 'wallet_recharge',
      status: 'pending',
      gatewayOrderId: (input.orderNumber || '').trim() || rechargeId,
      gatewayReference: cleanUtr,
      verifiedByBackend: false,
      createdAt: now,
      updatedAt: now,
    };

    db.wallet_recharges.unshift(recharge);
    db.payments.unshift(payment);
    this.write(db);

    this.emitEvent({ type: 'recharge_updated', userId: session.uid, paymentId });
    this.emitEvent({ type: 'payment_updated', userId: session.uid, paymentId });

    return { recharge, payment };
  }

  // ==================== STORE CHECKOUT FLOWS ====================

  public purchaseWithFullWallet(
    session: SessionTokenPayload,
    input: {
      totalAmount: number;
      items: Order['items'];
      ign: string;
      edition?: string;
      orderNumber?: string;
    }
  ) {
    const cleanIgn = (input.ign || '').trim();
    if (!cleanIgn || cleanIgn === '.') {
      return { error: 'Minecraft In-Game Name (IGN) is required.', status: 400 as const };
    }
    if (!Array.isArray(input.items) || input.items.length === 0) {
      return { error: 'Order items cannot be empty.', status: 400 as const };
    }

    const db = this.readSync();
    const wallet = this.getOrCreateWallet(db, session.uid, session.name, session.email);
    const breakdown = calculateCombinedCheckoutBreakdown(
      input.totalAmount,
      wallet.balance,
      'full_wallet'
    );

    if (!breakdown.valid) {
      return { error: breakdown.error || 'Insufficient wallet credits.', status: 400 as const };
    }

    const now = new Date().toISOString();
    const orderNumber =
      (input.orderNumber || '').trim() ||
      `WKP-${now.slice(0, 10).replace(/-/g, '')}-${crypto
        .randomBytes(2)
        .toString('hex')
        .toUpperCase()}`;
    const orderId = genId('ORD');
    const paymentId = genId('PAY');
    const productSummary = input.items.map((i) => `${i.qty}x ${i.name}`).join(', ');

    const prevBalance = wallet.balance;
    const nextBalance = breakdown.walletRemainingAfter;

    wallet.balance = nextBalance;
    wallet.totalCreditsSpent = roundCurrency(wallet.totalCreditsSpent + breakdown.walletUsed);
    wallet.updatedAt = now;

    const order: Order = {
      id: orderId,
      orderNumber,
      ign: cleanIgn,
      userId: session.uid,
      username: wallet.username,
      email: wallet.email,
      items: input.items,
      totalAmount: breakdown.totalAmount,
      currency: 'INR',
      status: 'completed',
      paymentMethod: 'Wallet Credits',
      paymentGateway: 'wallet',
      paymentType: 'wallet_product',
      paymentId,
      walletUsed: breakdown.walletUsed,
      onlinePaid: 0,
      createdAt: now,
      edition: input.edition,
    };

    const payment: PaymentRecord = {
      id: paymentId,
      transactionId: `WAL-${orderNumber}`,
      orderId,
      userId: session.uid,
      username: wallet.username,
      email: wallet.email,
      productName: productSummary,
      amount: breakdown.totalAmount,
      walletAmount: breakdown.walletUsed,
      onlineAmount: 0,
      paymentMethod: 'wallet',
      paymentGateway: 'wallet',
      paymentType: 'wallet_product',
      status: 'successful',
      verifiedByBackend: true,
      createdAt: now,
      updatedAt: now,
    };

    const tx: WalletTransaction = {
      id: genId('WTX'),
      transactionRef: orderNumber,
      userId: session.uid,
      type: 'product_purchase',
      amount: breakdown.walletUsed,
      previousBalance: prevBalance,
      updatedBalance: nextBalance,
      description: `Store purchase (${productSummary})`,
      relatedOrderId: orderNumber,
      paymentId,
      status: 'successful',
      createdAt: now,
    };

    db.orders.unshift(order);
    db.payments.unshift(payment);
    db.wallet_transactions.unshift(tx);
    this.write(db);

    this.emitEvent({ type: 'wallet_updated', userId: session.uid, paymentId });
    this.emitEvent({ type: 'order_updated', userId: session.uid, paymentId });

    return {
      order,
      payment,
      transaction: tx,
      wallet,
    };
  }

  public async initiateGatewayCheckout(
    session: SessionTokenPayload,
    input: {
      mode: 'direct_online' | 'combined';
      totalAmount: number;
      items: Order['items'];
      ign: string;
      edition?: string;
      paymentMethod?: GatewayPaymentMethod;
      orderNumber?: string;
    }
  ) {
    const cleanIgn = (input.ign || '').trim();
    if (!cleanIgn || cleanIgn === '.') {
      return { error: 'Minecraft In-Game Name (IGN) is required.', status: 400 as const };
    }
    if (!Array.isArray(input.items) || input.items.length === 0) {
      return { error: 'Order items cannot be empty.', status: 400 as const };
    }

    const db = this.readSync();
    const wallet = this.getOrCreateWallet(db, session.uid, session.name, session.email);
    const breakdown = calculateCombinedCheckoutBreakdown(
      input.totalAmount,
      wallet.balance,
      input.mode
    );

    if (!breakdown.valid) {
      return { error: breakdown.error || 'Invalid checkout breakdown.', status: 400 as const };
    }

    // Edge case: Combined checkout when wallet covers 100% -> handle immediately as full wallet
    if (breakdown.onlineDue <= 0 && input.mode === 'combined') {
      const fullRes = this.purchaseWithFullWallet(session, {
        totalAmount: breakdown.totalAmount,
        items: input.items,
        ign: cleanIgn,
        edition: input.edition,
        orderNumber: input.orderNumber,
      });
      if ('error' in fullRes) return fullRes;
      return {
        settledViaFullWallet: true as const,
        ...fullRes,
      };
    }

    const now = new Date().toISOString();
    const orderNumber =
      (input.orderNumber || '').trim() ||
      `WKP-${now.slice(0, 10).replace(/-/g, '')}-${crypto
        .randomBytes(2)
        .toString('hex')
        .toUpperCase()}`;
    const orderId = genId('ORD');
    const paymentId = genId('PAY');

    const gwOrder = await createGatewayOrder({
      amountInr: breakdown.onlineDue,
      receipt: orderNumber,
      userId: session.uid,
      purpose: 'checkout',
      notes: {
        userId: session.uid,
        orderId,
        paymentId,
        mode: input.mode,
      },
    });

    if ('error' in gwOrder) {
      return { error: gwOrder.error, status: 400 as const };
    }

    const method: GatewayPaymentMethod = 'upi';
    const productSummary = input.items.map((i) => `${i.qty}x ${i.name}`).join(', ');
    const paymentType = input.mode === 'combined' ? 'combined' : 'direct_product';

    const order: Order = {
      id: orderId,
      orderNumber,
      ign: cleanIgn,
      userId: session.uid,
      username: wallet.username,
      email: wallet.email,
      items: input.items,
      totalAmount: breakdown.totalAmount,
      currency: 'INR',
      status: 'pending',
      paymentMethod: input.mode === 'combined' ? `wallet+${method}` : method,
      paymentGateway: 'razorpay',
      paymentType,
      paymentId,
      walletUsed: breakdown.walletUsed,
      onlinePaid: breakdown.onlineDue,
      createdAt: now,
      edition: input.edition,
    };

    const payment: PaymentRecord = {
      id: paymentId,
      transactionId: gwOrder.challenge.gatewayOrderId,
      orderId,
      userId: session.uid,
      username: wallet.username,
      email: wallet.email,
      productName: productSummary,
      amount: breakdown.totalAmount,
      walletAmount: breakdown.walletUsed,
      onlineAmount: breakdown.onlineDue,
      paymentMethod: input.mode === 'combined' ? `wallet+${method}` : method,
      paymentGateway: 'razorpay',
      paymentType,
      status: 'pending',
      gatewayOrderId: gwOrder.challenge.gatewayOrderId,
      verifiedByBackend: false,
      createdAt: now,
      updatedAt: now,
    };

    db.orders.unshift(order);
    db.payments.unshift(payment);
    this.write(db);
    this.emitEvent({ type: 'payment_updated', userId: session.uid, paymentId });

    return {
      settledViaFullWallet: false as const,
      order,
      payment,
      breakdown,
      gatewayOrder: gwOrder.challenge,
    };
  }

  public verifyAndCompleteGatewayCheckout(
    session: SessionTokenPayload,
    input: {
      paymentId: string;
      gatewayOrderId: string;
      gatewayPaymentId: string;
      signature: string;
      challengeToken?: string;
      paymentMethod?: string;
    }
  ) {
    const db = this.readSync();
    const payment = db.payments.find(
      (p) => p.id === input.paymentId && p.userId === session.uid
    );
    if (!payment) {
      return { error: 'Payment record not found.', status: 404 as const };
    }

    const wallet = this.getOrCreateWallet(db, session.uid, session.name, session.email);
    const order = db.orders.find((o) => o.id === payment.orderId || o.paymentId === payment.id);

    // Idempotency guard
    if (payment.status === 'successful') {
      return {
        alreadyProcessed: true,
        payment,
        order,
        wallet,
      };
    }

    if (payment.gatewayOrderId !== input.gatewayOrderId) {
      return { error: 'Gateway Order ID mismatch for checkout payment.', status: 400 as const };
    }

    const cleanGwPayId = (input.gatewayPaymentId || '').trim();
    if (!cleanGwPayId) {
      return { error: 'Gateway Payment ID is required.', status: 400 as const };
    }

    if (db.processedGatewayPaymentIds.includes(cleanGwPayId)) {
      return {
        error: 'Duplicate gateway payment ID blocked.',
        status: 409 as const,
      };
    }

    const onlineDue = roundCurrency(payment.onlineAmount ?? payment.amount);
    const sigCheck = verifyGatewaySignature({
      gatewayOrderId: input.gatewayOrderId,
      gatewayPaymentId: cleanGwPayId,
      signature: input.signature,
      amountInr: onlineDue,
      userId: session.uid,
      challengeToken: input.challengeToken,
    });

    if (!sigCheck.ok) {
      return { error: sigCheck.error || 'Gateway signature verification failed.', status: 400 as const };
    }

    const walletUsed = roundCurrency(payment.walletAmount ?? 0);
    if (payment.paymentType === 'combined' && walletUsed > 0) {
      if (wallet.balance < walletUsed) {
        return {
          error: `Insufficient wallet balance to finalize combined payment (need ${walletUsed} credits, have ${wallet.balance}).`,
          status: 409 as const,
        };
      }
    }

    const now = new Date().toISOString();
    const chosenMethod = (input.paymentMethod || 'upi').toLowerCase();
    db.processedGatewayPaymentIds.push(cleanGwPayId);

    let walletTx: WalletTransaction | undefined;
    if (payment.paymentType === 'combined' && walletUsed > 0) {
      const prevBal = wallet.balance;
      const nextBal = roundCurrency(prevBal - walletUsed);
      wallet.balance = nextBal;
      wallet.totalCreditsSpent = roundCurrency(wallet.totalCreditsSpent + walletUsed);
      wallet.updatedAt = now;

      walletTx = {
        id: genId('WTX'),
        transactionRef: cleanGwPayId,
        userId: session.uid,
        type: 'product_purchase',
        amount: walletUsed,
        previousBalance: prevBal,
        updatedBalance: nextBal,
        description: `Combined checkout (${payment.productName || 'Store Order'}) + Online ₹${onlineDue}`,
        relatedOrderId: order?.orderNumber || payment.orderId,
        paymentId: payment.id,
        status: 'successful',
        createdAt: now,
      };
      db.wallet_transactions.unshift(walletTx);
    }

    payment.status = 'successful';
    payment.paymentMethod =
      payment.paymentType === 'combined' ? `wallet+${chosenMethod}` : chosenMethod;
    payment.transactionId = cleanGwPayId;
    payment.onlineTransactionId = cleanGwPayId;
    payment.gatewayReference = cleanGwPayId;
    payment.verifiedByBackend = true;
    payment.updatedAt = now;

    if (order) {
      order.status = 'completed';
      order.paymentMethod = payment.paymentMethod;
    }

    this.write(db);
    this.emitEvent({ type: 'wallet_updated', userId: session.uid, paymentId: payment.id });
    this.emitEvent({ type: 'payment_updated', userId: session.uid, paymentId: payment.id });
    this.emitEvent({ type: 'order_updated', userId: session.uid, paymentId: payment.id });

    return {
      alreadyProcessed: false,
      payment,
      order,
      wallet,
      transaction: walletTx,
    };
  }

  public failGatewayCheckout(
    session: SessionTokenPayload,
    input: { paymentId: string; reason?: string; cancelled?: boolean }
  ) {
    const db = this.readSync();
    const payment = db.payments.find(
      (p) => p.id === input.paymentId && p.userId === session.uid
    );
    if (!payment) {
      return { error: 'Payment record not found.', status: 404 as const };
    }
    if (payment.status === 'successful') {
      return { error: 'Cannot fail an already successful payment.', status: 409 as const };
    }

    const now = new Date().toISOString();
    const nextStatus = input.cancelled ? 'cancelled' : 'failed';
    const cleanReason =
      (input.reason || '').trim() ||
      (input.cancelled ? 'Checkout cancelled by user' : 'Online gateway payment failed');

    payment.status = nextStatus;
    payment.failureReason = cleanReason;
    payment.updatedAt = now;

    const order = db.orders.find((o) => o.id === payment.orderId || o.paymentId === payment.id);
    if (order && order.status === 'pending') {
      order.status = 'failed';
    }

    this.write(db);
    this.emitEvent({ type: 'payment_updated', userId: session.uid, paymentId: payment.id });
    this.emitEvent({ type: 'order_updated', userId: session.uid, paymentId: payment.id });

    return { payment, order };
  }

  public recordManualUpiCheckout(
    session: SessionTokenPayload | null,
    input: {
      mode: 'direct_online' | 'combined';
      totalAmount: number;
      items: Order['items'];
      ign: string;
      edition?: string;
      orderNumber: string;
      utr: string;
      screenshotUrl?: string;
    }
  ) {
    const cleanUtr = (input.utr || '').trim();
    if (!cleanUtr || cleanUtr.length < 8) {
      return { error: 'Valid UTR / Reference ID is required.', status: 400 as const };
    }
    const cleanIgn = (input.ign || '').trim();
    if (!cleanIgn || cleanIgn === '.') {
      return { error: 'Minecraft IGN is required.', status: 400 as const };
    }

    const db = this.readSync();
    const uid = session?.uid || `guest_${cleanIgn}`;
    let walletUsed = 0;
    let onlineDue = roundCurrency(input.totalAmount);

    if (input.mode === 'combined') {
      if (!session) {
        return { error: 'Sign in to use wallet credits in combined mode.', status: 401 as const };
      }
      const wallet = this.getOrCreateWallet(db, session.uid, session.name, session.email);
      const breakdown = calculateCombinedCheckoutBreakdown(
        input.totalAmount,
        wallet.balance,
        'combined'
      );
      if (!breakdown.valid) {
        return { error: breakdown.error || 'Unable to compute combined split.', status: 400 as const };
      }
      walletUsed = breakdown.walletUsed;
      onlineDue = breakdown.onlineDue;
    }

    const now = new Date().toISOString();
    const orderId = genId('ORD');
    const paymentId = genId('PAY');
    const productSummary = input.items.map((i) => `${i.qty}x ${i.name}`).join(', ');
    const paymentType = walletUsed > 0 ? 'combined' : 'direct_product';

    if (session && walletUsed > 0) {
      const wallet = this.getOrCreateWallet(db, session.uid, session.name, session.email);
      const prevBal = wallet.balance;
      const nextBal = roundCurrency(prevBal - walletUsed);
      wallet.balance = nextBal;
      wallet.totalCreditsSpent = roundCurrency(wallet.totalCreditsSpent + walletUsed);
      wallet.updatedAt = now;

      const walletTx: WalletTransaction = {
        id: genId('WTX'),
        transactionRef: cleanUtr,
        userId: session.uid,
        type: 'product_purchase',
        amount: walletUsed,
        previousBalance: prevBal,
        updatedBalance: nextBal,
        description: `Combined UPI QR order (${productSummary}) + UPI ₹${onlineDue}`,
        relatedOrderId: input.orderNumber,
        paymentId,
        status: 'successful',
        createdAt: now,
      };
      db.wallet_transactions.unshift(walletTx);
    }

    const order: Order = {
      id: orderId,
      orderNumber: input.orderNumber,
      ign: cleanIgn,
      userId: uid,
      username: session?.name || cleanIgn,
      email: session?.email || '',
      items: input.items,
      totalAmount: roundCurrency(input.totalAmount),
      currency: 'INR',
      status: 'pending',
      paymentMethod: walletUsed > 0 ? 'wallet+upi_qr' : 'upi_qr',
      paymentGateway: 'wonderpay_upi_qr',
      paymentType,
      paymentId,
      walletUsed,
      onlinePaid: onlineDue,
      utr: cleanUtr,
      screenshotUrl: input.screenshotUrl,
      createdAt: now,
      edition: input.edition,
    };

    const payment: PaymentRecord = {
      id: paymentId,
      transactionId: cleanUtr,
      orderId,
      userId: uid,
      username: session?.name || cleanIgn,
      email: session?.email || '',
      productName: productSummary,
      amount: roundCurrency(input.totalAmount),
      walletAmount: walletUsed,
      onlineAmount: onlineDue,
      onlineTransactionId: cleanUtr,
      paymentMethod: walletUsed > 0 ? 'wallet+upi_qr' : 'upi_qr',
      paymentGateway: 'wonderpay_upi_qr',
      paymentType,
      status: 'pending',
      gatewayReference: cleanUtr,
      verifiedByBackend: false,
      createdAt: now,
      updatedAt: now,
    };

    db.orders.unshift(order);
    db.payments.unshift(payment);
    this.write(db);

    this.emitEvent({ type: 'payment_updated', userId: uid, paymentId });
    this.emitEvent({ type: 'order_updated', userId: uid, paymentId });

    return { order, payment };
  }

  // ==================== RAZORPAY WEBHOOK HANDLER ====================

  public handleRazorpayWebhook(rawBody: string, signatureHeader: string | undefined, body: any) {
    if (!verifyRazorpayWebhookSignature(rawBody, signatureHeader)) {
      return { ok: false, status: 400 as const, error: 'Invalid webhook signature.' };
    }

    const event = body?.event as string | undefined;
    const payEntity = body?.payload?.payment?.entity;
    const gatewayOrderId = payEntity?.order_id as string | undefined;
    const gatewayPaymentId = payEntity?.id as string | undefined;
    const method = (payEntity?.method as string | undefined) || 'upi';

    if (!gatewayOrderId || !gatewayPaymentId) {
      return { ok: true, status: 200 as const, ignored: true };
    }

    const db = this.readSync();

    if (event === 'payment.captured') {
      if (db.processedGatewayPaymentIds.includes(gatewayPaymentId)) {
        return { ok: true, status: 200 as const, alreadyProcessed: true };
      }

      const recharge = db.wallet_recharges.find((r) => r.gatewayOrderId === gatewayOrderId);
      if (recharge && recharge.status !== 'successful') {
        const fakeUserSess: SessionTokenPayload = {
          kind: 'user',
          uid: recharge.userId,
          email: recharge.email,
          name: recharge.username,
          isAdmin: false,
          isOwner: false,
          exp: Date.now() + 60000,
        };
        const wallet = this.getOrCreateWallet(db, fakeUserSess.uid, fakeUserSess.name, fakeUserSess.email);
        const now = new Date().toISOString();
        const prevBal = wallet.balance;
        const nextBal = roundCurrency(prevBal + recharge.credits);
        db.processedGatewayPaymentIds.push(gatewayPaymentId);
        wallet.balance = nextBal;
        wallet.totalCreditsAdded = roundCurrency(wallet.totalCreditsAdded + recharge.credits);
        wallet.updatedAt = now;
        recharge.status = 'successful';
        recharge.gatewayPaymentId = gatewayPaymentId;
        recharge.updatedAt = now;
        const payment = db.payments.find((p) => p.id === recharge.paymentId);
        if (payment) {
          payment.status = 'successful';
          payment.paymentMethod = method;
          payment.transactionId = gatewayPaymentId;
          payment.onlineTransactionId = gatewayPaymentId;
          payment.verifiedByBackend = true;
          payment.updatedAt = now;
        }
        db.wallet_transactions.unshift({
          id: genId('WTX'),
          transactionRef: gatewayPaymentId,
          userId: recharge.userId,
          type: 'wallet_recharge',
          amount: recharge.credits,
          previousBalance: prevBal,
          updatedBalance: nextBal,
          description: `Wallet recharge verified via Razorpay webhook (${gatewayPaymentId})`,
          paymentId: payment?.id,
          status: 'successful',
          createdAt: now,
        });
        this.write(db);
        this.emitEvent({ type: 'wallet_updated', userId: recharge.userId, paymentId: payment?.id });
        return { ok: true, status: 200 as const };
      }

      const checkoutPayment = db.payments.find(
        (p) => p.gatewayOrderId === gatewayOrderId && p.paymentType !== 'wallet_recharge'
      );
      if (checkoutPayment && checkoutPayment.status !== 'successful') {
        const now = new Date().toISOString();
        const wallet = this.getOrCreateWallet(db, checkoutPayment.userId, checkoutPayment.username, checkoutPayment.email);
        const walletUsed = roundCurrency(checkoutPayment.walletAmount ?? 0);
        if (checkoutPayment.paymentType === 'combined' && walletUsed > 0 && wallet.balance >= walletUsed) {
          const prevBal = wallet.balance;
          const nextBal = roundCurrency(prevBal - walletUsed);
          wallet.balance = nextBal;
          wallet.totalCreditsSpent = roundCurrency(wallet.totalCreditsSpent + walletUsed);
          wallet.updatedAt = now;
          db.wallet_transactions.unshift({
            id: genId('WTX'),
            transactionRef: gatewayPaymentId,
            userId: checkoutPayment.userId,
            type: 'product_purchase',
            amount: walletUsed,
            previousBalance: prevBal,
            updatedBalance: nextBal,
            description: `Combined checkout settled via webhook (${checkoutPayment.productName || 'Order'})`,
            relatedOrderId: checkoutPayment.orderId,
            paymentId: checkoutPayment.id,
            status: 'successful',
            createdAt: now,
          });
        }
        db.processedGatewayPaymentIds.push(gatewayPaymentId);
        checkoutPayment.status = 'successful';
        checkoutPayment.paymentMethod =
          checkoutPayment.paymentType === 'combined' ? `wallet+${method}` : method;
        checkoutPayment.transactionId = gatewayPaymentId;
        checkoutPayment.onlineTransactionId = gatewayPaymentId;
        checkoutPayment.verifiedByBackend = true;
        checkoutPayment.updatedAt = now;
        const order = db.orders.find((o) => o.id === checkoutPayment.orderId);
        if (order) order.status = 'completed';
        this.write(db);
        this.emitEvent({ type: 'payment_updated', userId: checkoutPayment.userId, paymentId: checkoutPayment.id });
        this.emitEvent({ type: 'order_updated', userId: checkoutPayment.userId, paymentId: checkoutPayment.id });
      }
    } else if (event === 'payment.failed') {
      const payment = db.payments.find((p) => p.gatewayOrderId === gatewayOrderId);
      if (payment && payment.status === 'pending') {
        payment.status = 'failed';
        payment.failureReason = payEntity?.error_description || 'Razorpay webhook reported payment failed';
        payment.updatedAt = new Date().toISOString();
        this.write(db);
        this.emitEvent({ type: 'payment_updated', userId: payment.userId, paymentId: payment.id });
      }
    }

    return { ok: true, status: 200 as const };
  }

  // ==================== ORDERS QUERIES & ADMIN ====================

  public listOrdersForSession(session: SessionTokenPayload): Order[] {
    const db = this.readSync();
    if (session.kind === 'staff') {
      return [...db.orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    return db.orders
      .filter((o) => o.userId === session.uid)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  public updateOrderStatusByAdmin(orderId: string, status: Order['status']) {
    const db = this.readSync();
    const order = db.orders.find((o) => o.id === orderId);
    if (!order) return null;
    order.status = status;
    this.write(db);
    this.emitEvent({ type: 'order_updated', userId: order.userId, paymentId: order.paymentId });
    return order;
  }

  public deleteOrderByAdmin(orderId: string): boolean {
    const db = this.readSync();
    const idx = db.orders.findIndex((o) => o.id === orderId);
    if (idx === -1) return false;
    const removed = db.orders[idx];
    db.orders.splice(idx, 1);
    this.write(db);
    this.emitEvent({ type: 'order_updated', userId: removed.userId });
    return true;
  }

  // ==================== ADMIN WALLET MANAGEMENT ====================

  public listAllWalletsForAdmin(): { wallets: UserWallet[]; overview: WalletOverviewStats } {
    const db = this.readSync();
    const wallets = [...db.user_wallets].sort((a, b) => b.balance - a.balance);
    return {
      wallets,
      overview: computeWalletOverviewStats(wallets),
    };
  }

  public getWalletDetailForAdmin(userId: string) {
    const db = this.readSync();
    const wallet = db.user_wallets.find((w) => w.userId === userId);
    if (!wallet) return null;
    return {
      wallet,
      transactions: db.wallet_transactions
        .filter((t) => t.userId === userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      recharges: db.wallet_recharges
        .filter((r) => r.userId === userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      payments: db.payments
        .filter((p) => p.userId === userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    };
  }

  public adjustWalletByAdmin(
    adminSession: SessionTokenPayload,
    input: {
      userId: string;
      action: AdminWalletAdjustmentAction;
      amount: number;
      reason: string;
      username?: string;
      email?: string;
    }
  ) {
    const cleanUid = (input.userId || '').trim();
    if (!cleanUid) {
      return { error: 'Target User ID is required.', status: 400 as const };
    }

    const db = this.readSync();
    const wallet = this.getOrCreateWallet(db, cleanUid, input.username, input.email);
    const calc = computeWalletAdjustment(wallet.balance, input.action, input.amount, input.reason);
    if (!calc.valid) {
      return { error: calc.error || 'Invalid adjustment.', status: 400 as const };
    }

    const now = new Date().toISOString();
    wallet.balance = calc.updatedBalance;
    wallet.updatedAt = now;

    if (input.action === 'admin_credit') {
      wallet.totalCreditsAdded = roundCurrency(wallet.totalCreditsAdded + calc.amount);
    } else if (input.action === 'promotional_credit') {
      wallet.totalCreditsAdded = roundCurrency(wallet.totalCreditsAdded + calc.amount);
      wallet.totalPromotionalCredits = roundCurrency(
        wallet.totalPromotionalCredits + calc.amount
      );
    }

    const tx: WalletTransaction = {
      id: genId('WTX'),
      transactionRef: genId('ADJ'),
      userId: cleanUid,
      type: input.action,
      amount: calc.amount,
      previousBalance: calc.previousBalance,
      updatedBalance: calc.updatedBalance,
      description: `${
        input.action === 'admin_debit'
          ? 'Manual Debit'
          : input.action === 'promotional_credit'
          ? 'Promotional Credit'
          : 'Manual Credit'
      }: ${input.reason.trim()}`,
      status: 'successful',
      adminId: adminSession.staffId || adminSession.uid,
      adminName: adminSession.name,
      reason: input.reason.trim(),
      createdAt: now,
    };

    db.wallet_transactions.unshift(tx);
    this.write(db);
    this.emitEvent({ type: 'wallet_updated', userId: cleanUid });

    return { wallet, transaction: tx };
  }

  // ==================== ADMIN PAYMENT MANAGEMENT ====================

  public listAllPaymentsForAdmin(): {
    payments: PaymentRecord[];
    refunds: PaymentRefund[];
    stats: PaymentDashboardStats;
    gatewayConfig: PaymentGatewayPublicConfig;
  } {
    const db = this.readSync();
    const payments = [...db.payments].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const refunds = [...db.payment_refunds].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return {
      payments,
      refunds,
      stats: computePaymentDashboardStats(payments),
      gatewayConfig: getPublicGatewayConfig(),
    };
  }

  public getPaymentDetailForAdmin(paymentId: string) {
    const db = this.readSync();
    const payment = db.payments.find((p) => p.id === paymentId);
    if (!payment) return null;
    const order = db.orders.find((o) => o.id === payment.orderId || o.paymentId === payment.id) || null;
    const recharge = db.wallet_recharges.find((r) => r.paymentId === payment.id) || null;
    const walletTransactions = db.wallet_transactions.filter((t) => t.paymentId === payment.id);
    const refunds = db.payment_refunds.filter((r) => r.paymentId === payment.id);
    return {
      payment,
      order,
      recharge,
      walletTransactions,
      refunds,
    };
  }

  public updatePaymentStatusByAdmin(
    paymentId: string,
    nextStatus: PaymentStatus,
    reason?: string
  ) {
    const db = this.readSync();
    const payment = db.payments.find((p) => p.id === paymentId);
    if (!payment) {
      return { error: 'Payment record not found.', status: 404 as const };
    }

    const check = canTransitionPaymentStatus(
      payment.status,
      nextStatus,
      Boolean(payment.verifiedByBackend)
    );
    if (!check.allowed) {
      return { error: check.reason || 'Status transition forbidden.', status: 403 as const };
    }

    payment.status = nextStatus;
    if (reason && reason.trim()) {
      payment.failureReason = reason.trim();
    }
    payment.updatedAt = new Date().toISOString();

    if (payment.orderId && (nextStatus === 'failed' || nextStatus === 'cancelled')) {
      const order = db.orders.find((o) => o.id === payment.orderId);
      if (order && order.status === 'pending') {
        order.status = 'failed';
      }
    }

    this.write(db);
    this.emitEvent({ type: 'payment_updated', userId: payment.userId, paymentId: payment.id });
    return { payment };
  }

  public async refundPaymentByAdmin(
    adminSession: SessionTokenPayload,
    paymentId: string,
    reason: string
  ) {
    const cleanReason = (reason || '').trim();
    if (!cleanReason) {
      return { error: 'A refund reason is required for audit logs.', status: 400 as const };
    }

    const db = this.readSync();
    const payment = db.payments.find((p) => p.id === paymentId);
    if (!payment) {
      return { error: 'Payment record not found.', status: 404 as const };
    }

    const wallet = this.getOrCreateWallet(db, payment.userId, payment.username, payment.email);
    const breakdown = computeEligibleRefundBreakdown(payment, db.payment_refunds, wallet.balance);
    if (!breakdown.eligible) {
      return { error: breakdown.error || 'Payment is not eligible for refund.', status: 409 as const };
    }

    let gatewayRefundId = '';
    if (breakdown.onlineRefundAmount > 0 && payment.paymentGateway === 'razorpay') {
      const gwRefund = await executeGatewayRefund({
        gatewayPaymentId: payment.onlineTransactionId || payment.transactionId,
        amountInr: breakdown.onlineRefundAmount,
        reason: cleanReason,
      });
      if ('error' in gwRefund) {
        return { error: gwRefund.error, status: 502 as const };
      }
      gatewayRefundId = gwRefund.gatewayRefundId;
    }

    const now = new Date().toISOString();
    const refundId = genId('REF');
    let walletTx: WalletTransaction | undefined;

    if (breakdown.walletRefundAmount > 0) {
      const prevBal = wallet.balance;
      const nextBal = roundCurrency(prevBal + breakdown.walletRefundAmount);
      wallet.balance = nextBal;
      wallet.totalRefunds = roundCurrency(wallet.totalRefunds + breakdown.walletRefundAmount);
      wallet.updatedAt = now;

      walletTx = {
        id: genId('WTX'),
        transactionRef: refundId,
        userId: payment.userId,
        type: 'refund',
        amount: breakdown.walletRefundAmount,
        previousBalance: prevBal,
        updatedBalance: nextBal,
        description: `Refund for ${payment.productName || payment.id} (${cleanReason})`,
        relatedOrderId: payment.orderId,
        paymentId: payment.id,
        status: 'successful',
        adminId: adminSession.staffId || adminSession.uid,
        adminName: adminSession.name,
        reason: cleanReason,
        createdAt: now,
      };
      db.wallet_transactions.unshift(walletTx);
    } else if (payment.paymentType === 'wallet_recharge' && breakdown.onlineRefundAmount > 0) {
      // Reversing an unused wallet recharge refunded back to original online gateway
      const prevBal = wallet.balance;
      const nextBal = roundCurrency(Math.max(0, prevBal - breakdown.onlineRefundAmount));
      wallet.balance = nextBal;
      wallet.updatedAt = now;

      walletTx = {
        id: genId('WTX'),
        transactionRef: refundId,
        userId: payment.userId,
        type: 'refund',
        amount: breakdown.onlineRefundAmount,
        previousBalance: prevBal,
        updatedBalance: nextBal,
        description: `Recharge refunded to online gateway (${cleanReason})`,
        paymentId: payment.id,
        status: 'refunded',
        adminId: adminSession.staffId || adminSession.uid,
        adminName: adminSession.name,
        reason: cleanReason,
        createdAt: now,
      };
      db.wallet_transactions.unshift(walletTx);

      const recharge = db.wallet_recharges.find((r) => r.paymentId === payment.id);
      if (recharge) {
        recharge.status = 'refunded';
        recharge.updatedAt = now;
      }
    }

    payment.status = 'refunded';
    payment.updatedAt = now;

    if (payment.orderId) {
      const order = db.orders.find((o) => o.id === payment.orderId || o.paymentId === payment.id);
      if (order) {
        order.status = 'refunded';
      }
    }

    const refund: PaymentRefund = {
      id: refundId,
      refundRef: refundId,
      paymentId: payment.id,
      orderId: payment.orderId,
      userId: payment.userId,
      totalRefundAmount: breakdown.totalRefundAmount,
      walletRefundAmount: breakdown.walletRefundAmount,
      onlineRefundAmount: breakdown.onlineRefundAmount,
      gatewayRefundId: gatewayRefundId || undefined,
      walletTransactionId: walletTx?.id,
      reason: cleanReason,
      adminId: adminSession.staffId || adminSession.uid,
      adminName: adminSession.name,
      status: 'successful',
      createdAt: now,
    };

    db.payment_refunds.unshift(refund);
    this.write(db);

    this.emitEvent({ type: 'refund_created', userId: payment.userId, paymentId: payment.id });
    this.emitEvent({ type: 'wallet_updated', userId: payment.userId, paymentId: payment.id });
    this.emitEvent({ type: 'payment_updated', userId: payment.userId, paymentId: payment.id });
    this.emitEvent({ type: 'order_updated', userId: payment.userId, paymentId: payment.id });

    return {
      refund,
      payment,
      wallet,
      walletTransaction: walletTx,
    };
  }

  // ==================== WALLET COUPONS & REDEEM SYSTEM ====================

  public listWalletCoupons(): WalletCoupon[] {
    const db = this.readSync();
    return [...db.wallet_coupons].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  public getWalletCouponById(couponId: string): WalletCoupon | null {
    const db = this.readSync();
    return db.wallet_coupons.find((c) => c.id === couponId) || null;
  }

  public getWalletCouponByCode(codeRaw: string): WalletCoupon | null {
    const normalized = normalizeCouponCode(codeRaw);
    if (!normalized) return null;
    const db = this.readSync();
    return db.wallet_coupons.find((c) => normalizeCouponCode(c.code) === normalized) || null;
  }

  public createWalletCoupon(
    adminSession: SessionTokenPayload,
    data: {
      code: string;
      rewardAmount: number;
      couponType?: WalletCouponType;
      totalLimit?: number | null;
      perUserLimit?: number;
      startDate?: string;
      expiryDate?: string;
      status?: WalletCouponStatus;
      description?: string;
    }
  ): WalletCoupon {
    const validation = validateCouponCodeFormat(data.code);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid coupon code format.');
    }
    const cleanCode = validation.normalized;

    const reward = roundCurrency(Number(data.rewardAmount));
    if (!Number.isFinite(reward) || reward < 1) {
      throw new Error('Coupon reward amount must be at least ₹1 INR.');
    }

    const db = this.readSync();
    const existing = db.wallet_coupons.find(
      (c) => normalizeCouponCode(c.code) === cleanCode
    );
    if (existing) {
      throw new Error(`A wallet coupon with code "${cleanCode}" already exists.`);
    }

    const now = new Date().toISOString();
    const couponType: WalletCouponType =
      data.couponType === 'single_use' || data.couponType === 'user_limited'
        ? data.couponType
        : 'multi_use';

    const totalLimit =
      couponType === 'single_use'
        ? 1
        : typeof data.totalLimit === 'number' && data.totalLimit > 0
        ? Math.floor(data.totalLimit)
        : null;

    const perUserLimit =
      couponType === 'single_use'
        ? 1
        : typeof data.perUserLimit === 'number' && data.perUserLimit > 0
        ? Math.floor(data.perUserLimit)
        : 1;

    const newCoupon: WalletCoupon = {
      id: genId('WCOUP'),
      code: cleanCode,
      rewardAmount: reward,
      couponType,
      totalLimit,
      perUserLimit,
      redeemedCount: 0,
      startDate: data.startDate?.trim() || undefined,
      expiryDate: data.expiryDate?.trim() || undefined,
      status: data.status === 'disabled' ? 'disabled' : 'active',
      description: data.description?.trim().slice(0, 300) || undefined,
      createdBy: adminSession.name || 'Admin',
      createdAt: now,
      updatedAt: now,
    };

    db.wallet_coupons.unshift(newCoupon);
    this.write(db);
    this.emitEvent({ type: 'coupon_updated', couponId: newCoupon.id });
    return newCoupon;
  }

  public updateWalletCoupon(
    adminSession: SessionTokenPayload,
    couponId: string,
    updates: Partial<WalletCoupon>
  ): WalletCoupon {
    const db = this.readSync();
    const coupon = db.wallet_coupons.find((c) => c.id === couponId);
    if (!coupon) {
      throw new Error(`Coupon "${couponId}" not found.`);
    }

    if (updates.code !== undefined) {
      const val = validateCouponCodeFormat(updates.code);
      if (!val.valid) {
        throw new Error(val.error || 'Invalid coupon code format.');
      }
      const duplicate = db.wallet_coupons.find(
        (c) => c.id !== couponId && normalizeCouponCode(c.code) === val.normalized
      );
      if (duplicate) {
        throw new Error(`Another coupon already uses code "${val.normalized}".`);
      }
      coupon.code = val.normalized;
    }

    if (updates.rewardAmount !== undefined) {
      const reward = roundCurrency(Number(updates.rewardAmount));
      if (!Number.isFinite(reward) || reward < 1) {
        throw new Error('Reward amount must be at least ₹1 INR.');
      }
      coupon.rewardAmount = reward;
    }

    if (updates.couponType !== undefined) {
      coupon.couponType = updates.couponType;
      if (coupon.couponType === 'single_use') {
        coupon.totalLimit = 1;
        coupon.perUserLimit = 1;
      }
    }

    if (updates.totalLimit !== undefined) {
      coupon.totalLimit =
        typeof updates.totalLimit === 'number' && updates.totalLimit > 0
          ? Math.floor(updates.totalLimit)
          : null;
    }

    if (updates.perUserLimit !== undefined) {
      coupon.perUserLimit =
        typeof updates.perUserLimit === 'number' && updates.perUserLimit > 0
          ? Math.floor(updates.perUserLimit)
          : 1;
    }

    if (updates.startDate !== undefined) {
      coupon.startDate = updates.startDate?.trim() || undefined;
    }

    if (updates.expiryDate !== undefined) {
      coupon.expiryDate = updates.expiryDate?.trim() || undefined;
    }

    if (updates.status !== undefined) {
      coupon.status = updates.status === 'disabled' ? 'disabled' : 'active';
    }

    if (updates.description !== undefined) {
      coupon.description = updates.description?.trim().slice(0, 300) || undefined;
    }

    coupon.updatedAt = new Date().toISOString();
    this.write(db);
    this.emitEvent({ type: 'coupon_updated', couponId: coupon.id });
    return coupon;
  }

  public deleteWalletCoupon(adminSession: SessionTokenPayload, couponId: string): boolean {
    const db = this.readSync();
    const idx = db.wallet_coupons.findIndex((c) => c.id === couponId);
    if (idx === -1) {
      throw new Error(`Coupon "${couponId}" not found.`);
    }
    db.wallet_coupons.splice(idx, 1);
    this.write(db);
    this.emitEvent({ type: 'coupon_updated', couponId });
    return true;
  }

  public listWalletCouponRedemptions(userId?: string): WalletCouponRedemption[] {
    const db = this.readSync();
    if (userId) {
      return db.wallet_coupon_redemptions
        .filter((r) => r.userId === userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    return [...db.wallet_coupon_redemptions].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
  }

  public redeemWalletCoupon(
    user: { uid: string; name: string; email: string },
    couponCodeRaw: string
  ): {
    success: boolean;
    rewardAmount: number;
    previousBalance: number;
    newBalance: number;
    redemption: WalletCouponRedemption;
    wallet: UserWallet;
    transaction: WalletTransaction;
  } {
    const normalized = normalizeCouponCode(couponCodeRaw);
    if (!normalized) {
      throw new Error('Please enter a coupon code.');
    }

    const db = this.readSync();
    const coupon = db.wallet_coupons.find(
      (c) => normalizeCouponCode(c.code) === normalized
    );

    const check = evaluateCouponRedemptionEligibility({
      coupon,
      userId: user.uid,
      priorUserRedemptions: db.wallet_coupon_redemptions,
    });

    if (!check.eligible || !coupon) {
      throw new Error(check.error || 'Coupon validation failed.');
    }

    const now = new Date().toISOString();
    const reward = roundCurrency(coupon.rewardAmount);

    // 1. Atomically increment coupon redeemed count
    coupon.redeemedCount = (coupon.redeemedCount || 0) + 1;
    coupon.updatedAt = now;

    // 2. Fetch or create user wallet
    const wallet = this.getOrCreateWallet(db, user.uid, user.name, user.email);
    const prevBal = wallet.balance;
    const nextBal = roundCurrency(prevBal + reward);

    wallet.balance = nextBal;
    wallet.totalCreditsAdded = roundCurrency(wallet.totalCreditsAdded + reward);
    wallet.totalPromotionalCredits = roundCurrency((wallet.totalPromotionalCredits || 0) + reward);
    wallet.updatedAt = now;

    // 3. Create wallet transaction with type: COUPON_REWARD
    const walletTxId = genId('WTX');
    const redemptionId = genId('WRED');

    const walletTx: WalletTransaction = {
      id: walletTxId,
      transactionRef: redemptionId,
      userId: user.uid,
      type: 'COUPON_REWARD',
      amount: reward,
      previousBalance: prevBal,
      updatedBalance: nextBal,
      description: `Claimed Wallet Coupon: ${coupon.code}`,
      status: 'successful',
      reason: coupon.description || `Redeemed Coupon ${coupon.code}`,
      createdAt: now,
    };
    db.wallet_transactions.unshift(walletTx);

    // 4. Create wallet coupon redemption record
    const redemption: WalletCouponRedemption = {
      id: redemptionId,
      couponId: coupon.id,
      couponCode: coupon.code,
      userId: user.uid,
      username: user.name || wallet.username,
      userEmail: user.email || wallet.email,
      walletId: user.uid,
      walletTransactionId: walletTx.id,
      rewardAmount: reward,
      previousBalance: prevBal,
      newBalance: nextBal,
      status: 'successful',
      createdAt: now,
    };
    db.wallet_coupon_redemptions.unshift(redemption);

    // 5. Commit atomic transaction to disk
    this.write(db);

    // 6. Broadcast real-time SSE updates
    this.emitEvent({ type: 'wallet_updated', userId: user.uid });
    this.emitEvent({ type: 'coupon_updated', couponId: coupon.id });
    this.emitEvent({ type: 'redemption_created', userId: user.uid, couponId: coupon.id });

    return {
      success: true,
      rewardAmount: reward,
      previousBalance: prevBal,
      newBalance: nextBal,
      redemption,
      wallet,
      transaction: walletTx,
    };
  }

  public debitWallet(
    userId: string,
    amountInr: number,
    description: string,
    meta: {
      orderId: string;
      username?: string;
      email?: string;
      referenceType?: 'order';
      productName?: string;
    }
  ): { wallet: UserWallet; transaction: WalletTransaction; payment: PaymentRecord } {
    const cleanAmount = roundCurrency(Number(amountInr));
    if (!Number.isFinite(cleanAmount) || cleanAmount < 0) {
      throw new Error('Invalid debit amount.');
    }

    const db = this.readSync();
    const wallet = this.getOrCreateWallet(db, userId, meta.username, meta.email);

    if (cleanAmount > 0 && wallet.balance < cleanAmount) {
      throw new Error(
        `Insufficient wallet balance. Available: ₹${wallet.balance}, Required: ₹${cleanAmount}.`
      );
    }

    const now = new Date().toISOString();
    const prevBal = wallet.balance;
    const nextBal = roundCurrency(prevBal - cleanAmount);
    wallet.balance = nextBal;
    wallet.totalCreditsSpent = roundCurrency(wallet.totalCreditsSpent + cleanAmount);
    wallet.updatedAt = now;

    const paymentId = genId('PAY');
    const tx: WalletTransaction = {
      id: genId('WTX'),
      transactionRef: meta.orderId,
      userId,
      type: 'product_purchase',
      amount: cleanAmount,
      previousBalance: prevBal,
      updatedBalance: nextBal,
      description,
      relatedOrderId: meta.orderId,
      paymentId,
      status: 'successful',
      createdAt: now,
    };

    const payment: PaymentRecord = {
      id: paymentId,
      transactionId: `WAL-${meta.orderId}`,
      orderId: meta.orderId,
      userId,
      username: meta.username || wallet.username,
      email: meta.email || wallet.email,
      productName: meta.productName || description,
      amount: cleanAmount,
      walletAmount: cleanAmount,
      onlineAmount: 0,
      paymentMethod: 'wallet',
      paymentGateway: 'wallet',
      paymentType: 'wallet_product',
      status: 'successful',
      verifiedByBackend: true,
      createdAt: now,
      updatedAt: now,
    };

    db.wallet_transactions.unshift(tx);
    db.payments.unshift(payment);
    this.write(db);

    this.emitEvent({ type: 'wallet_updated', userId, paymentId });
    this.emitEvent({ type: 'payment_updated', userId, paymentId });

    return { wallet, transaction: tx, payment };
  }
}

export const walletDb = new WalletDatabase();
