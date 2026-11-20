import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Coins,
  Eye,
  Gift,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  User as UserIcon,
  Wallet as WalletIcon,
  X,
} from 'lucide-react';
import { useWallet } from '../../context/WalletContext';
import { useToast } from '../../context/ToastContext';
import { formatINR } from '../../config/storeDefaults';
import { formatISTDateTime } from '../../utils/dateUtils';
import {
  computeWalletAdjustment,
  getPaymentStatusLabel,
  getWalletTxTypeLabel,
  type AdminWalletAdjustmentAction,
} from '../../utils/walletPaymentHelpers';
import type { UserWallet } from '../../types';
import type { AdminWalletDetailBundle } from '../../services/walletService';

interface AdminWalletManagementTabProps {
  onLogActivity?: (action: string, details: string, type?: 'wallet' | 'other') => void;
}

export const AdminWalletManagementTab: React.FC<AdminWalletManagementTabProps> = ({
  onLogActivity,
}) => {
  const {
    adminWallets,
    adminWalletOverview,
    isLoadingAdminFinance,
    refreshAdminFinanceData,
    getAdminWalletDetail,
    adjustWalletByAdmin,
  } = useWallet();
  const { success, error } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDetail, setSelectedDetail] = useState<AdminWalletDetailBundle | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Adjustment modal state
  const [adjustTarget, setAdjustTarget] = useState<UserWallet | null>(null);
  const [customUserId, setCustomUserId] = useState('');
  const [customUsername, setCustomUsername] = useState('');
  const [customEmail, setCustomEmail] = useState('');
  const [adjustAction, setAdjustAction] = useState<AdminWalletAdjustmentAction>('admin_credit');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSubmittingAdjust, setIsSubmittingAdjust] = useState(false);

  const filteredWallets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return adminWallets;
    return adminWallets.filter((w) => {
      const hay = `${w.username} ${w.email} ${w.userId}`.toLowerCase();
      return hay.includes(q);
    });
  }, [adminWallets, searchQuery]);

  const handleOpenDetail = async (userId: string) => {
    setLoadingDetail(true);
    try {
      const detail = await getAdminWalletDetail(userId);
      setSelectedDetail(detail);
    } catch (err: any) {
      error(err?.message || 'Unable to load wallet details.');
    } finally {
      setLoadingDetail(false);
    }
  };

  const openAdjustModalFor = (wallet?: UserWallet) => {
    if (wallet) {
      setAdjustTarget(wallet);
      setCustomUserId(wallet.userId);
      setCustomUsername(wallet.username);
      setCustomEmail(wallet.email);
    } else {
      setAdjustTarget(null);
      setCustomUserId('');
      setCustomUsername('');
      setCustomEmail('');
    }
    setAdjustAction('admin_credit');
    setAdjustAmount('');
    setAdjustReason('');
    setConfirmOpen(false);
  };

  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);

  const currentTargetBalance = adjustTarget
    ? adjustTarget.balance
    : adminWallets.find((w) => w.userId === customUserId.trim())?.balance || 0;

  const adjustmentPreview = computeWalletAdjustment(
    currentTargetBalance,
    adjustAction,
    Number(adjustAmount),
    adjustReason
  );

  const handleRequestConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customUserId.trim()) {
      error('Please select or enter a target User ID.');
      return;
    }
    if (!adjustmentPreview.valid) {
      error(adjustmentPreview.error || 'Invalid wallet adjustment.');
      return;
    }
    setConfirmOpen(true);
  };

  const handleExecuteAdjustment = async () => {
    if (isSubmittingAdjust) return;
    setIsSubmittingAdjust(true);
    try {
      const res = await adjustWalletByAdmin({
        userId: customUserId.trim(),
        action: adjustAction,
        amount: adjustmentPreview.amount,
        reason: adjustReason.trim(),
        username: customUsername.trim() || undefined,
        email: customEmail.trim() || undefined,
      });
      success(
        `Wallet updated for ${res.wallet.username}: New Balance ${res.wallet.balance} Credits`
      );
      onLogActivity?.(
        'Wallet Adjustment',
        `${getWalletTxTypeLabel(adjustAction)} ${formatINR(adjustmentPreview.amount)} for ${
          res.wallet.username
        } (${adjustReason.trim()})`,
        'wallet'
      );
      setIsAdjustModalOpen(false);
      setConfirmOpen(false);
      if (selectedDetail && selectedDetail.wallet.userId === res.wallet.userId) {
        const refreshed = await getAdminWalletDetail(res.wallet.userId).catch(() => null);
        if (refreshed) setSelectedDetail(refreshed);
      }
    } catch (err: any) {
      error(err?.message || 'Failed to adjust wallet.');
    } finally {
      setIsSubmittingAdjust(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border border-amber-500/30 bg-amber-500/5">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-400 shrink-0">
            <WalletIcon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-black uppercase tracking-wider text-foreground font-display">
              Wallet Management
            </h3>
            <p className="text-xs text-muted-foreground">
              Inspect user balances, transaction ledgers, and issue verified manual or promotional credit adjustments (1 Credit = ₹1 INR).
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void refreshAdminFinanceData()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface-deep px-3 py-2 text-xs font-bold text-foreground hover:border-amber-400 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAdminFinance ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={() => {
              openAdjustModalFor();
              setIsAdjustModalOpen(true);
            }}
            data-testid="admin-open-manual-adjust-btn"
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-black uppercase text-slate-950 hover:brightness-110 cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Manual Adjustment</span>
          </button>
        </div>
      </div>

      {/* Overview Metrics */}
      {adminWalletOverview && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Total Wallets" value={String(adminWalletOverview.totalWallets)} />
          <StatCard
            label="Active Balances"
            value={formatINR(adminWalletOverview.totalOutstandingBalance)}
            accent="text-amber-300"
          />
          <StatCard
            label="Total Added"
            value={formatINR(adminWalletOverview.totalCreditsAdded)}
            accent="text-emerald-400"
          />
          <StatCard
            label="Total Spent"
            value={formatINR(adminWalletOverview.totalCreditsSpent)}
            accent="text-sky-400"
          />
          <StatCard
            label="Total Refunds"
            value={formatINR(adminWalletOverview.totalRefunds)}
            accent="text-teal-400"
          />
          <StatCard
            label="Promo Credits"
            value={formatINR(adminWalletOverview.totalPromotionalCredits)}
            accent="text-purple-400"
          />
        </div>
      )}

      {/* Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search user wallet by username, email, or User ID..."
            className="w-full rounded-xl border border-border bg-surface-deep pl-9 pr-3 py-2 text-xs text-foreground outline-none focus:border-amber-400"
          />
        </div>
        <span className="text-xs font-mono text-muted-foreground">
          Showing {filteredWallets.length} wallet{filteredWallets.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Wallets Table */}
      {filteredWallets.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface-deep/60 py-12 text-center text-xs text-muted-foreground">
          {adminWallets.length === 0
            ? 'No player wallets exist yet. A wallet is created automatically when a user logs in or recharges.'
            : 'No wallets match your search query.'}
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-surface-deep/60 overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[780px]">
            <thead className="bg-black/30 text-[10px] font-black uppercase tracking-wider text-muted-foreground border-b border-border">
              <tr>
                <th className="p-3.5">Player / Email</th>
                <th className="p-3.5">User ID</th>
                <th className="p-3.5 text-right">Available Balance</th>
                <th className="p-3.5 text-right">Credits Added</th>
                <th className="p-3.5 text-right">Credits Spent</th>
                <th className="p-3.5 text-right">Refunds</th>
                <th className="p-3.5 text-right">Promo</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filteredWallets.map((w) => (
                <tr key={w.userId} className="hover:bg-white/[0.02]">
                  <td className="p-3.5">
                    <div className="font-black text-foreground">{w.username}</div>
                    <div className="text-[11px] font-mono text-muted-foreground">
                      {w.email || '—'}
                    </div>
                  </td>
                  <td className="p-3.5 font-mono text-[11px] text-slate-300">{w.userId}</td>
                  <td className="p-3.5 text-right font-mono font-black text-amber-300">
                    {w.balance} Cr ({formatINR(w.balance)})
                  </td>
                  <td className="p-3.5 text-right font-mono text-emerald-400">
                    {formatINR(w.totalCreditsAdded)}
                  </td>
                  <td className="p-3.5 text-right font-mono text-sky-300">
                    {formatINR(w.totalCreditsSpent)}
                  </td>
                  <td className="p-3.5 text-right font-mono text-teal-300">
                    {formatINR(w.totalRefunds)}
                  </td>
                  <td className="p-3.5 text-right font-mono text-purple-300">
                    {formatINR(w.totalPromotionalCredits)}
                  </td>
                  <td className="p-3.5">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => void handleOpenDetail(w.userId)}
                        className="inline-flex items-center gap-1 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 py-1.5 text-[11px] font-bold text-sky-300 hover:bg-sky-500/20 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Ledger</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          openAdjustModalFor(w);
                          setIsAdjustModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/15 px-2.5 py-1.5 text-[11px] font-bold text-amber-300 hover:bg-amber-500/25 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Adjust</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Selected User Wallet Ledger Panel */}
      {(loadingDetail || selectedDetail) && (
        <div className="rounded-2xl border border-sky-500/30 bg-surface-deep p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
            <div className="flex items-center gap-3">
              <UserIcon className="w-5 h-5 text-sky-400" />
              <div>
                <h4 className="text-sm font-black text-foreground">
                  {selectedDetail
                    ? `${selectedDetail.wallet.username} (${selectedDetail.wallet.email || selectedDetail.wallet.userId})`
                    : 'Loading Wallet Ledger...'}
                </h4>
                {selectedDetail && (
                  <p className="text-xs font-mono text-amber-300">
                    Current Balance: {selectedDetail.wallet.balance} Credits (
                    {formatINR(selectedDetail.wallet.balance)})
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSelectedDetail(null)}
              className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {loadingDetail || !selectedDetail ? (
            <div className="py-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Fetching full transaction &amp; recharge history...</span>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-xs font-black uppercase text-sky-300">
                Wallet Transaction History ({selectedDetail.transactions.length})
              </div>
              {selectedDetail.transactions.length === 0 ? (
                <div className="text-xs text-muted-foreground py-4">
                  No wallet transactions for this user yet.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-left text-xs min-w-[740px]">
                    <thead className="bg-black/30 text-[10px] font-black uppercase text-muted-foreground border-b border-border">
                      <tr>
                        <th className="p-2.5">Tx ID</th>
                        <th className="p-2.5">Date</th>
                        <th className="p-2.5">Type</th>
                        <th className="p-2.5 text-right">Amount</th>
                        <th className="p-2.5 text-right">Prev</th>
                        <th className="p-2.5 text-right">Updated</th>
                        <th className="p-2.5">Description / Admin</th>
                        <th className="p-2.5">Order ID</th>
                        <th className="p-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {selectedDetail.transactions.map((tx) => (
                        <tr key={tx.id}>
                          <td className="p-2.5 font-mono text-[11px]">{tx.id}</td>
                          <td className="p-2.5 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                            {formatISTDateTime(tx.createdAt)}
                          </td>
                          <td className="p-2.5 font-bold uppercase text-sky-300 text-[10px]">
                            {getWalletTxTypeLabel(tx.type)}
                          </td>
                          <td className="p-2.5 text-right font-mono font-bold">
                            {formatINR(tx.amount)}
                          </td>
                          <td className="p-2.5 text-right font-mono text-muted-foreground">
                            {formatINR(tx.previousBalance)}
                          </td>
                          <td className="p-2.5 text-right font-mono font-black text-white">
                            {formatINR(tx.updatedBalance)}
                          </td>
                          <td className="p-2.5">
                            <div>{tx.description}</div>
                            {tx.adminName && (
                              <div className="text-[10px] text-amber-300 font-mono">
                                By Admin: {tx.adminName}
                              </div>
                            )}
                          </td>
                          <td className="p-2.5 font-mono text-[11px] text-amber-300">
                            {tx.relatedOrderId || '—'}
                          </td>
                          <td className="p-2.5 text-[10px] font-black uppercase">
                            {getPaymentStatusLabel(tx.status)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Manual Wallet Adjustment Modal with Confirmation */}
      {isAdjustModalOpen && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-amber-500/40 bg-[#0b1629] p-5 text-foreground shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Coins className="w-5 h-5 text-amber-400" />
                <h4 className="text-sm font-black uppercase tracking-wider">
                  {confirmOpen ? 'Confirm Wallet Adjustment' : 'Manual Wallet Adjustment'}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsAdjustModalOpen(false);
                  setConfirmOpen(false);
                }}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {!confirmOpen ? (
              <form onSubmit={handleRequestConfirm} className="space-y-3.5">
                <div>
                  <label className="block text-[10px] font-black uppercase text-muted-foreground mb-1">
                    Select Customer Wallet / Enter User ID *
                  </label>
                  {adminWallets.length > 0 && (
                    <select
                      value={adminWallets.some((w) => w.userId === customUserId) ? customUserId : ''}
                      onChange={(e) => {
                        const found = adminWallets.find((w) => w.userId === e.target.value);
                        if (found) {
                          setAdjustTarget(found);
                          setCustomUserId(found.userId);
                          setCustomUsername(found.username);
                          setCustomEmail(found.email);
                        }
                      }}
                      className="w-full rounded-xl border border-border bg-surface-deep px-3 py-2 text-xs text-foreground outline-none focus:border-amber-400 mb-2"
                    >
                      <option value="">-- Choose existing user wallet --</option>
                      {adminWallets.map((w) => (
                        <option key={w.userId} value={w.userId}>
                          {w.username} ({w.email || w.userId}) — Bal: {w.balance} Cr
                        </option>
                      ))}
                    </select>
                  )}
                  <input
                    type="text"
                    required
                    value={customUserId}
                    onChange={(e) => {
                      setCustomUserId(e.target.value);
                      setAdjustTarget(
                        adminWallets.find((w) => w.userId === e.target.value.trim()) || null
                      );
                    }}
                    placeholder="User ID (uid)"
                    className="w-full rounded-xl border border-border bg-surface-deep px-3 py-2 text-xs font-mono text-foreground outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-muted-foreground mb-1">
                    Adjustment Action *
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setAdjustAction('admin_credit')}
                      className={`rounded-xl border p-2 text-[11px] font-black uppercase flex flex-col items-center gap-1 cursor-pointer ${
                        adjustAction === 'admin_credit'
                          ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300'
                          : 'border-border bg-surface-deep text-muted-foreground'
                      }`}
                    >
                      <ArrowDownLeft className="w-4 h-4" />
                      <span>Add Credit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdjustAction('admin_debit')}
                      className={`rounded-xl border p-2 text-[11px] font-black uppercase flex flex-col items-center gap-1 cursor-pointer ${
                        adjustAction === 'admin_debit'
                          ? 'border-rose-400 bg-rose-500/20 text-rose-300'
                          : 'border-border bg-surface-deep text-muted-foreground'
                      }`}
                    >
                      <ArrowUpRight className="w-4 h-4" />
                      <span>Deduct</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdjustAction('promotional_credit')}
                      className={`rounded-xl border p-2 text-[11px] font-black uppercase flex flex-col items-center gap-1 cursor-pointer ${
                        adjustAction === 'promotional_credit'
                          ? 'border-purple-400 bg-purple-500/20 text-purple-300'
                          : 'border-border bg-surface-deep text-muted-foreground'
                      }`}
                    >
                      <Gift className="w-4 h-4" />
                      <span>Promo</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-muted-foreground mb-1">
                    Amount (Credits / ₹ INR) *
                  </label>
                  <input
                    type="number"
                    min={1}
                    step="1"
                    required
                    value={adjustAmount}
                    onChange={(e) => setAdjustAmount(e.target.value)}
                    placeholder="e.g. 250"
                    className="w-full rounded-xl border border-border bg-surface-deep px-3 py-2 text-sm font-mono font-bold text-white outline-none focus:border-amber-400"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1 font-mono">
                    Current balance: {currentTargetBalance} Credits
                  </p>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-muted-foreground mb-1">
                    Reason (Recorded in Audit Ledger) *
                  </label>
                  <input
                    type="text"
                    required
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    placeholder="e.g. Event prize winner / Billing correction"
                    className="w-full rounded-xl border border-border bg-surface-deep px-3 py-2 text-xs text-white outline-none focus:border-amber-400"
                  />
                </div>

                {adjustAmount && !adjustmentPreview.valid && (
                  <div className="rounded-xl border border-rose-500/40 bg-rose-950/50 p-2.5 text-xs text-rose-300 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{adjustmentPreview.error}</span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAdjustModalOpen(false)}
                    className="rounded-xl border border-border px-4 py-2 text-xs font-bold text-muted-foreground hover:text-white cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!adjustmentPreview.valid}
                    data-testid="admin-adjust-review-btn"
                    className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-black uppercase text-slate-950 hover:brightness-110 disabled:opacity-50 cursor-pointer"
                  >
                    Review &amp; Confirm
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Target User:</span>
                    <strong className="font-mono text-white">
                      {customUsername || customUserId}
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Action:</span>
                    <strong className="uppercase text-amber-300">
                      {getWalletTxTypeLabel(adjustAction)}
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Current Balance:</span>
                    <span className="font-mono">{adjustmentPreview.previousBalance} Credits</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Adjustment Amount:</span>
                    <strong className="font-mono text-white">
                      {adjustAction === 'admin_debit' ? '-' : '+'}
                      {adjustmentPreview.amount} Credits
                    </strong>
                  </div>
                  <div className="flex justify-between border-t border-amber-500/20 pt-1.5">
                    <span className="text-muted-foreground">Projected New Balance:</span>
                    <strong className="font-mono text-emerald-300">
                      {adjustmentPreview.updatedBalance} Credits
                    </strong>
                  </div>
                  <div className="pt-1 text-slate-300">
                    Reason: <strong>{adjustReason.trim()}</strong>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmOpen(false)}
                    disabled={isSubmittingAdjust}
                    className="rounded-xl border border-border px-4 py-2 text-xs font-bold text-muted-foreground hover:text-white cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={isSubmittingAdjust}
                    onClick={handleExecuteAdjustment}
                    data-testid="admin-adjust-confirm-btn"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-black uppercase text-slate-950 hover:brightness-110 cursor-pointer disabled:opacity-50"
                  >
                    {isSubmittingAdjust ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    <span>Confirm &amp; Apply</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const StatCard = ({
  label,
  value,
  accent = 'text-white',
}: {
  label: string;
  value: string;
  accent?: string;
}) => (
  <div className="rounded-2xl border border-border bg-surface-deep/75 p-3">
    <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
      {label}
    </div>
    <div className={`mt-1 text-base sm:text-lg font-black font-display tabular-nums ${accent}`}>
      {value}
    </div>
  </div>
);
