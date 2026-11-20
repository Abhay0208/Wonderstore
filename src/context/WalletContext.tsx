import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
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
  WalletOverviewStats,
  WalletRecharge,
  WalletTransaction,
} from '../types';
import type { AdminWalletAdjustmentAction } from '../utils/walletPaymentHelpers';
import { useAuth } from './AuthContext';
import { useTickets } from './TicketContext';
import {
  walletService,
  type AdminPaymentDetailBundle,
  type AdminWalletDetailBundle,
} from '../services/walletService';

interface WalletContextType {
  // User Wallet State
  wallet: UserWallet | null;
  transactions: WalletTransaction[];
  recharges: WalletRecharge[];
  userPayments: PaymentRecord[];
  gatewayConfig: PaymentGatewayPublicConfig | null;
  isLoadingWallet: boolean;
  refreshUserWallet: () => Promise<void>;

  // User Actions
  initiateRecharge: (amount: number, method?: GatewayPaymentMethod) => ReturnType<typeof walletService.initiateRecharge>;
  verifyRecharge: (payload: {
    rechargeId: string;
    gatewayOrderId: string;
    gatewayPaymentId: string;
    signature: string;
    challengeToken?: string;
    paymentMethod?: string;
  }) => ReturnType<typeof walletService.verifyRecharge>;
  failRecharge: (payload: { rechargeId: string; reason?: string; cancelled?: boolean }) => ReturnType<typeof walletService.failRecharge>;
  recordManualUpiRecharge: (payload: {
    amount: number;
    utr: string;
    screenshotUrl?: string;
    ign?: string;
    orderNumber?: string;
  }) => ReturnType<typeof walletService.recordManualUpiRecharge>;
  authorizeSandboxGatewayPayment: (payload: {
    gatewayOrderId: string;
    amountInr: number;
    challengeToken?: string;
    method: GatewayPaymentMethod;
  }) => ReturnType<typeof walletService.authorizeSandboxGatewayPayment>;

  // Store Checkout Actions
  purchaseWithFullWallet: (payload: {
    totalAmount: number;
    items: Order['items'];
    ign: string;
    edition?: string;
    orderNumber?: string;
  }) => ReturnType<typeof walletService.purchaseWithFullWallet>;
  initiateGatewayCheckout: (payload: {
    mode: 'direct_online' | 'combined';
    totalAmount: number;
    items: Order['items'];
    ign: string;
    edition?: string;
    paymentMethod?: GatewayPaymentMethod;
    orderNumber?: string;
  }) => ReturnType<typeof walletService.initiateGatewayCheckout>;
  verifyGatewayCheckout: (payload: {
    paymentId: string;
    gatewayOrderId: string;
    gatewayPaymentId: string;
    signature: string;
    challengeToken?: string;
    paymentMethod?: string;
  }) => ReturnType<typeof walletService.verifyGatewayCheckout>;
  failGatewayCheckout: (payload: { paymentId: string; reason?: string; cancelled?: boolean }) => ReturnType<typeof walletService.failGatewayCheckout>;
  recordManualUpiCheckout: (payload: {
    mode: 'direct_online' | 'combined';
    totalAmount: number;
    items: Order['items'];
    ign: string;
    edition?: string;
    orderNumber: string;
    utr: string;
    screenshotUrl?: string;
  }) => ReturnType<typeof walletService.recordManualUpiCheckout>;

  // Admin Wallet & Payment Management State & Actions
  adminWallets: UserWallet[];
  adminWalletOverview: WalletOverviewStats | null;
  adminPayments: PaymentRecord[];
  adminRefunds: PaymentRefund[];
  adminPaymentStats: PaymentDashboardStats | null;
  isLoadingAdminFinance: boolean;
  refreshAdminFinanceData: () => Promise<void>;
  getAdminWalletDetail: (userId: string) => Promise<AdminWalletDetailBundle>;
  adjustWalletByAdmin: (payload: {
    userId: string;
    action: AdminWalletAdjustmentAction;
    amount: number;
    reason: string;
    username?: string;
    email?: string;
  }) => ReturnType<typeof walletService.adjustWalletByAdmin>;
  getAdminPaymentDetail: (paymentId: string) => Promise<AdminPaymentDetailBundle>;
  updateAdminPaymentStatus: (paymentId: string, status: PaymentStatus, reason?: string) => Promise<PaymentRecord>;
  refundAdminPayment: (paymentId: string, reason: string) => ReturnType<typeof walletService.refundAdminPayment>;
  saveAdminGatewaySettings: (patch: Parameters<typeof walletService.updateAdminGatewaySettings>[1]) => Promise<PaymentGatewayPublicConfig>;

  // Wallet Coupon Management & User Claim
  userCouponRedemptions: WalletCouponRedemption[];
  claimCoupon: (code: string) => ReturnType<typeof walletService.redeemCoupon>;
  refreshUserCouponRedemptions: () => Promise<void>;

  adminCoupons: WalletCoupon[];
  adminCouponRedemptions: WalletCouponRedemption[];
  isLoadingCoupons: boolean;
  refreshAdminCoupons: () => Promise<void>;
  createCouponByAdmin: (payload: {
    code: string;
    rewardAmount: number;
    couponType?: string;
    totalLimit?: number | null;
    perUserLimit?: number;
    startDate?: string;
    expiryDate?: string;
    status?: string;
    description?: string;
  }) => Promise<WalletCoupon>;
  updateCouponByAdmin: (couponId: string, updates: Partial<WalletCoupon>) => Promise<WalletCoupon>;
  deleteCouponByAdmin: (couponId: string) => Promise<void>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { userToken, ensureUserToken, invalidateUserToken, staffSession } = useTickets();

  const [wallet, setWallet] = useState<UserWallet | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [recharges, setRecharges] = useState<WalletRecharge[]>([]);
  const [userPayments, setUserPayments] = useState<PaymentRecord[]>([]);
  const [gatewayConfig, setGatewayConfig] = useState<PaymentGatewayPublicConfig | null>(null);
  const [isLoadingWallet, setIsLoadingWallet] = useState(false);

  const [adminWallets, setAdminWallets] = useState<UserWallet[]>([]);
  const [adminWalletOverview, setAdminWalletOverview] = useState<WalletOverviewStats | null>(null);
  const [adminPayments, setAdminPayments] = useState<PaymentRecord[]>([]);
  const [adminRefunds, setAdminRefunds] = useState<PaymentRefund[]>([]);
  const [adminPaymentStats, setAdminPaymentStats] = useState<PaymentDashboardStats | null>(null);
  const [isLoadingAdminFinance, setIsLoadingAdminFinance] = useState(false);

  // Coupon State
  const [userCouponRedemptions, setUserCouponRedemptions] = useState<WalletCouponRedemption[]>([]);
  const [adminCoupons, setAdminCoupons] = useState<WalletCoupon[]>([]);
  const [adminCouponRedemptions, setAdminCouponRedemptions] = useState<WalletCouponRedemption[]>([]);
  const [isLoadingCoupons, setIsLoadingCoupons] = useState(false);

  const refreshPublicGatewayConfig = useCallback(async () => {
    try {
      const cfg = await walletService.getPublicGatewayConfig();
      setGatewayConfig(cfg);
    } catch {
      // ignore if offline
    }
  }, []);

  useEffect(() => {
    void refreshPublicGatewayConfig();
  }, [refreshPublicGatewayConfig]);

  const refreshUserCouponRedemptions = useCallback(async (overrideToken?: string) => {
    const tk = overrideToken || userToken;
    if (!tk || !user) return;
    try {
      const redemptions = await walletService.getMyCouponRedemptions(tk);
      setUserCouponRedemptions(redemptions);
    } catch (err: any) {
      if (err?.status === 401 || String(err?.message || '').includes('401')) {
        invalidateUserToken();
        void ensureUserToken(true).catch(() => undefined);
      }
    }
  }, [userToken, user, ensureUserToken, invalidateUserToken]);

  const refreshUserWallet = useCallback(async (overrideToken?: string) => {
    const tk = overrideToken || userToken;
    if (!tk || !user) return;
    try {
      const bundle = await walletService.getMyWalletBundle(tk);
      setWallet(bundle.wallet);
      setTransactions(bundle.transactions);
      setRecharges(bundle.recharges);
      setUserPayments(bundle.payments);
      if (bundle.gatewayConfig) setGatewayConfig(bundle.gatewayConfig);
    } catch (err: any) {
      if (err?.status === 401 || String(err?.message || '').includes('401')) {
        invalidateUserToken();
        void ensureUserToken(true).catch(() => undefined);
      }
    }
  }, [userToken, user, ensureUserToken, invalidateUserToken]);

  const refreshAdminCoupons = useCallback(async () => {
    if (!staffSession?.token) return;
    setIsLoadingCoupons(true);
    try {
      const [coupons, redemptions] = await Promise.all([
        walletService.getAdminCoupons(staffSession.token),
        walletService.getAdminCouponRedemptions(staffSession.token),
      ]);
      setAdminCoupons(coupons);
      setAdminCouponRedemptions(redemptions);
    } catch {
      // ignore
    } finally {
      setIsLoadingCoupons(false);
    }
  }, [staffSession?.token]);

  const refreshAdminFinanceData = useCallback(async () => {
    if (!staffSession?.token) return;
    setIsLoadingAdminFinance(true);
    try {
      const [walletsRes, paymentsRes] = await Promise.allSettled([
        walletService.listAdminWallets(staffSession.token),
        walletService.listAdminPayments(staffSession.token),
      ]);
      if (walletsRes.status === 'fulfilled') {
        setAdminWallets(walletsRes.value.wallets);
        setAdminWalletOverview(walletsRes.value.overview);
      }
      if (paymentsRes.status === 'fulfilled') {
        setAdminPayments(paymentsRes.value.payments);
        setAdminRefunds(paymentsRes.value.refunds);
        setAdminPaymentStats(paymentsRes.value.stats);
        setGatewayConfig(paymentsRes.value.gatewayConfig);
      }
    } finally {
      setIsLoadingAdminFinance(false);
    }
  }, [staffSession?.token]);

  // Reset user wallet when logged out, hydrate when logged in
  useEffect(() => {
    if (!user || !userToken) {
      setWallet(null);
      setTransactions([]);
      setRecharges([]);
      setUserPayments([]);
      setUserCouponRedemptions([]);
      return;
    }
    setIsLoadingWallet(true);
    Promise.all([refreshUserWallet(), refreshUserCouponRedemptions()]).finally(() =>
      setIsLoadingWallet(false)
    );

    const closeStream = walletService.openRealtimeStream(userToken, () => {
      void refreshUserWallet();
      void refreshUserCouponRedemptions();
      window.dispatchEvent(new CustomEvent('wondermc:orders-sync'));
    });
    const poll = window.setInterval(() => {
      void refreshUserWallet();
      void refreshUserCouponRedemptions();
    }, 8000);
    return () => {
      closeStream();
      window.clearInterval(poll);
    };
  }, [user?.uid, userToken, refreshUserWallet, refreshUserCouponRedemptions]);

  // Admin realtime stream & clear on logout
  useEffect(() => {
    if (!staffSession?.token) {
      setAdminWallets([]);
      setAdminWalletOverview(null);
      setAdminPayments([]);
      setAdminRefunds([]);
      setAdminPaymentStats(null);
      setAdminCoupons([]);
      setAdminCouponRedemptions([]);
      return;
    }
    void refreshAdminFinanceData();
    void refreshAdminCoupons();
    const closeStream = walletService.openRealtimeStream(staffSession.token, () => {
      void refreshAdminFinanceData();
      void refreshAdminCoupons();
      window.dispatchEvent(new CustomEvent('wondermc:orders-sync'));
    });
    return () => {
      closeStream();
    };
  }, [staffSession?.token, refreshAdminFinanceData, refreshAdminCoupons]);

  const withUserToken = async <T,>(fn: (tk: string) => Promise<T>): Promise<T> => {
    if (!user) throw new Error('Please log in to your account to access your wallet.');
    const tk = await ensureUserToken(false);
    try {
      return await fn(tk);
    } catch (err: any) {
      const msg = String(err?.message || '').toLowerCase();
      if (
        err?.status === 401 ||
        msg.includes('401') ||
        msg.includes('session token') ||
        msg.includes('authentication') ||
        msg.includes('unauthorized')
      ) {
        invalidateUserToken();
        const freshTk = await ensureUserToken(true);
        return await fn(freshTk);
      }
      throw err;
    }
  };

  const requireStaffToken = () => {
    if (!staffSession?.token) throw new Error('Admin authentication required.');
    return staffSession.token;
  };

  const initiateRecharge: WalletContextType['initiateRecharge'] = async (amount, method = 'upi') => {
    return withUserToken(async (tk) => {
      const res = await walletService.initiateRecharge(tk, amount, method);
      await refreshUserWallet(tk);
      return res;
    });
  };

  const verifyRecharge: WalletContextType['verifyRecharge'] = async (payload) => {
    return withUserToken(async (tk) => {
      const res = await walletService.verifyRecharge(tk, payload);
      await refreshUserWallet(tk);
      if (staffSession?.token) void refreshAdminFinanceData();
      return res;
    });
  };

  const failRecharge: WalletContextType['failRecharge'] = async (payload) => {
    return withUserToken(async (tk) => {
      const res = await walletService.failRecharge(tk, payload);
      await refreshUserWallet(tk);
      if (staffSession?.token) void refreshAdminFinanceData();
      return res;
    });
  };

  const recordManualUpiRecharge: WalletContextType['recordManualUpiRecharge'] = async (payload) => {
    return withUserToken(async (tk) => {
      const res = await walletService.recordManualUpiRecharge(tk, payload);
      await refreshUserWallet(tk);
      if (staffSession?.token) void refreshAdminFinanceData();
      return res;
    });
  };

  const authorizeSandboxGatewayPayment: WalletContextType['authorizeSandboxGatewayPayment'] = async (payload) => {
    return withUserToken((tk) => walletService.authorizeSandboxGatewayPayment(tk, payload));
  };

  const purchaseWithFullWallet: WalletContextType['purchaseWithFullWallet'] = async (payload) => {
    return withUserToken(async (tk) => {
      const res = await walletService.purchaseWithFullWallet(tk, payload);
      await refreshUserWallet(tk);
      window.dispatchEvent(new CustomEvent('wondermc:orders-sync'));
      if (staffSession?.token) void refreshAdminFinanceData();
      return res;
    });
  };

  const initiateGatewayCheckout: WalletContextType['initiateGatewayCheckout'] = async (payload) => {
    return withUserToken(async (tk) => {
      const res = await walletService.initiateGatewayCheckout(tk, payload);
      await refreshUserWallet(tk);
      window.dispatchEvent(new CustomEvent('wondermc:orders-sync'));
      if (staffSession?.token) void refreshAdminFinanceData();
      return res;
    });
  };

  const verifyGatewayCheckout: WalletContextType['verifyGatewayCheckout'] = async (payload) => {
    return withUserToken(async (tk) => {
      const res = await walletService.verifyGatewayCheckout(tk, payload);
      await refreshUserWallet(tk);
      window.dispatchEvent(new CustomEvent('wondermc:orders-sync'));
      if (staffSession?.token) void refreshAdminFinanceData();
      return res;
    });
  };

  const failGatewayCheckout: WalletContextType['failGatewayCheckout'] = async (payload) => {
    return withUserToken(async (tk) => {
      const res = await walletService.failGatewayCheckout(tk, payload);
      await refreshUserWallet(tk);
      window.dispatchEvent(new CustomEvent('wondermc:orders-sync'));
      if (staffSession?.token) void refreshAdminFinanceData();
      return res;
    });
  };

  const recordManualUpiCheckout: WalletContextType['recordManualUpiCheckout'] = async (payload) => {
    let tk: string | null = null;
    if (user) {
      tk = await ensureUserToken(false).catch(() => userToken);
    }
    const res = await walletService.recordManualUpiCheckout(tk, payload);
    if (tk) await refreshUserWallet(tk);
    window.dispatchEvent(new CustomEvent('wondermc:orders-sync'));
    if (staffSession?.token) void refreshAdminFinanceData();
    return res;
  };

  const getAdminWalletDetail: WalletContextType['getAdminWalletDetail'] = async (userId) => {
    return walletService.getAdminWalletDetail(requireStaffToken(), userId);
  };

  const adjustWalletByAdmin: WalletContextType['adjustWalletByAdmin'] = async (payload) => {
    const res = await walletService.adjustWalletByAdmin(requireStaffToken(), payload);
    await refreshAdminFinanceData();
    if (user?.uid === payload.userId) void refreshUserWallet();
    return res;
  };

  const getAdminPaymentDetail: WalletContextType['getAdminPaymentDetail'] = async (paymentId) => {
    return walletService.getAdminPaymentDetail(requireStaffToken(), paymentId);
  };

  const updateAdminPaymentStatus: WalletContextType['updateAdminPaymentStatus'] = async (
    paymentId,
    status,
    reason
  ) => {
    const res = await walletService.updateAdminPaymentStatus(
      requireStaffToken(),
      paymentId,
      status,
      reason
    );
    await refreshAdminFinanceData();
    window.dispatchEvent(new CustomEvent('wondermc:orders-sync'));
    return res.payment;
  };

  const refundAdminPayment: WalletContextType['refundAdminPayment'] = async (paymentId, reason) => {
    const res = await walletService.refundAdminPayment(requireStaffToken(), paymentId, reason);
    await refreshAdminFinanceData();
    if (user?.uid === res.wallet.userId) void refreshUserWallet();
    window.dispatchEvent(new CustomEvent('wondermc:orders-sync'));
    return res;
  };

  const saveAdminGatewaySettings: WalletContextType['saveAdminGatewaySettings'] = async (patch) => {
    const cfg = await walletService.updateAdminGatewaySettings(requireStaffToken(), patch);
    setGatewayConfig(cfg);
    await refreshAdminFinanceData();
    return cfg;
  };

  const claimCoupon: WalletContextType['claimCoupon'] = async (code: string) => {
    return withUserToken(async (tk) => {
      const res = await walletService.redeemCoupon(tk, code);
      await Promise.all([refreshUserWallet(tk), refreshUserCouponRedemptions(tk)]);
      if (staffSession?.token) {
        void refreshAdminCoupons();
        void refreshAdminFinanceData();
      }
      return res;
    });
  };

  const createCouponByAdmin: WalletContextType['createCouponByAdmin'] = async (payload) => {
    const tk = requireStaffToken();
    const coupon = await walletService.createAdminCoupon(tk, payload);
    await refreshAdminCoupons();
    return coupon;
  };

  const updateCouponByAdmin: WalletContextType['updateCouponByAdmin'] = async (couponId, updates) => {
    const tk = requireStaffToken();
    const coupon = await walletService.updateAdminCoupon(tk, couponId, updates);
    await refreshAdminCoupons();
    return coupon;
  };

  const deleteCouponByAdmin: WalletContextType['deleteCouponByAdmin'] = async (couponId) => {
    const tk = requireStaffToken();
    await walletService.deleteAdminCoupon(tk, couponId);
    await refreshAdminCoupons();
  };

  return (
    <WalletContext.Provider
      value={{
        wallet,
        transactions,
        recharges,
        userPayments,
        gatewayConfig,
        isLoadingWallet,
        refreshUserWallet,
        initiateRecharge,
        verifyRecharge,
        failRecharge,
        recordManualUpiRecharge,
        authorizeSandboxGatewayPayment,
        purchaseWithFullWallet,
        initiateGatewayCheckout,
        verifyGatewayCheckout,
        failGatewayCheckout,
        recordManualUpiCheckout,
        adminWallets,
        adminWalletOverview,
        adminPayments,
        adminRefunds,
        adminPaymentStats,
        isLoadingAdminFinance,
        refreshAdminFinanceData,
        getAdminWalletDetail,
        adjustWalletByAdmin,
        getAdminPaymentDetail,
        updateAdminPaymentStatus,
        refundAdminPayment,
        saveAdminGatewaySettings,
        userCouponRedemptions,
        claimCoupon,
        refreshUserCouponRedemptions,
        adminCoupons,
        adminCouponRedemptions,
        isLoadingCoupons,
        refreshAdminCoupons,
        createCouponByAdmin,
        updateCouponByAdmin,
        deleteCouponByAdmin,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = () => {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within a WalletProvider');
  return ctx;
};
