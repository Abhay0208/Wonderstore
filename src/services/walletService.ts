import type {
  GatewayOrderChallenge,
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
  WalletOverviewStats,
  WalletRecharge,
  WalletTransaction,
} from '../types';
import type { AdminWalletAdjustmentAction, CombinedCheckoutBreakdown } from '../utils/walletPaymentHelpers';

async function apiRequest<T>(
  url: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return data as T;
}

export interface UserWalletBundle {
  wallet: UserWallet;
  transactions: WalletTransaction[];
  recharges: WalletRecharge[];
  payments: PaymentRecord[];
  gatewayConfig: PaymentGatewayPublicConfig;
}

export interface AdminWalletDetailBundle {
  wallet: UserWallet;
  transactions: WalletTransaction[];
  recharges: WalletRecharge[];
  payments: PaymentRecord[];
}

export interface AdminPaymentDetailBundle {
  payment: PaymentRecord;
  order: Order | null;
  recharge: WalletRecharge | null;
  walletTransactions: WalletTransaction[];
  refunds: PaymentRefund[];
}

export const walletService = {
  async getPublicGatewayConfig(): Promise<PaymentGatewayPublicConfig> {
    const res = await apiRequest<{ config: PaymentGatewayPublicConfig }>('/api/payments/gateway-config');
    return res.config;
  },

  async getMyWalletBundle(token: string): Promise<UserWalletBundle> {
    return apiRequest<UserWalletBundle>('/api/wallet/me', {}, token);
  },

  async initiateRecharge(
    token: string,
    amount: number,
    paymentMethod?: GatewayPaymentMethod
  ): Promise<{
    recharge: WalletRecharge;
    payment: PaymentRecord;
    gatewayOrder: GatewayOrderChallenge;
  }> {
    return apiRequest('/api/wallet/recharge/initiate', {
      method: 'POST',
      body: JSON.stringify({ amount, paymentMethod }),
    }, token);
  },

  async authorizeSandboxGatewayPayment(
    token: string,
    payload: {
      gatewayOrderId: string;
      amountInr: number;
      challengeToken?: string;
      method: GatewayPaymentMethod;
    }
  ): Promise<{ gatewayPaymentId: string; signature: string }> {
    return apiRequest('/api/payments/gateway/sandbox-authorize', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, token);
  },

  async verifyRecharge(
    token: string,
    payload: {
      rechargeId: string;
      gatewayOrderId: string;
      gatewayPaymentId: string;
      signature: string;
      challengeToken?: string;
      paymentMethod?: string;
    }
  ): Promise<{
    alreadyProcessed: boolean;
    wallet: UserWallet;
    recharge: WalletRecharge;
    payment?: PaymentRecord;
    transaction?: WalletTransaction;
  }> {
    return apiRequest<{
      alreadyProcessed: boolean;
      wallet: UserWallet;
      recharge: WalletRecharge;
      payment?: PaymentRecord;
      transaction?: WalletTransaction;
    }>('/api/wallet/recharge/verify', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, token);
  },

  async failRecharge(
    token: string,
    payload: { rechargeId: string; reason?: string; cancelled?: boolean }
  ) {
    return apiRequest<{ recharge: WalletRecharge; payment?: PaymentRecord }>(
      '/api/wallet/recharge/fail',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      token
    );
  },

  async recordManualUpiRecharge(
    token: string,
    payload: {
      amount: number;
      utr: string;
      screenshotUrl?: string;
      ign?: string;
      orderNumber?: string;
    }
  ): Promise<{ recharge: WalletRecharge; payment: PaymentRecord }> {
    return apiRequest('/api/wallet/recharge/manual-upi', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, token);
  },

  async purchaseWithFullWallet(
    token: string,
    payload: {
      totalAmount: number;
      items: Order['items'];
      ign: string;
      edition?: string;
      orderNumber?: string;
    }
  ): Promise<{
    order: Order;
    payment: PaymentRecord;
    transaction: WalletTransaction;
    wallet: UserWallet;
  }> {
    return apiRequest<{
      order: Order;
      payment: PaymentRecord;
      transaction: WalletTransaction;
      wallet: UserWallet;
    }>('/api/payments/checkout/wallet', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, token);
  },

  async initiateGatewayCheckout(
    token: string,
    payload: {
      mode: 'direct_online' | 'combined';
      totalAmount: number;
      items: Order['items'];
      ign: string;
      edition?: string;
      paymentMethod?: GatewayPaymentMethod;
      orderNumber?: string;
    }
  ): Promise<
    | {
        settledViaFullWallet: true;
        order: Order;
        payment: PaymentRecord;
        transaction: WalletTransaction;
        wallet: UserWallet;
      }
    | {
        settledViaFullWallet: false;
        order: Order;
        payment: PaymentRecord;
        breakdown: CombinedCheckoutBreakdown;
        gatewayOrder: GatewayOrderChallenge;
      }
  > {
    return apiRequest('/api/payments/checkout/initiate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, token);
  },

  async verifyGatewayCheckout(
    token: string,
    payload: {
      paymentId: string;
      gatewayOrderId: string;
      gatewayPaymentId: string;
      signature: string;
      challengeToken?: string;
      paymentMethod?: string;
    }
  ): Promise<{
    alreadyProcessed: boolean;
    payment: PaymentRecord;
    order?: Order;
    wallet: UserWallet;
    transaction?: WalletTransaction;
  }> {
    return apiRequest<{
      alreadyProcessed: boolean;
      payment: PaymentRecord;
      order?: Order;
      wallet: UserWallet;
      transaction?: WalletTransaction;
    }>('/api/payments/checkout/verify', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, token);
  },

  async failGatewayCheckout(
    token: string,
    payload: { paymentId: string; reason?: string; cancelled?: boolean }
  ) {
    return apiRequest<{ payment: PaymentRecord; order?: Order }>(
      '/api/payments/checkout/fail',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      token
    );
  },

  async recordManualUpiCheckout(
    token: string | null | undefined,
    payload: {
      mode: 'direct_online' | 'combined';
      totalAmount: number;
      items: Order['items'];
      ign: string;
      edition?: string;
      orderNumber: string;
      utr: string;
      screenshotUrl?: string;
    }
  ): Promise<{ order: Order; payment: PaymentRecord }> {
    return apiRequest('/api/payments/manual-upi', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, token);
  },

  // Orders
  async listOrders(token: string): Promise<Order[]> {
    const res = await apiRequest<{ orders: Order[] }>('/api/orders', {}, token);
    return res.orders || [];
  },

  async updateOrderStatus(token: string, orderId: string, status: Order['status']): Promise<Order> {
    const res = await apiRequest<{ order: Order }>(
      `/api/admin/orders/${encodeURIComponent(orderId)}`,
      { method: 'PATCH', body: JSON.stringify({ status }) },
      token
    );
    return res.order;
  },

  async deleteOrder(token: string, orderId: string): Promise<void> {
    await apiRequest<{ ok: boolean }>(
      `/api/admin/orders/${encodeURIComponent(orderId)}`,
      { method: 'DELETE' },
      token
    );
  },

  // Admin Wallet Management
  async listAdminWallets(
    token: string
  ): Promise<{ wallets: UserWallet[]; overview: WalletOverviewStats }> {
    return apiRequest('/api/admin/wallets', {}, token);
  },

  async getAdminWalletDetail(token: string, userId: string): Promise<AdminWalletDetailBundle> {
    return apiRequest(`/api/admin/wallets/${encodeURIComponent(userId)}`, {}, token);
  },

  async adjustWalletByAdmin(
    token: string,
    payload: {
      userId: string;
      action: AdminWalletAdjustmentAction;
      amount: number;
      reason: string;
      username?: string;
      email?: string;
    }
  ): Promise<{ wallet: UserWallet; transaction: WalletTransaction }> {
    return apiRequest('/api/admin/wallets/adjust', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, token);
  },

  // Admin Payment Management
  async listAdminPayments(token: string): Promise<{
    payments: PaymentRecord[];
    refunds: PaymentRefund[];
    stats: PaymentDashboardStats;
    gatewayConfig: PaymentGatewayPublicConfig;
  }> {
    return apiRequest('/api/admin/payments', {}, token);
  },

  async getAdminPaymentDetail(token: string, paymentId: string): Promise<AdminPaymentDetailBundle> {
    return apiRequest(`/api/admin/payments/${encodeURIComponent(paymentId)}`, {}, token);
  },

  async updateAdminPaymentStatus(
    token: string,
    paymentId: string,
    status: PaymentStatus,
    reason?: string
  ): Promise<{ payment: PaymentRecord }> {
    return apiRequest(`/api/admin/payments/${encodeURIComponent(paymentId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, reason }),
    }, token);
  },

  async refundAdminPayment(
    token: string,
    paymentId: string,
    reason: string
  ): Promise<{
    refund: PaymentRefund;
    payment: PaymentRecord;
    wallet: UserWallet;
    walletTransaction?: WalletTransaction;
  }> {
    return apiRequest(`/api/admin/payments/${encodeURIComponent(paymentId)}/refund`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }, token);
  },

  async getAdminGatewaySettings(token: string): Promise<PaymentGatewayPublicConfig> {
    const res = await apiRequest<{ config: PaymentGatewayPublicConfig }>(
      '/api/admin/gateway-settings',
      {},
      token
    );
    return res.config;
  },

  async updateAdminGatewaySettings(
    token: string,
    patch: {
      clearExternalKeys?: boolean;
      upiQrEnabled?: boolean;
      supportedMethods?: GatewayPaymentMethod[];
    }
  ): Promise<PaymentGatewayPublicConfig> {
    const res = await apiRequest<{ config: PaymentGatewayPublicConfig }>(
      '/api/admin/gateway-settings',
      { method: 'POST', body: JSON.stringify(patch) },
      token
    );
    return res.config;
  },

  // Wallet Coupons (User Claim & Admin Management)
  async redeemCoupon(
    token: string,
    code: string
  ): Promise<{
    success: boolean;
    rewardAmount: number;
    previousBalance: number;
    newBalance: number;
    redemption: WalletCouponRedemption;
    wallet: UserWallet;
    transaction: WalletTransaction;
  }> {
    return apiRequest<{
      success: boolean;
      rewardAmount: number;
      previousBalance: number;
      newBalance: number;
      redemption: WalletCouponRedemption;
      wallet: UserWallet;
      transaction: WalletTransaction;
    }>('/api/wallet/coupons/redeem', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }, token);
  },

  async getMyCouponRedemptions(token: string): Promise<WalletCouponRedemption[]> {
    const res = await apiRequest<{ redemptions: WalletCouponRedemption[] }>(
      '/api/wallet/coupons/my-redemptions',
      {},
      token
    );
    return res.redemptions || [];
  },

  async getAdminCoupons(token: string): Promise<WalletCoupon[]> {
    const res = await apiRequest<{ coupons: WalletCoupon[] }>(
      '/api/admin/coupons',
      {},
      token
    );
    return res.coupons || [];
  },

  async createAdminCoupon(
    token: string,
    payload: {
      code: string;
      rewardAmount: number;
      couponType?: string;
      totalLimit?: number | null;
      perUserLimit?: number;
      startDate?: string;
      expiryDate?: string;
      status?: string;
      description?: string;
    }
  ): Promise<WalletCoupon> {
    const res = await apiRequest<{ coupon: WalletCoupon }>(
      '/api/admin/coupons',
      { method: 'POST', body: JSON.stringify(payload) },
      token
    );
    return res.coupon;
  },

  async updateAdminCoupon(
    token: string,
    couponId: string,
    updates: Partial<WalletCoupon>
  ): Promise<WalletCoupon> {
    const res = await apiRequest<{ coupon: WalletCoupon }>(
      `/api/admin/coupons/${encodeURIComponent(couponId)}`,
      { method: 'PATCH', body: JSON.stringify(updates) },
      token
    );
    return res.coupon;
  },

  async deleteAdminCoupon(token: string, couponId: string): Promise<void> {
    await apiRequest<{ success: boolean }>(
      `/api/admin/coupons/${encodeURIComponent(couponId)}`,
      { method: 'DELETE' },
      token
    );
  },

  async getAdminCouponRedemptions(token: string, userId?: string): Promise<WalletCouponRedemption[]> {
    const query = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    const res = await apiRequest<{ redemptions: WalletCouponRedemption[] }>(
      `/api/admin/coupons/redemptions${query}`,
      {},
      token
    );
    return res.redemptions || [];
  },

  openRealtimeStream(token: string, onEvent: (ev: { type: string; userId?: string; paymentId?: string; couponId?: string }) => void): () => void {
    const url = `/api/wallet/stream?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    const handler = (e: MessageEvent) => {
      try {
        onEvent(JSON.parse(e.data));
      } catch {
        // ignore
      }
    };
    const errorHandler = () => {
      if (es.readyState === EventSource.CLOSED) {
        es.close();
      }
    };
    es.addEventListener('wallet', handler as EventListener);
    es.addEventListener('error', errorHandler);
    return () => {
      es.removeEventListener('wallet', handler as EventListener);
      es.removeEventListener('error', errorHandler);
      es.close();
    };
  },
};
