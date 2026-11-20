import React, { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Coins,
  Gift,
  History,
  Loader2,
  PlusCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  Smartphone,
  Sparkles,
  Tag,
  Ticket,
  Wallet as WalletIcon,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { useWallet } from '../../context/WalletContext';
import { useToast } from '../../context/ToastContext';
import { formatINR } from '../../config/storeDefaults';
import { formatISTDateTime } from '../../utils/dateUtils';
import {
  WALLET_RECHARGE_PRESETS,
  getPaymentStatusLabel,
  getWalletTxTypeLabel,
  validateRechargeAmount,
} from '../../utils/walletPaymentHelpers';

export const UserWalletTab: React.FC = () => {
  const { user } = useAuth();
  const { startWalletRecharge } = useCart();
  const {
    wallet,
    transactions,
    recharges,
    userCouponRedemptions,
    claimCoupon,
    gatewayConfig,
    isLoadingWallet,
    refreshUserWallet,
  } = useWallet();
  const { success, error } = useToast();

  const [selectedAmount, setSelectedAmount] = useState<number>(500);
  const [customAmountInput, setCustomAmountInput] = useState<string>('');

  const [ledgerTab, setLedgerTab] = useState<'transactions' | 'recharges' | 'coupons'>('transactions');
  const [txSearch, setTxSearch] = useState('');
  const [txTypeFilter, setTxTypeFilter] = useState<string>('all');
  const [bannerFeedback, setBannerFeedback] = useState<{
    kind: 'success' | 'error';
    text: string;
  } | null>(null);

  // Coupon Claim State
  const [couponCodeInput, setCouponCodeInput] = useState('');
  const [isClaimingCoupon, setIsClaimingCoupon] = useState(false);
  const [couponResult, setCouponResult] = useState<{
    success: boolean;
    code: string;
    rewardAmount: number;
    previousBalance: number;
    newBalance: number;
    message: string;
  } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);

  const effectiveAmount = customAmountInput.trim()
    ? Number(customAmountInput)
    : selectedAmount;

  const filteredTransactions = useMemo(() => {
    const q = txSearch.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (txTypeFilter !== 'all' && tx.type !== txTypeFilter) return false;
      if (!q) return true;
      const hay = [
        tx.id,
        tx.transactionRef,
        tx.description,
        tx.relatedOrderId,
        tx.type,
        tx.status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [transactions, txSearch, txTypeFilter]);

  const handleStartRecharge = (e: React.FormEvent) => {
    e.preventDefault();
    setBannerFeedback(null);
    const check = validateRechargeAmount(effectiveAmount);
    if (!check.valid) {
      error(check.error || 'Enter a valid recharge amount');
      setBannerFeedback({ kind: 'error', text: check.error || 'Enter a valid recharge amount' });
      return;
    }

    startWalletRecharge(check.amount);
  };

  const handleClaimCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = couponCodeInput.trim().toUpperCase();
    if (!clean) {
      setCouponError('Please enter a coupon code.');
      return;
    }
    setCouponError(null);
    setCouponResult(null);
    setIsClaimingCoupon(true);
    try {
      const res = await claimCoupon(clean);
      setCouponResult({
        success: true,
        code: clean,
        rewardAmount: res.rewardAmount,
        previousBalance: res.previousBalance,
        newBalance: res.newBalance,
        message: `Successfully claimed ${res.rewardAmount} Credits (${formatINR(res.rewardAmount)})!`,
      });
      success(`Coupon ${clean} redeemed! +${res.rewardAmount} Wallet Credits added.`);
      setCouponCodeInput('');
    } catch (err: any) {
      const msg = err?.message || 'Failed to redeem coupon code.';
      setCouponError(msg);
      error(msg);
    } finally {
      setIsClaimingCoupon(false);
    }
  };

  if (isLoadingWallet && !wallet) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground gap-2 text-xs font-bold">
        <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
        <span>Loading your wallet &amp; ledger...</span>
      </div>
    );
  }

  const safeWallet = wallet || {
    userId: user?.uid || '',
    username: user?.displayName || 'Player',
    email: user?.email || '',
    balance: 0,
    totalCreditsAdded: 0,
    totalCreditsSpent: 0,
    totalRefunds: 0,
    totalPromotionalCredits: 0,
    createdAt: '',
    updatedAt: '',
  };

  return (
    <div className="space-y-5">
      {/* Wallet Conversion Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-500/30 bg-gradient-to-r from-sky-950/60 via-[#091c36] to-emerald-950/40 p-4">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-sky-300 shrink-0">
            <WalletIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm sm:text-base font-black uppercase tracking-wide text-white font-display">
                WonderMC Player Wallet
              </h3>
              <span className="rounded bg-amber-500/20 border border-amber-400/40 px-2 py-0.5 text-[10px] font-black uppercase text-amber-300 font-mono">
                1 Credit = ₹1 INR
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Linked to account <strong className="text-white">{safeWallet.email || safeWallet.username}</strong> • Instant backend signature verification
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void refreshUserWallet()}
          className="inline-flex items-center gap-1.5 rounded-xl border border-sky-500/30 bg-surface-deep px-3 py-1.5 text-xs font-bold text-sky-300 hover:border-sky-400 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Feedback Banner */}
      {bannerFeedback && (
        <div
          className={`flex items-start gap-2.5 rounded-2xl border p-3.5 text-xs font-bold ${
            bannerFeedback.kind === 'success'
              ? 'border-emerald-500/40 bg-emerald-950/50 text-emerald-200'
              : 'border-rose-500/40 bg-rose-950/50 text-rose-200'
          }`}
        >
          {bannerFeedback.kind === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          )}
          <span>{bannerFeedback.text}</span>
        </div>
      )}

      {/* 5 Wallet Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="col-span-2 sm:col-span-1 rounded-2xl border border-amber-400/40 bg-gradient-to-br from-amber-500/15 to-surface-deep/90 p-3.5">
          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-amber-300">
            <span>Available Balance</span>
            <Coins className="w-3.5 h-3.5" />
          </div>
          <div
            data-testid="wallet-available-balance"
            className="mt-1.5 text-xl sm:text-2xl font-black text-white font-display tabular-nums"
          >
            {safeWallet.balance} <span className="text-xs font-bold text-amber-300">Credits</span>
          </div>
          <div className="text-[11px] font-mono text-amber-200/80">
            {formatINR(safeWallet.balance)}
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-500/25 bg-surface-deep/75 p-3.5">
          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-emerald-300">
            <span>Credits Added</span>
            <ArrowDownLeft className="w-3.5 h-3.5" />
          </div>
          <div className="mt-1.5 text-lg font-black text-white font-display tabular-nums">
            {formatINR(safeWallet.totalCreditsAdded)}
          </div>
          <div className="text-[10px] text-muted-foreground font-mono">
            {safeWallet.totalCreditsAdded} Credits
          </div>
        </div>

        <div className="rounded-2xl border border-sky-500/25 bg-surface-deep/75 p-3.5">
          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-sky-300">
            <span>Credits Spent</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </div>
          <div className="mt-1.5 text-lg font-black text-white font-display tabular-nums">
            {formatINR(safeWallet.totalCreditsSpent)}
          </div>
          <div className="text-[10px] text-muted-foreground font-mono">
            {safeWallet.totalCreditsSpent} Credits
          </div>
        </div>

        <div className="rounded-2xl border border-teal-500/25 bg-surface-deep/75 p-3.5">
          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-teal-300">
            <span>Total Refunds</span>
            <RefreshCw className="w-3.5 h-3.5" />
          </div>
          <div className="mt-1.5 text-lg font-black text-white font-display tabular-nums">
            {formatINR(safeWallet.totalRefunds)}
          </div>
          <div className="text-[10px] text-muted-foreground font-mono">
            {safeWallet.totalRefunds} Credits
          </div>
        </div>

        <div className="rounded-2xl border border-purple-500/25 bg-surface-deep/75 p-3.5">
          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-purple-300">
            <span>Promo Credits</span>
            <Gift className="w-3.5 h-3.5" />
          </div>
          <div className="mt-1.5 text-lg font-black text-white font-display tabular-nums">
            {formatINR(safeWallet.totalPromotionalCredits)}
          </div>
          <div className="text-[10px] text-muted-foreground font-mono">
            {safeWallet.totalPromotionalCredits} Credits
          </div>
        </div>
      </div>

      {/* Add Money / Wallet Recharge Card */}
      <form
        onSubmit={handleStartRecharge}
        className="rounded-2xl border border-sky-500/25 bg-surface-deep/75 p-4 sm:p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sky-500/15 pb-3">
          <div className="flex items-center gap-2">
            <PlusCircle className="w-4 h-4 text-emerald-400" />
            <h4 className="text-xs sm:text-sm font-black uppercase tracking-wider text-white">
              Add Money / Wallet Recharge
            </h4>
          </div>
          <span className="text-[11px] font-mono text-emerald-300">
            {gatewayConfig?.upiQrEnabled === false
              ? 'UPI QR Paused by Admin'
              : 'WonderPay UPI QR • 1 Credit = ₹1 INR'}
          </span>
        </div>

        {/* Preset Buttons */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {WALLET_RECHARGE_PRESETS.map((preset) => {
            const active = !customAmountInput.trim() && selectedAmount === preset;
            return (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  setCustomAmountInput('');
                  setSelectedAmount(preset);
                }}
                className={`rounded-xl border py-2.5 px-2 text-xs font-black font-mono transition-all cursor-pointer ${
                  active
                    ? 'border-sky-400 bg-sky-500/25 text-sky-200 shadow-md ring-1 ring-sky-400/50'
                    : 'border-sky-500/20 bg-surface text-foreground hover:border-sky-400'
                }`}
              >
                ₹{preset}
              </button>
            );
          })}

          <div className="col-span-3 sm:col-span-1">
            <input
              type="number"
              min={1}
              max={100000}
              step="1"
              value={customAmountInput}
              onChange={(e) => setCustomAmountInput(e.target.value)}
              placeholder="Custom ₹"
              aria-label="Custom recharge amount"
              className="w-full h-full min-h-[42px] rounded-xl border border-sky-500/30 bg-surface px-3 py-2 text-xs font-mono font-bold text-white outline-none focus:border-sky-400"
            />
          </div>
        </div>

        {/* Method Selection & Submit */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase text-muted-foreground mr-1">
              Method:
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-sky-400 bg-sky-500/20 px-3 py-1.5 text-[11px] font-black uppercase text-sky-200">
              <Smartphone className="w-3.5 h-3.5" />
              <span>UPI (GPay / PhonePe / Paytm / QR)</span>
            </span>
          </div>

          <button
            type="submit"
            disabled={gatewayConfig?.upiQrEnabled === false}
            data-testid="wallet-recharge-submit-btn"
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-500 via-blue-600 to-sky-500 px-5 py-3 text-xs font-black uppercase tracking-wider text-white hover:brightness-110 transition-all shadow-lg shadow-sky-950/50 cursor-pointer disabled:opacity-50 font-display"
          >
            <PlusCircle className="w-4 h-4" />
            <span>
              Add {Number.isFinite(effectiveAmount) && effectiveAmount > 0 ? formatINR(effectiveAmount) : 'Money'} (
              {Number.isFinite(effectiveAmount) && effectiveAmount > 0 ? effectiveAmount : 0} Credits)
            </span>
          </button>
        </div>
      </form>

      {/* Claim Coupon / Redeem Code Section */}
      <div className="rounded-2xl border border-purple-500/30 bg-gradient-to-br from-purple-950/40 via-surface-deep/80 to-[#120f2e]/60 p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-purple-500/20 pb-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-purple-500/20 border border-purple-400/40 flex items-center justify-center text-purple-300">
              <Gift className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-black uppercase tracking-wider text-white">
                Claim Coupon / Redeem Code
              </h4>
              <p className="text-[11px] text-purple-200/70">
                Redeem promotional vouchers &amp; gift codes directly into wallet credits (1 Credit = ₹1 INR).
              </p>
            </div>
          </div>
          <span className="rounded-lg bg-purple-500/20 border border-purple-400/30 px-2.5 py-1 text-[10px] font-black uppercase text-purple-300 font-mono">
            Instant Credit
          </span>
        </div>

        <form onSubmit={handleClaimCoupon} className="space-y-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <div className="relative flex-1">
              <Ticket className="w-4 h-4 text-purple-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={couponCodeInput}
                onChange={(e) => {
                  setCouponCodeInput(e.target.value.toUpperCase());
                  setCouponError(null);
                }}
                placeholder="Enter coupon code (e.g. WONDER500)"
                aria-label="Coupon code input"
                data-testid="wallet-coupon-code-input"
                className="w-full rounded-xl border border-purple-500/30 bg-surface px-3 pl-9 py-2.5 text-xs font-mono font-bold tracking-wider text-white placeholder:text-muted-foreground uppercase outline-none focus:border-purple-400"
              />
            </div>

            <button
              type="submit"
              disabled={isClaimingCoupon || !couponCodeInput.trim()}
              data-testid="wallet-claim-coupon-btn"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 via-fuchsia-500 to-indigo-500 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:brightness-110 transition-all shadow-md shadow-purple-950/40 cursor-pointer disabled:opacity-50"
            >
              {isClaimingCoupon ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Validating...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Claim Coupon</span>
                </>
              )}
            </button>
          </div>

          {/* Error Message */}
          {couponError && (
            <div
              data-testid="wallet-coupon-error"
              className="flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-950/50 p-3 text-xs font-bold text-rose-200"
            >
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{couponError}</span>
            </div>
          )}

          {/* Success Message & Breakdown */}
          {couponResult && couponResult.success && (
            <div
              data-testid="wallet-coupon-success-card"
              className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 p-3.5 space-y-2 text-xs"
            >
              <div className="flex items-center gap-2 text-emerald-300 font-black">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Coupon &quot;{couponResult.code}&quot; successfully redeemed!</span>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1 text-center font-mono">
                <div className="rounded-lg bg-black/40 p-2 border border-emerald-500/20">
                  <span className="text-[10px] text-muted-foreground block font-sans uppercase">Previous Balance</span>
                  <span className="text-white font-bold">{formatINR(couponResult.previousBalance)}</span>
                </div>
                <div className="rounded-lg bg-emerald-500/20 p-2 border border-emerald-400/40">
                  <span className="text-[10px] text-emerald-300 block font-sans uppercase">Coupon Reward</span>
                  <span className="text-emerald-300 font-black">+{formatINR(couponResult.rewardAmount)}</span>
                </div>
                <div className="rounded-lg bg-black/40 p-2 border border-emerald-500/20">
                  <span className="text-[10px] text-muted-foreground block font-sans uppercase">New Balance</span>
                  <span className="text-white font-bold">{formatINR(couponResult.newBalance)}</span>
                </div>
              </div>
            </div>
          )}
        </form>
      </div>

      {/* Wallet Ledger Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => setLedgerTab('transactions')}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 sm:px-3.5 py-2 text-xs font-black uppercase transition-colors cursor-pointer ${
              ledgerTab === 'transactions'
                ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20'
                : 'bg-surface-deep text-muted-foreground hover:text-white border border-sky-500/20'
            }`}
          >
            <History className="w-3.5 h-3.5 shrink-0" />
            <span>Transactions ({transactions.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setLedgerTab('recharges')}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 sm:px-3.5 py-2 text-xs font-black uppercase transition-colors cursor-pointer ${
              ledgerTab === 'recharges'
                ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20'
                : 'bg-surface-deep text-muted-foreground hover:text-white border border-sky-500/20'
            }`}
          >
            <Coins className="w-3.5 h-3.5 shrink-0" />
            <span>Recharges ({recharges.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setLedgerTab('coupons')}
            data-testid="wallet-ledger-coupons-tab"
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 sm:px-3.5 py-2 text-xs font-black uppercase transition-colors cursor-pointer ${
              ledgerTab === 'coupons'
                ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20'
                : 'bg-surface-deep text-muted-foreground hover:text-white border border-sky-500/20'
            }`}
          >
            <Ticket className="w-3.5 h-3.5 shrink-0" />
            <span>Coupons ({userCouponRedemptions.length})</span>
          </button>
        </div>

        {ledgerTab === 'transactions' && (
          <div className="flex flex-wrap items-center gap-2 flex-1 sm:flex-initial justify-end">
            <select
              value={txTypeFilter}
              onChange={(e) => setTxTypeFilter(e.target.value)}
              className="rounded-xl border border-sky-500/20 bg-surface-deep px-2.5 py-1.5 text-xs font-bold text-foreground outline-none"
            >
              <option value="all">All Types</option>
              <option value="wallet_recharge">Wallet Recharge</option>
              <option value="COUPON_REWARD">Coupon Reward</option>
              <option value="product_purchase">Product Purchase</option>
              <option value="refund">Refund</option>
              <option value="admin_credit">Admin Credit</option>
              <option value="admin_debit">Admin Debit</option>
              <option value="promotional_credit">Promotional Credit</option>
            </select>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={txSearch}
                onChange={(e) => setTxSearch(e.target.value)}
                placeholder="Search ID, order, desc..."
                className="rounded-xl border border-sky-500/20 bg-surface-deep pl-8 pr-3 py-1.5 text-xs text-foreground outline-none focus:border-sky-400"
              />
            </div>
          </div>
        )}
      </div>

      {/* Transaction History Table */}
      {ledgerTab === 'transactions' ? (
        filteredTransactions.length === 0 ? (
          <div className="rounded-2xl border border-sky-500/15 bg-surface-deep/50 py-10 text-center text-xs text-muted-foreground">
            No wallet transactions recorded yet. Recharge your wallet or complete a purchase to see every balance update here.
          </div>
        ) : (
          <div className="rounded-2xl border border-sky-500/20 bg-surface-deep/60 overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[760px]">
              <thead className="bg-black/30 text-[10px] font-black uppercase tracking-wider text-sky-300 border-b border-sky-500/20">
                <tr>
                  <th className="p-3">Transaction ID</th>
                  <th className="p-3">Date &amp; Time</th>
                  <th className="p-3">Type</th>
                  <th className="p-3 text-right">Amount</th>
                  <th className="p-3 text-right">Prev Balance</th>
                  <th className="p-3 text-right">Updated Balance</th>
                  <th className="p-3">Description</th>
                  <th className="p-3">Order ID</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sky-500/10">
                {filteredTransactions.map((tx) => {
                  const isDebit =
                    (tx.type === 'product_purchase' || tx.type === 'admin_debit') ||
                    tx.updatedBalance < tx.previousBalance;
                  return (
                    <tr key={tx.id} className="hover:bg-white/[0.02]">
                      <td className="p-3 font-mono font-bold text-white">
                        <div>{tx.id}</div>
                        {tx.transactionRef && tx.transactionRef !== tx.id && (
                          <div className="text-[10px] text-slate-400">{tx.transactionRef}</div>
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground whitespace-nowrap font-mono text-[11px]">
                        {formatISTDateTime(tx.createdAt)}
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded bg-sky-500/15 border border-sky-500/30 text-[10px] font-black uppercase text-sky-300 whitespace-nowrap">
                          {getWalletTxTypeLabel(tx.type)}
                        </span>
                      </td>
                      <td
                        className={`p-3 text-right font-mono font-black whitespace-nowrap ${
                          tx.status === 'failed' || tx.status === 'cancelled'
                            ? 'text-rose-400'
                            : isDebit
                            ? 'text-rose-300'
                            : 'text-emerald-400'
                        }`}
                      >
                        {tx.status === 'failed' || tx.status === 'cancelled'
                          ? formatINR(tx.amount)
                          : `${isDebit ? '-' : '+'}${formatINR(tx.amount)}`}
                      </td>
                      <td className="p-3 text-right font-mono text-slate-300">
                        {formatINR(tx.previousBalance)}
                      </td>
                      <td className="p-3 text-right font-mono font-black text-white">
                        {formatINR(tx.updatedBalance)}
                      </td>
                      <td className="p-3 text-slate-200 max-w-[220px]">{tx.description}</td>
                      <td className="p-3 font-mono text-[11px] text-amber-300 whitespace-nowrap">
                        {tx.relatedOrderId || '—'}
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${
                            tx.status === 'successful'
                              ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                              : tx.status === 'failed' || tx.status === 'cancelled'
                              ? 'border-rose-500/40 bg-rose-500/15 text-rose-300'
                              : 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                          }`}
                        >
                          {getPaymentStatusLabel(tx.status)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : ledgerTab === 'recharges' ? (
        recharges.length === 0 ? (
          <div className="rounded-2xl border border-sky-500/15 bg-surface-deep/50 py-10 text-center text-xs text-muted-foreground">
            No wallet recharge attempts yet.
          </div>
        ) : (
          <div className="rounded-2xl border border-sky-500/20 bg-surface-deep/60 overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[680px]">
              <thead className="bg-black/30 text-[10px] font-black uppercase tracking-wider text-sky-300 border-b border-sky-500/20">
                <tr>
                  <th className="p-3">Recharge ID</th>
                  <th className="p-3">Date &amp; Time</th>
                  <th className="p-3">Method</th>
                  <th className="p-3 text-right">Amount</th>
                  <th className="p-3">Gateway Txn ID</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sky-500/10">
                {recharges.map((r) => (
                  <tr key={r.id} className="hover:bg-white/[0.02]">
                    <td className="p-3 font-mono font-bold text-white">{r.rechargeRef}</td>
                    <td className="p-3 text-muted-foreground font-mono text-[11px] whitespace-nowrap">
                      {formatISTDateTime(r.createdAt)}
                    </td>
                    <td className="p-3 uppercase font-bold text-sky-300">{r.paymentMethod}</td>
                    <td className="p-3 text-right font-mono font-black text-amber-300">
                      {formatINR(r.amount)} ({r.credits} Cr)
                    </td>
                    <td className="p-3 font-mono text-[11px] text-slate-300">
                      {r.gatewayPaymentId || r.gatewayOrderId || '—'}
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${
                          r.status === 'successful'
                            ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                            : r.status === 'failed' || r.status === 'cancelled'
                            ? 'border-rose-500/40 bg-rose-500/15 text-rose-300'
                            : 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                        }`}
                      >
                        {getPaymentStatusLabel(r.status)}
                      </span>
                    </td>
                    <td className="p-3 text-slate-300 text-[11px]">
                      {r.failureReason || (r.status === 'successful' ? 'Signature verified' : 'Awaiting gateway')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {/* Redeemed Coupons Table View */}
      {ledgerTab === 'coupons' && (
        userCouponRedemptions.length === 0 ? (
          <div className="rounded-2xl border border-purple-500/20 bg-surface-deep/50 py-10 text-center text-xs text-muted-foreground">
            No redeemed coupons yet. Enter an active coupon code above to claim wallet credits!
          </div>
        ) : (
          <div className="rounded-2xl border border-purple-500/20 bg-surface-deep/60 overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[700px]">
              <thead className="bg-black/30 text-[10px] font-black uppercase tracking-wider text-purple-300 border-b border-purple-500/20">
                <tr>
                  <th className="p-3">Coupon Code</th>
                  <th className="p-3">Redemption Date &amp; Time</th>
                  <th className="p-3 text-right">Credited Reward</th>
                  <th className="p-3 text-right">Prev Balance</th>
                  <th className="p-3 text-right">New Balance</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Transaction Ref</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-500/10 font-mono">
                {userCouponRedemptions.map((red) => (
                  <tr key={red.id} className="hover:bg-purple-500/5 transition-colors">
                    <td className="p-3 font-bold text-white">
                      <div className="flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-purple-400" />
                        <span className="font-mono tracking-wider">{red.couponCode}</span>
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground text-[11px]">
                      {formatISTDateTime(red.createdAt)}
                    </td>
                    <td className="p-3 text-right font-black text-emerald-400">
                      +{formatINR(red.rewardAmount)}
                    </td>
                    <td className="p-3 text-right text-muted-foreground">
                      {formatINR(red.previousBalance)}
                    </td>
                    <td className="p-3 text-right font-bold text-white">
                      {formatINR(red.newBalance)}
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase border border-emerald-500/40 bg-emerald-500/15 text-emerald-300">
                        Redeemed
                      </span>
                    </td>
                    <td className="p-3 text-muted-foreground text-[11px]">
                      {red.walletTransactionId || red.id}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

    </div>
  );
};
