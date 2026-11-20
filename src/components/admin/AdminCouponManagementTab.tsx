import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Edit3,
  Filter,
  Gift,
  History,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Tag,
  Ticket,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useWallet } from '../../context/WalletContext';
import { useToast } from '../../context/ToastContext';
import { formatINR } from '../../config/storeDefaults';
import { formatISTDateTime } from '../../utils/dateUtils';
import {
  computeCouponStatus,
  filterWalletCoupons,
  filterWalletCouponRedemptions,
  generateRandomCouponCode,
  normalizeCouponCode,
  validateCouponCodeFormat,
} from '../../utils/couponHelpers';
import type {
  WalletCoupon,
  WalletCouponRedemption,
  WalletCouponStatus,
  WalletCouponType,
} from '../../types';

interface AdminCouponManagementTabProps {
  onLogActivity?: (action: string, details: string, type?: any) => void;
}

export const AdminCouponManagementTab: React.FC<AdminCouponManagementTabProps> = ({
  onLogActivity,
}) => {
  const {
    adminCoupons,
    adminCouponRedemptions,
    isLoadingCoupons,
    refreshAdminCoupons,
    createCouponByAdmin,
    updateCouponByAdmin,
    deleteCouponByAdmin,
  } = useWallet();
  const { success, error } = useToast();

  const [activeSection, setActiveSection] = useState<'coupons' | 'history'>('coupons');
  const [couponSearch, setCouponSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expired' | 'disabled'>('all');
  const [historySearch, setHistorySearch] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<WalletCoupon | null>(null);
  const [modalCode, setModalCode] = useState('');
  const [modalReward, setModalReward] = useState('500');
  const [modalType, setModalType] = useState<WalletCouponType>('multi_use');
  const [modalTotalLimit, setModalTotalLimit] = useState('');
  const [modalPerUserLimit, setModalPerUserLimit] = useState('1');
  const [modalStartDate, setModalStartDate] = useState('');
  const [modalExpiryDate, setModalExpiryDate] = useState('');
  const [modalStatus, setModalStatus] = useState<WalletCouponStatus>('active');
  const [modalDescription, setModalDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Delete Confirm State
  const [deleteTarget, setDeleteTarget] = useState<WalletCoupon | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Copied Code State
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Stats calculation
  const totalCoupons = adminCoupons.length;
  const activeCouponsCount = useMemo(() => {
    return adminCoupons.filter((c) => computeCouponStatus(c) === 'active').length;
  }, [adminCoupons]);
  const totalRedemptionsCount = adminCouponRedemptions.length;
  const totalCreditsClaimed = useMemo(() => {
    return adminCouponRedemptions.reduce((acc, r) => acc + (r.rewardAmount || 0), 0);
  }, [adminCouponRedemptions]);

  // Filtered lists
  const filteredCoupons = useMemo(() => {
    return filterWalletCoupons(adminCoupons, couponSearch, statusFilter);
  }, [adminCoupons, couponSearch, statusFilter]);

  const filteredHistory = useMemo(() => {
    return filterWalletCouponRedemptions(adminCouponRedemptions, historySearch);
  }, [adminCouponRedemptions, historySearch]);

  const handleCopy = (code: string) => {
    navigator.clipboard?.writeText(code);
    setCopiedCode(code);
    success(`Copied code "${code}" to clipboard!`);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const openCreateModal = () => {
    setEditingCoupon(null);
    setModalCode(generateRandomCouponCode('WONDER', 4));
    setModalReward('500');
    setModalType('multi_use');
    setModalTotalLimit('100');
    setModalPerUserLimit('1');
    setModalStartDate('');
    setModalExpiryDate('');
    setModalStatus('active');
    setModalDescription('');
    setModalError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (coupon: WalletCoupon) => {
    setEditingCoupon(coupon);
    setModalCode(coupon.code);
    setModalReward(String(coupon.rewardAmount));
    setModalType(coupon.couponType);
    setModalTotalLimit(coupon.totalLimit ? String(coupon.totalLimit) : '');
    setModalPerUserLimit(String(coupon.perUserLimit || 1));
    setModalStartDate(coupon.startDate || '');
    setModalExpiryDate(coupon.expiryDate || '');
    setModalStatus(coupon.status);
    setModalDescription(coupon.description || '');
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleGenerateRandomCode = () => {
    const code = generateRandomCouponCode('WONDER', 5);
    setModalCode(code);
  };

  const handleSubmitModal = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    const val = validateCouponCodeFormat(modalCode);
    if (!val.valid) {
      setModalError(val.error || 'Invalid coupon code format.');
      return;
    }

    const reward = Number(modalReward);
    if (!Number.isFinite(reward) || reward < 1) {
      setModalError('Reward amount must be at least ₹1 INR.');
      return;
    }

    const totalLimitNum = modalType === 'single_use' ? 1 : modalTotalLimit.trim() ? Number(modalTotalLimit) : null;
    if (totalLimitNum !== null && (!Number.isFinite(totalLimitNum) || totalLimitNum < 1)) {
      setModalError('Total limit must be a positive integer or left blank.');
      return;
    }

    const perUserLimitNum = modalType === 'single_use' ? 1 : modalPerUserLimit.trim() ? Number(modalPerUserLimit) : 1;
    if (!Number.isFinite(perUserLimitNum) || perUserLimitNum < 1) {
      setModalError('Per-user limit must be at least 1.');
      return;
    }

    if (modalStartDate && modalExpiryDate && modalStartDate > modalExpiryDate) {
      setModalError('Start date cannot be after expiry date.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingCoupon) {
        const updated = await updateCouponByAdmin(editingCoupon.id, {
          code: val.normalized,
          rewardAmount: reward,
          couponType: modalType,
          totalLimit: totalLimitNum,
          perUserLimit: perUserLimitNum,
          startDate: modalStartDate || undefined,
          expiryDate: modalExpiryDate || undefined,
          status: modalStatus,
          description: modalDescription || undefined,
        });
        success(`Coupon "${updated.code}" updated successfully.`);
        onLogActivity?.('coupon_update', `Updated coupon ${updated.code} (₹${reward})`, 'wallet_coupon');
      } else {
        const created = await createCouponByAdmin({
          code: val.normalized,
          rewardAmount: reward,
          couponType: modalType,
          totalLimit: totalLimitNum,
          perUserLimit: perUserLimitNum,
          startDate: modalStartDate || undefined,
          expiryDate: modalExpiryDate || undefined,
          status: modalStatus,
          description: modalDescription || undefined,
        });
        success(`New coupon "${created.code}" created with ₹${reward} reward.`);
        onLogActivity?.('coupon_create', `Created new coupon ${created.code} (₹${reward})`, 'wallet_coupon');
      }
      setIsModalOpen(false);
    } catch (err: any) {
      setModalError(err?.message || 'Failed to save coupon.');
      error(err?.message || 'Failed to save coupon.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (coupon: WalletCoupon) => {
    const nextStatus: WalletCouponStatus = coupon.status === 'active' ? 'disabled' : 'active';
    try {
      await updateCouponByAdmin(coupon.id, { status: nextStatus });
      success(`Coupon "${coupon.code}" is now ${nextStatus.toUpperCase()}.`);
      onLogActivity?.('coupon_status_toggle', `Set coupon ${coupon.code} status to ${nextStatus}`, 'wallet_coupon');
    } catch (err: any) {
      error(err?.message || 'Failed to toggle status.');
    }
  };

  const handleDeleteCoupon = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteCouponByAdmin(deleteTarget.id);
      success(`Coupon "${deleteTarget.code}" deleted permanently.`);
      onLogActivity?.('coupon_delete', `Deleted coupon ${deleteTarget.code}`, 'wallet_coupon');
      setDeleteTarget(null);
    } catch (err: any) {
      error(err?.message || 'Failed to delete coupon.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-purple-500/30 bg-gradient-to-r from-purple-950/60 via-[#160d33] to-surface-deep p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-purple-500/20 border border-purple-400/40 flex items-center justify-center text-purple-300 shrink-0">
            <Ticket className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-black uppercase tracking-wide text-white font-display">
                COUPON MANAGEMENT
              </h2>
              <span className="rounded bg-purple-500/20 border border-purple-400/40 px-2 py-0.5 text-[10px] font-black uppercase text-purple-300 font-mono">
                Wallet Vouchers &amp; Rewards
              </span>
            </div>
            <p className="text-xs text-purple-200/80 mt-0.5">
              Create custom and randomly generated coupon codes, enforce limits and single-use locks, and inspect player redemption audit logs.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refreshAdminCoupons()}
            disabled={isLoadingCoupons}
            className="inline-flex items-center gap-1.5 rounded-xl border border-purple-500/30 bg-surface px-3 py-2 text-xs font-bold text-purple-200 hover:border-purple-400 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingCoupons ? 'animate-spin text-purple-400' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            data-testid="admin-create-coupon-btn"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 via-fuchsia-500 to-indigo-500 px-4 py-2 text-xs font-black uppercase tracking-wider text-white hover:brightness-110 shadow-lg shadow-purple-950/50 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create Coupon</span>
          </button>
        </div>
      </div>

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-purple-500/25 bg-surface-deep/75 p-3.5">
          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-purple-300">
            <span>Total Coupons</span>
            <Tag className="w-3.5 h-3.5" />
          </div>
          <div className="mt-1.5 text-xl font-black text-white font-display tabular-nums">
            {totalCoupons}
          </div>
          <div className="text-[10px] text-muted-foreground font-mono">
            All created codes
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-500/25 bg-surface-deep/75 p-3.5">
          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-emerald-300">
            <span>Active Coupons</span>
            <CheckCircle2 className="w-3.5 h-3.5" />
          </div>
          <div className="mt-1.5 text-xl font-black text-white font-display tabular-nums">
            {activeCouponsCount}
          </div>
          <div className="text-[10px] text-muted-foreground font-mono">
            Currently redeemable
          </div>
        </div>

        <div className="rounded-2xl border border-sky-500/25 bg-surface-deep/75 p-3.5">
          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-sky-300">
            <span>Total Redemptions</span>
            <Users className="w-3.5 h-3.5" />
          </div>
          <div className="mt-1.5 text-xl font-black text-white font-display tabular-nums">
            {totalRedemptionsCount}
          </div>
          <div className="text-[10px] text-muted-foreground font-mono">
            Player claims processed
          </div>
        </div>

        <div className="rounded-2xl border border-amber-400/30 bg-surface-deep/75 p-3.5">
          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-amber-300">
            <span>Credits Claimed</span>
            <Gift className="w-3.5 h-3.5" />
          </div>
          <div className="mt-1.5 text-xl font-black text-white font-display tabular-nums">
            {formatINR(totalCreditsClaimed)}
          </div>
          <div className="text-[10px] text-amber-200/70 font-mono">
            {totalCreditsClaimed} Credits credited
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveSection('coupons')}
            data-testid="admin-coupons-list-tab"
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wider transition-colors cursor-pointer ${
              activeSection === 'coupons'
                ? 'bg-purple-500 text-white shadow-md shadow-purple-500/20'
                : 'bg-surface-deep text-muted-foreground hover:text-white border border-purple-500/20'
            }`}
          >
            <Ticket className="w-3.5 h-3.5" />
            <span>Coupons List ({adminCoupons.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('history')}
            data-testid="admin-redemptions-history-tab"
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wider transition-colors cursor-pointer ${
              activeSection === 'history'
                ? 'bg-purple-500 text-white shadow-md shadow-purple-500/20'
                : 'bg-surface-deep text-muted-foreground hover:text-white border border-purple-500/20'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Redemption History ({adminCouponRedemptions.length})</span>
          </button>
        </div>

        {activeSection === 'coupons' ? (
          <div className="flex flex-wrap items-center gap-2">
            {/* Filter Pills */}
            <div className="flex items-center gap-1 rounded-xl border border-purple-500/20 bg-surface-deep p-1 text-[11px] font-bold">
              {(['all', 'active', 'expired', 'disabled'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`rounded-lg px-2.5 py-1 uppercase transition-colors cursor-pointer ${
                    statusFilter === st
                      ? 'bg-purple-500 text-white'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={couponSearch}
                onChange={(e) => setCouponSearch(e.target.value)}
                placeholder="Search coupon code or note..."
                className="rounded-xl border border-purple-500/20 bg-surface-deep pl-8 pr-3 py-1.5 text-xs text-foreground outline-none focus:border-purple-400"
              />
            </div>
          </div>
        ) : (
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder="Search code, username, email, user ID..."
              className="rounded-xl border border-purple-500/20 bg-surface-deep pl-8 pr-3 py-1.5 text-xs text-foreground outline-none focus:border-purple-400 min-w-[260px]"
            />
          </div>
        )}
      </div>

      {/* SECTION 1: COUPONS LIST */}
      {activeSection === 'coupons' && (
        filteredCoupons.length === 0 ? (
          <div className="rounded-2xl border border-purple-500/20 bg-surface-deep/50 py-12 text-center text-xs text-muted-foreground space-y-3">
            <Ticket className="w-8 h-8 text-purple-400 mx-auto opacity-50" />
            <p>No coupons match your filter or search criteria.</p>
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 rounded-xl border border-purple-500/30 bg-purple-500/20 px-3 py-1.5 text-xs font-bold text-purple-200 hover:border-purple-400 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Coupon Code</span>
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-purple-500/20 bg-surface-deep/60 overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[850px]">
              <thead className="bg-black/30 text-[10px] font-black uppercase tracking-wider text-purple-300 border-b border-purple-500/20">
                <tr>
                  <th className="p-3">Coupon Code</th>
                  <th className="p-3">Reward</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Total Claims</th>
                  <th className="p-3">Per-User Limit</th>
                  <th className="p-3">Validity</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-500/10 font-mono">
                {filteredCoupons.map((coupon) => {
                  const computed = computeCouponStatus(coupon);
                  return (
                    <tr key={coupon.id} className="hover:bg-purple-500/5 transition-colors">
                      <td className="p-3 font-bold text-white">
                        <div className="flex items-center gap-2">
                          <Tag className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                          <span className="tracking-wider text-amber-200 font-mono">{coupon.code}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(coupon.code)}
                            title="Copy code"
                            className="text-muted-foreground hover:text-white p-1 rounded hover:bg-white/10 transition-colors cursor-pointer"
                          >
                            {copiedCode === coupon.code ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                        {coupon.description && (
                          <div className="text-[10px] text-muted-foreground font-sans mt-0.5 max-w-[200px] truncate">
                            {coupon.description}
                          </div>
                        )}
                      </td>
                      <td className="p-3 font-black text-emerald-400">
                        +{formatINR(coupon.rewardAmount)}
                        <span className="text-[10px] text-muted-foreground font-normal ml-1">
                          ({coupon.rewardAmount} Cr)
                        </span>
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${
                            coupon.couponType === 'single_use'
                              ? 'border-fuchsia-500/40 bg-fuchsia-500/15 text-fuchsia-300'
                              : coupon.couponType === 'user_limited'
                              ? 'border-sky-500/40 bg-sky-500/15 text-sky-300'
                              : 'border-purple-500/40 bg-purple-500/15 text-purple-300'
                          }`}
                        >
                          {coupon.couponType === 'single_use'
                            ? 'Single Use (1 Claim)'
                            : coupon.couponType === 'user_limited'
                            ? 'User Limited'
                            : 'Multi Use'}
                        </span>
                      </td>
                      <td className="p-3 text-slate-200">
                        <span className="font-bold">{coupon.redeemedCount}</span>
                        <span className="text-muted-foreground">
                          {' '}/ {coupon.totalLimit ? coupon.totalLimit : '∞ Unlimited'}
                        </span>
                      </td>
                      <td className="p-3 text-slate-300">
                        {coupon.perUserLimit || 1} per player
                      </td>
                      <td className="p-3 text-[11px] text-muted-foreground">
                        {coupon.startDate || coupon.expiryDate ? (
                          <div className="space-y-0.5">
                            {coupon.startDate && <div>From: {coupon.startDate}</div>}
                            {coupon.expiryDate && <div>Until: {coupon.expiryDate}</div>}
                          </div>
                        ) : (
                          <span className="text-slate-400">No Expiry</span>
                        )}
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${
                            computed === 'active'
                              ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                              : computed === 'disabled'
                              ? 'border-slate-500/40 bg-slate-500/15 text-slate-300'
                              : computed === 'depleted'
                              ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                              : 'border-rose-500/40 bg-rose-500/15 text-rose-300'
                          }`}
                        >
                          {computed === 'depleted' ? 'LIMIT REACHED' : computed.toUpperCase()}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <div className="inline-flex items-center gap-1.5 font-sans">
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(coupon)}
                            className={`rounded-lg px-2 py-1 text-[11px] font-bold border transition-colors cursor-pointer ${
                              coupon.status === 'active'
                                ? 'border-amber-500/30 text-amber-300 hover:bg-amber-500/10'
                                : 'border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10'
                            }`}
                          >
                            {coupon.status === 'active' ? 'Disable' : 'Enable'}
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(coupon)}
                            className="rounded-lg p-1.5 text-muted-foreground hover:text-white border border-border/50 hover:border-purple-400 hover:bg-purple-500/10 transition-colors cursor-pointer"
                            title="Edit Coupon"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(coupon)}
                            className="rounded-lg p-1.5 text-rose-400 hover:text-rose-200 border border-border/50 hover:border-rose-500/40 hover:bg-rose-500/10 transition-colors cursor-pointer"
                            title="Delete Coupon"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* SECTION 2: REDEMPTION AUDIT HISTORY */}
      {activeSection === 'history' && (
        filteredHistory.length === 0 ? (
          <div className="rounded-2xl border border-purple-500/20 bg-surface-deep/50 py-12 text-center text-xs text-muted-foreground">
            No coupon redemptions recorded yet. As players claim vouchers, every transaction is logged here in real-time.
          </div>
        ) : (
          <div className="rounded-2xl border border-purple-500/20 bg-surface-deep/60 overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[850px]">
              <thead className="bg-black/30 text-[10px] font-black uppercase tracking-wider text-purple-300 border-b border-purple-500/20">
                <tr>
                  <th className="p-3">Coupon Code</th>
                  <th className="p-3">Player / User</th>
                  <th className="p-3">User ID</th>
                  <th className="p-3 text-right">Reward</th>
                  <th className="p-3 text-right">Prev Balance</th>
                  <th className="p-3 text-right">New Balance</th>
                  <th className="p-3">Redemption Time</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Tx Ref</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-500/10 font-mono">
                {filteredHistory.map((red) => (
                  <tr key={red.id} className="hover:bg-purple-500/5 transition-colors">
                    <td className="p-3 font-bold text-amber-200">
                      <div className="flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-purple-400" />
                        <span>{red.couponCode}</span>
                      </div>
                    </td>
                    <td className="p-3 font-sans">
                      <div className="font-bold text-white">{red.username || 'Player'}</div>
                      <div className="text-[11px] text-muted-foreground">{red.userEmail || '—'}</div>
                    </td>
                    <td className="p-3 text-[11px] text-muted-foreground font-mono">
                      {red.userId.slice(0, 14)}...
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
                    <td className="p-3 text-[11px] text-muted-foreground">
                      {formatISTDateTime(red.createdAt)}
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase border border-emerald-500/40 bg-emerald-500/15 text-emerald-300">
                        {red.status || 'SUCCESS'}
                      </span>
                    </td>
                    <td className="p-3 text-[11px] text-muted-foreground">
                      {red.walletTransactionId || red.id}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* CREATE / EDIT COUPON MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-2xl border border-purple-500/40 bg-[#0d091e] p-5 sm:p-6 shadow-2xl max-h-[92vh] overflow-y-auto space-y-4">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 rounded-xl border border-white/10 bg-surface-deep p-1.5 text-muted-foreground hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 border-b border-purple-500/20 pb-3">
              <div className="h-10 w-10 rounded-xl bg-purple-500/20 border border-purple-400/40 flex items-center justify-center text-purple-300">
                <Ticket className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-white font-display">
                  {editingCoupon ? `Edit Coupon: ${editingCoupon.code}` : 'Create New Wallet Coupon'}
                </h3>
                <p className="text-xs text-purple-200/70">
                  Configure redemption reward amount, usage limits, and validity dates.
                </p>
              </div>
            </div>

            {modalError && (
              <div className="flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-950/50 p-3 text-xs font-bold text-rose-200">
                <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitModal} className="space-y-4 text-xs font-medium">
              {/* Code + Random Generator */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-black uppercase text-purple-200">
                  Coupon Code *
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={modalCode}
                    onChange={(e) => setModalCode(e.target.value.toUpperCase())}
                    placeholder="e.g. WONDER500"
                    required
                    className="flex-1 rounded-xl border border-purple-500/30 bg-surface px-3 py-2 text-xs font-mono font-bold uppercase text-white outline-none focus:border-purple-400"
                  />
                  <button
                    type="button"
                    onClick={handleGenerateRandomCode}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-purple-500/30 bg-purple-500/20 px-3 py-2 text-xs font-bold text-purple-200 hover:border-purple-400 cursor-pointer"
                    title="Generate Random Code"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-purple-300" />
                    <span>Random</span>
                  </button>
                </div>
              </div>

              {/* Reward Amount in INR */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-black uppercase text-purple-200">
                  Reward Amount (₹ INR = Wallet Credits) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-purple-300">₹</span>
                  <input
                    type="number"
                    min="1"
                    max="100000"
                    step="1"
                    value={modalReward}
                    onChange={(e) => setModalReward(e.target.value)}
                    required
                    className="w-full rounded-xl border border-purple-500/30 bg-surface pl-7 pr-3 py-2 text-xs font-mono font-bold text-white outline-none focus:border-purple-400"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  1 Wallet Credit = ₹1 INR. Players receive this exact credit amount upon redemption.
                </p>
              </div>

              {/* Coupon Type */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-black uppercase text-purple-200">
                  Coupon Type *
                </label>
                <select
                  value={modalType}
                  onChange={(e) => {
                    const t = e.target.value as WalletCouponType;
                    setModalType(t);
                    if (t === 'single_use') {
                      setModalTotalLimit('1');
                      setModalPerUserLimit('1');
                    }
                  }}
                  className="w-full rounded-xl border border-purple-500/30 bg-surface px-3 py-2 text-xs font-bold text-white outline-none focus:border-purple-400"
                >
                  <option value="multi_use">Multi Use (Unlimited or Custom Total Limit)</option>
                  <option value="single_use">Single Use (1 claim globally by 1 player)</option>
                  <option value="user_limited">User Limited (Per-user claim quota)</option>
                </select>
              </div>

              {/* Limits Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black uppercase text-purple-200">
                    Total Global Limit
                  </label>
                  <input
                    type="number"
                    min="1"
                    disabled={modalType === 'single_use'}
                    value={modalTotalLimit}
                    onChange={(e) => setModalTotalLimit(e.target.value)}
                    placeholder="Leave blank for ∞"
                    className="w-full rounded-xl border border-purple-500/30 bg-surface px-3 py-2 text-xs font-mono font-bold text-white outline-none focus:border-purple-400 disabled:opacity-40"
                  />
                  <span className="text-[10px] text-muted-foreground">
                    {modalType === 'single_use' ? 'Locked to 1' : 'Max total claims'}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-black uppercase text-purple-200">
                    Per-User Limit *
                  </label>
                  <input
                    type="number"
                    min="1"
                    disabled={modalType === 'single_use'}
                    value={modalPerUserLimit}
                    onChange={(e) => setModalPerUserLimit(e.target.value)}
                    required
                    className="w-full rounded-xl border border-purple-500/30 bg-surface px-3 py-2 text-xs font-mono font-bold text-white outline-none focus:border-purple-400 disabled:opacity-40"
                  />
                  <span className="text-[10px] text-muted-foreground">
                    {modalType === 'single_use' ? 'Locked to 1' : 'Max claims per player account'}
                  </span>
                </div>
              </div>

              {/* Validity Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black uppercase text-purple-200">
                    Start Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={modalStartDate}
                    onChange={(e) => setModalStartDate(e.target.value)}
                    className="w-full rounded-xl border border-purple-500/30 bg-surface px-3 py-2 text-xs font-mono font-bold text-white outline-none focus:border-purple-400"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-black uppercase text-purple-200">
                    Expiry Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={modalExpiryDate}
                    onChange={(e) => setModalExpiryDate(e.target.value)}
                    className="w-full rounded-xl border border-purple-500/30 bg-surface px-3 py-2 text-xs font-mono font-bold text-white outline-none focus:border-purple-400"
                  />
                </div>
              </div>

              {/* Status & Description */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black uppercase text-purple-200">
                    Status
                  </label>
                  <select
                    value={modalStatus}
                    onChange={(e) => setModalStatus(e.target.value as WalletCouponStatus)}
                    className="w-full rounded-xl border border-purple-500/30 bg-surface px-3 py-2 text-xs font-bold text-white outline-none focus:border-purple-400"
                  >
                    <option value="active">Active</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </div>

                <div className="col-span-2 space-y-1.5">
                  <label className="text-[11px] font-black uppercase text-purple-200">
                    Internal Note / Description
                  </label>
                  <input
                    type="text"
                    value={modalDescription}
                    onChange={(e) => setModalDescription(e.target.value)}
                    placeholder="e.g. Discord giveaway promo reward"
                    className="w-full rounded-xl border border-purple-500/30 bg-surface px-3 py-2 text-xs text-white outline-none focus:border-purple-400"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-purple-500/20">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-white/10 bg-surface-deep px-4 py-2 text-xs font-bold text-muted-foreground hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-500 px-5 py-2 text-xs font-black uppercase tracking-wider text-white hover:brightness-110 shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>{editingCoupon ? 'Save Changes' : 'Create Coupon'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-2xl border border-rose-500/40 bg-surface p-5 shadow-2xl space-y-3">
            <div className="flex items-center gap-2 text-rose-400 font-black text-sm">
              <AlertTriangle className="w-5 h-5" />
              <span>Delete Coupon Code</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Are you sure you want to delete coupon <strong className="text-white">{deleteTarget.code}</strong>? Players will no longer be able to claim this code.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-xl border border-white/10 bg-surface-deep px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteCoupon}
                disabled={isDeleting}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-rose-500 cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>Delete Permanently</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
