import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Eye,
  Filter,
  Loader2,
  Lock,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useWallet } from '../../context/WalletContext';
import { useToast } from '../../context/ToastContext';
import { formatINR } from '../../config/storeDefaults';
import { formatISTDateTime } from '../../utils/dateUtils';
import {
  canTransitionPaymentStatus,
  computeEligibleRefundBreakdown,
  filterPayments,
  getPaymentStatusLabel,
  getPaymentTypeLabel,
} from '../../utils/walletPaymentHelpers';
import type {
  GatewayPaymentMethod,
  PaymentRecord,
  PaymentStatus,
  PaymentType,
} from '../../types';
import type { AdminPaymentDetailBundle } from '../../services/walletService';

interface AdminPaymentManagementTabProps {
  isOwnerAdmin: boolean;
  onLogActivity?: (action: string, details: string, type?: 'payment' | 'other') => void;
}

export const AdminPaymentManagementTab: React.FC<AdminPaymentManagementTabProps> = ({
  isOwnerAdmin,
  onLogActivity,
}) => {
  const {
    adminPayments,
    adminRefunds,
    adminPaymentStats,
    adminWallets,
    gatewayConfig,
    isLoadingAdminFinance,
    refreshAdminFinanceData,
    getAdminPaymentDetail,
    updateAdminPaymentStatus,
    refundAdminPayment,
  } = useWallet();
  const { success, error } = useToast();

  const [subTab, setSubTab] = useState<'payments' | 'refunds'>('payments');

  // Search & Filter states
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('all');
  const [gatewayFilter, setGatewayFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<PaymentType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | 'all'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Detail & Refund modals
  const [detailBundle, setDetailBundle] = useState<AdminPaymentDetailBundle | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [refundTarget, setRefundTarget] = useState<PaymentRecord | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [refundConfirmStep, setRefundConfirmStep] = useState(false);
  const [isRefunding, setIsRefunding] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const filteredPayments = useMemo(
    () =>
      filterPayments(adminPayments, {
        search,
        paymentMethod: methodFilter,
        paymentGateway: gatewayFilter,
        paymentType: typeFilter,
        status: statusFilter,
        dateFrom,
        dateTo,
      }),
    [adminPayments, search, methodFilter, gatewayFilter, typeFilter, statusFilter, dateFrom, dateTo]
  );

  const stats = adminPaymentStats || {
    totalPayments: 0,
    successfulPayments: 0,
    pendingPayments: 0,
    failedPayments: 0,
    refundedPayments: 0,
    totalPaymentAmount: 0,
    totalWalletRecharges: 0,
    totalDirectPayments: 0,
    totalCombinedPayments: 0,
  };

  const handleOpenDetail = async (paymentId: string) => {
    setLoadingDetail(true);
    try {
      const bundle = await getAdminPaymentDetail(paymentId);
      setDetailBundle(bundle);
    } catch (err: any) {
      error(err?.message || 'Unable to load payment details.');
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleAdminStatusChange = async (payment: PaymentRecord, nextStatus: PaymentStatus) => {
    const guard = canTransitionPaymentStatus(
      payment.status,
      nextStatus,
      Boolean(payment.verifiedByBackend)
    );
    if (!guard.allowed) {
      error(guard.reason || 'Status change blocked.');
      return;
    }
    setIsUpdatingStatus(true);
    try {
      const updated = await updateAdminPaymentStatus(
        payment.id,
        nextStatus,
        `Updated by Admin to ${nextStatus}`
      );
      success(`Payment ${updated.id} status updated to ${getPaymentStatusLabel(updated.status)}`);
      onLogActivity?.(
        'Payment Status Updated',
        `${updated.id} -> ${updated.status}`,
        'payment'
      );
      if (detailBundle?.payment.id === updated.id) {
        const refreshed = await getAdminPaymentDetail(updated.id).catch(() => null);
        if (refreshed) setDetailBundle(refreshed);
      }
    } catch (err: any) {
      error(err?.message || 'Failed to update payment status.');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const refundTargetWalletBalance = refundTarget
    ? adminWallets.find((w) => w.userId === refundTarget.userId)?.balance || 0
    : 0;

  const refundBreakdown = refundTarget
    ? computeEligibleRefundBreakdown(refundTarget, adminRefunds, refundTargetWalletBalance)
    : null;

  const handleConfirmRefund = async () => {
    if (!refundTarget || isRefunding) return;
    setIsRefunding(true);
    try {
      const res = await refundAdminPayment(refundTarget.id, refundReason.trim());
      success(
        `Refunded ${formatINR(res.refund.totalRefundAmount)} (${
          res.refund.walletRefundAmount > 0 ? `Wallet ₹${res.refund.walletRefundAmount}` : ''
        }${
          res.refund.walletRefundAmount > 0 && res.refund.onlineRefundAmount > 0 ? ' + ' : ''
        }${
          res.refund.onlineRefundAmount > 0 ? `Gateway ₹${res.refund.onlineRefundAmount}` : ''
        })`
      );
      onLogActivity?.(
        'Payment Refunded',
        `Refund ${res.refund.refundRef} for ${refundTarget.id} (${refundReason.trim()})`,
        'payment'
      );
      setRefundTarget(null);
      setRefundReason('');
      setRefundConfirmStep(false);
      if (detailBundle?.payment.id === res.payment.id) {
        const refreshed = await getAdminPaymentDetail(res.payment.id).catch(() => null);
        if (refreshed) setDetailBundle(refreshed);
      }
    } catch (err: any) {
      error(err?.message || 'Refund failed.');
    } finally {
      setIsRefunding(false);
    }
  };



  const resetFilters = () => {
    setSearch('');
    setMethodFilter('all');
    setGatewayFilter('all');
    setTypeFilter('all');
    setStatusFilter('all');
    setDateFrom('');
    setDateTo('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400 shrink-0">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-black uppercase tracking-wider text-foreground font-display">
              Payment Management
            </h3>
            <p className="text-xs text-muted-foreground">
              Full gateway reconciliation, combined wallet + online breakdown, refund processing, and gateway configuration.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void refreshAdminFinanceData()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface-deep px-3 py-2 text-xs font-bold text-foreground hover:border-emerald-400 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAdminFinance ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Sub-Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
        <button
          type="button"
          onClick={() => setSubTab('payments')}
          className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wider cursor-pointer ${
            subTab === 'payments'
              ? 'bg-emerald-500 text-slate-950 shadow-sm'
              : 'bg-surface-deep text-muted-foreground hover:text-white border border-border'
          }`}
        >
          <CreditCard className="w-3.5 h-3.5" />
          <span>Transactions ({adminPayments.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('refunds')}
          className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wider cursor-pointer ${
            subTab === 'refunds'
              ? 'bg-emerald-500 text-slate-950 shadow-sm'
              : 'bg-surface-deep text-muted-foreground hover:text-white border border-border'
          }`}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Refund History ({adminRefunds.length})</span>
        </button>


      </div>

      {/* ============================================================ */}
      {/* SUB-TAB 1: PAYMENT DASHBOARD + ALL TRANSACTIONS              */}
      {/* ============================================================ */}
      {subTab === 'payments' && (
        <div className="space-y-5">
          {/* 9 Required KPI Cards */}
          <div
            data-testid="payment-dashboard-stats"
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3"
          >
            <KpiCard label="Total Payments" value={String(stats.totalPayments)} />
            <KpiCard
              label="Successful Payments"
              value={String(stats.successfulPayments)}
              accent="text-emerald-400"
            />
            <KpiCard
              label="Pending Payments"
              value={String(stats.pendingPayments)}
              accent="text-amber-300"
            />
            <KpiCard
              label="Failed Payments"
              value={String(stats.failedPayments)}
              accent="text-rose-400"
            />
            <KpiCard
              label="Refunded Payments"
              value={String(stats.refundedPayments)}
              accent="text-purple-300"
            />
            <KpiCard
              label="Total Payment Amount"
              value={formatINR(stats.totalPaymentAmount)}
              accent="text-amber-300"
            />
            <KpiCard
              label="Wallet Recharges"
              value={formatINR(stats.totalWalletRecharges)}
              accent="text-teal-300"
            />
            <KpiCard
              label="Direct Payments"
              value={formatINR(stats.totalDirectPayments)}
              accent="text-sky-300"
            />
            <KpiCard
              label="Combined Payments"
              value={formatINR(stats.totalCombinedPayments)}
              accent="text-indigo-300"
            />
          </div>

          {/* Filters */}
          <div className="rounded-2xl border border-border bg-surface-deep/70 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-black uppercase text-muted-foreground">
                <Filter className="w-3.5 h-3.5 text-emerald-400" />
                <span>Search &amp; Filters</span>
              </div>
              <button
                type="button"
                onClick={resetFilters}
                className="text-xs font-bold text-sky-400 hover:underline cursor-pointer"
              >
                Reset Filters
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              <div className="relative sm:col-span-2">
                <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search Payment ID, Txn ID, Order ID, Username, Email..."
                  data-testid="payment-search-input"
                  className="w-full rounded-xl border border-border bg-surface pl-9 pr-3 py-2 text-xs text-foreground outline-none focus:border-emerald-400"
                />
              </div>

              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as PaymentType | 'all')}
                className="rounded-xl border border-border bg-surface px-3 py-2 text-xs text-foreground outline-none"
              >
                <option value="all">All Payment Types</option>
                <option value="wallet_recharge">Wallet Recharge</option>
                <option value="direct_product">Direct Online Purchase</option>
                <option value="wallet_product">Full Wallet Purchase</option>
                <option value="combined">Combined (Wallet + Online)</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as PaymentStatus | 'all')}
                className="rounded-xl border border-border bg-surface px-3 py-2 text-xs text-foreground outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="successful">Successful</option>
                <option value="pending">Pending</option>
                <option value="processing">Processing</option>
                <option value="failed">Failed</option>
                <option value="cancelled">Cancelled</option>
                <option value="refunded">Refunded</option>
              </select>

              <select
                value={methodFilter}
                onChange={(e) => setMethodFilter(e.target.value)}
                className="rounded-xl border border-border bg-surface px-3 py-2 text-xs text-foreground outline-none"
              >
                <option value="all">All Methods</option>
                <option value="upi">UPI</option>
                <option value="wallet">Wallet</option>
                <option value="wallet+upi">Wallet + UPI</option>
                <option value="upi_qr">WonderPay UPI QR</option>
              </select>

              <select
                value={gatewayFilter}
                onChange={(e) => setGatewayFilter(e.target.value)}
                className="rounded-xl border border-border bg-surface px-3 py-2 text-xs text-foreground outline-none"
              >
                <option value="all">All Gateways</option>
                <option value="wallet">Wallet Internal</option>
                <option value="wonderpay_upi_qr">WonderPay UPI QR</option>
              </select>

              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                aria-label="Date from"
                className="rounded-xl border border-border bg-surface px-3 py-2 text-xs text-foreground outline-none"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                aria-label="Date to"
                className="rounded-xl border border-border bg-surface px-3 py-2 text-xs text-foreground outline-none"
              />
            </div>
          </div>

          {/* All Transactions Table */}
          {filteredPayments.length === 0 ? (
            <div className="rounded-2xl border border-border bg-surface-deep/60 py-12 text-center text-xs text-muted-foreground">
              {adminPayments.length === 0
                ? 'No payment transactions have been recorded yet.'
                : 'No payment transactions match your current filters.'}
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-surface-deep/60 overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[1050px]">
                <thead className="bg-black/30 text-[10px] font-black uppercase tracking-wider text-muted-foreground border-b border-border">
                  <tr>
                    <th className="p-3">Payment ID</th>
                    <th className="p-3">Transaction ID</th>
                    <th className="p-3">User / Email</th>
                    <th className="p-3">Product / Order</th>
                    <th className="p-3 text-right">Amount</th>
                    <th className="p-3 text-right">Wallet Used</th>
                    <th className="p-3 text-right">Online Paid</th>
                    <th className="p-3">Method / Gateway</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Date &amp; Time</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredPayments.map((p) => (
                    <tr key={p.id} className="hover:bg-white/[0.02]">
                      <td className="p-3 font-mono font-black text-white whitespace-nowrap">
                        {p.id}
                      </td>
                      <td className="p-3 font-mono text-[11px] text-sky-300">
                        <div>{p.transactionId}</div>
                        {p.onlineTransactionId && p.onlineTransactionId !== p.transactionId && (
                          <div className="text-[10px] text-emerald-300">
                            Online: {p.onlineTransactionId}
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-foreground">{p.username}</div>
                        <div className="text-[10px] font-mono text-muted-foreground">{p.email}</div>
                      </td>
                      <td className="p-3 max-w-[180px]">
                        <div className="truncate font-medium text-foreground">
                          {p.productName || '—'}
                        </div>
                        {p.orderId && (
                          <div className="text-[10px] font-mono text-amber-300">{p.orderId}</div>
                        )}
                      </td>
                      <td className="p-3 text-right font-mono font-black text-amber-300 whitespace-nowrap">
                        {formatINR(p.amount)}
                      </td>
                      <td className="p-3 text-right font-mono text-teal-300 whitespace-nowrap">
                        {formatINR(p.walletAmount ?? 0)}
                      </td>
                      <td className="p-3 text-right font-mono text-sky-300 whitespace-nowrap">
                        {formatINR(p.onlineAmount ?? 0)}
                      </td>
                      <td className="p-3">
                        <div className="uppercase font-bold text-white text-[11px]">
                          {p.paymentMethod}
                        </div>
                        <div className="text-[10px] font-mono text-muted-foreground">
                          {p.paymentGateway}
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] font-bold whitespace-nowrap">
                          {getPaymentTypeLabel(p.paymentType)}
                        </span>
                      </td>
                      <td className="p-3">
                        <StatusBadge status={p.status} />
                      </td>
                      <td className="p-3 font-mono text-[10.5px] text-muted-foreground whitespace-nowrap">
                        {formatISTDateTime(p.createdAt)}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => void handleOpenDetail(p.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-[11px] font-bold text-sky-300 hover:bg-sky-500/20 cursor-pointer"
                          >
                            <Eye className="w-3 h-3" />
                            <span>Inspect</span>
                          </button>
                          {p.status === 'successful' && (
                            <button
                              type="button"
                              onClick={() => {
                                setRefundTarget(p);
                                setRefundReason('');
                                setRefundConfirmStep(false);
                              }}
                              data-testid={`payment-refund-btn-${p.id}`}
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-500/35 bg-rose-500/15 px-2.5 py-1 text-[11px] font-bold text-rose-300 hover:bg-rose-500/25 cursor-pointer"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Refund</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* SUB-TAB 2: REFUND HISTORY                                    */}
      {/* ============================================================ */}
      {subTab === 'refunds' && (
        <div className="space-y-4">
          {adminRefunds.length === 0 ? (
            <div className="rounded-2xl border border-border bg-surface-deep/60 py-12 text-center text-xs text-muted-foreground">
              No payment refunds have been processed yet.
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-surface-deep/60 overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[820px]">
                <thead className="bg-black/30 text-[10px] font-black uppercase text-muted-foreground border-b border-border">
                  <tr>
                    <th className="p-3">Refund ID</th>
                    <th className="p-3">Payment ID</th>
                    <th className="p-3">Order ID</th>
                    <th className="p-3 text-right">Total Refund</th>
                    <th className="p-3 text-right">To Wallet</th>
                    <th className="p-3 text-right">To Gateway</th>
                    <th className="p-3">Gateway Refund ID</th>
                    <th className="p-3">Admin / Reason</th>
                    <th className="p-3">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {adminRefunds.map((r) => (
                    <tr key={r.id}>
                      <td className="p-3 font-mono font-black text-purple-300">{r.refundRef}</td>
                      <td className="p-3 font-mono text-white">{r.paymentId}</td>
                      <td className="p-3 font-mono text-amber-300">{r.orderId || '—'}</td>
                      <td className="p-3 text-right font-mono font-black text-white">
                        {formatINR(r.totalRefundAmount)}
                      </td>
                      <td className="p-3 text-right font-mono text-emerald-400">
                        {formatINR(r.walletRefundAmount)}
                      </td>
                      <td className="p-3 text-right font-mono text-sky-300">
                        {formatINR(r.onlineRefundAmount)}
                      </td>
                      <td className="p-3 font-mono text-[11px] text-slate-300">
                        {r.gatewayRefundId || '—'}
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-foreground">{r.adminName}</div>
                        <div className="text-[11px] text-muted-foreground">{r.reason}</div>
                      </td>
                      <td className="p-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                        {formatISTDateTime(r.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}



      {/* ============================================================ */}
      {/* PAYMENT DETAIL INSPECTION MODAL                              */}
      {/* ============================================================ */}
      {(loadingDetail || detailBundle) && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-sky-500/35 bg-[#091527] p-5 text-foreground shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h4 className="text-sm sm:text-base font-black uppercase tracking-wider">
                  {detailBundle ? `Payment ${detailBundle.payment.id}` : 'Loading Payment...'}
                </h4>
                {detailBundle && (
                  <p className="text-xs font-mono text-muted-foreground">
                    {getPaymentTypeLabel(detailBundle.payment.paymentType)} •{' '}
                    {formatISTDateTime(detailBundle.payment.createdAt)}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setDetailBundle(null)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {loadingDetail || !detailBundle ? (
              <div className="py-10 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Loading payment breakdown...</span>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-xl border border-border bg-surface-deep p-3">
                    <span className="text-[10px] font-black uppercase text-muted-foreground block">
                      Total Amount
                    </span>
                    <span className="text-sm font-black font-mono text-amber-300">
                      {formatINR(detailBundle.payment.amount)}
                    </span>
                  </div>
                  <div className="rounded-xl border border-border bg-surface-deep p-3">
                    <span className="text-[10px] font-black uppercase text-muted-foreground block">
                      Wallet Used
                    </span>
                    <span className="text-sm font-black font-mono text-teal-300">
                      {formatINR(detailBundle.payment.walletAmount ?? 0)}
                    </span>
                  </div>
                  <div className="rounded-xl border border-border bg-surface-deep p-3">
                    <span className="text-[10px] font-black uppercase text-muted-foreground block">
                      Online Paid
                    </span>
                    <span className="text-sm font-black font-mono text-sky-300">
                      {formatINR(detailBundle.payment.onlineAmount ?? 0)}
                    </span>
                  </div>
                  <div className="rounded-xl border border-border bg-surface-deep p-3">
                    <span className="text-[10px] font-black uppercase text-muted-foreground block">
                      Status
                    </span>
                    <div className="mt-0.5">
                      <StatusBadge status={detailBundle.payment.status} />
                    </div>
                  </div>
                </div>

                {/* Combined / Gateway Reference Details */}
                <div className="rounded-xl border border-border bg-surface-deep p-3.5 text-xs space-y-1.5 font-mono">
                  <div>
                    Customer: <strong className="text-white">{detailBundle.payment.username}</strong> (
                    {detailBundle.payment.email || detailBundle.payment.userId})
                  </div>
                  <div>
                    Transaction ID: <strong className="text-sky-300">{detailBundle.payment.transactionId}</strong>
                  </div>
                  {detailBundle.payment.onlineTransactionId && (
                    <div>
                      Online Gateway Txn ID:{' '}
                      <strong className="text-emerald-300">
                        {detailBundle.payment.onlineTransactionId}
                      </strong>
                    </div>
                  )}
                  {detailBundle.payment.orderId && (
                    <div>
                      Linked Order ID:{' '}
                      <strong className="text-amber-300">{detailBundle.payment.orderId}</strong>
                    </div>
                  )}
                  <div>
                    Backend Signature Verified:{' '}
                    <strong
                      className={
                        detailBundle.payment.verifiedByBackend
                          ? 'text-emerald-400'
                          : 'text-rose-400'
                      }
                    >
                      {detailBundle.payment.verifiedByBackend ? 'YES (Verified)' : 'NO (Unverified)'}
                    </strong>
                  </div>
                </div>

                {/* Security Guard Notice + Safe Status Controls */}
                <div className="rounded-xl border border-border bg-surface-deep p-3.5 space-y-2.5">
                  <div className="flex items-start gap-2 text-[11px] text-amber-200">
                    <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <span>
                      Integrity rule: Unverified payments cannot be manually marked as{' '}
                      <strong>Successful</strong> without a verified payment gateway signature or webhook.
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {(['pending', 'failed', 'cancelled'] as const).map((st) => {
                      const guard = canTransitionPaymentStatus(
                        detailBundle.payment.status,
                        st,
                        Boolean(detailBundle.payment.verifiedByBackend)
                      );
                      return (
                        <button
                          key={st}
                          type="button"
                          disabled={
                            isUpdatingStatus ||
                            !guard.allowed ||
                            detailBundle.payment.status === st
                          }
                          onClick={() => void handleAdminStatusChange(detailBundle.payment, st)}
                          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-[11px] font-bold uppercase text-foreground hover:border-sky-400 disabled:opacity-40 cursor-pointer"
                        >
                          Mark {getPaymentStatusLabel(st)}
                        </button>
                      );
                    })}

                    <button
                      type="button"
                      disabled={detailBundle.payment.verifiedByBackend !== true}
                      title={
                        detailBundle.payment.verifiedByBackend
                          ? 'Mark Verified Payment Successful'
                          : 'Blocked: Unverified payment cannot be manually marked Successful'
                      }
                      data-testid="detail-mark-successful-btn"
                      onClick={() =>
                        void handleAdminStatusChange(detailBundle.payment, 'successful')
                      }
                      className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-bold uppercase text-emerald-300 disabled:opacity-40 cursor-pointer"
                    >
                      Mark Successful (Verified Only)
                    </button>

                    {detailBundle.payment.status === 'successful' && (
                      <button
                        type="button"
                        onClick={() => {
                          setRefundTarget(detailBundle.payment);
                          setRefundReason('');
                          setRefundConfirmStep(false);
                        }}
                        className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-rose-500 px-3.5 py-1.5 text-[11px] font-black uppercase text-white hover:brightness-110 cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Initiate Refund</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* REFUND CONFIRMATION MODAL                                    */}
      {/* ============================================================ */}
      {refundTarget && refundBreakdown && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-rose-500/40 bg-[#120b18] p-5 text-foreground shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-rose-400" />
                <h4 className="text-sm font-black uppercase tracking-wider">
                  {refundConfirmStep ? 'Confirm Final Refund Execution' : 'Initiate Payment Refund'}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => {
                  setRefundTarget(null);
                  setRefundConfirmStep(false);
                }}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {!refundBreakdown.eligible ? (
              <div className="rounded-xl border border-rose-500/40 bg-rose-950/60 p-3.5 text-xs text-rose-200 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{refundBreakdown.error}</span>
              </div>
            ) : !refundConfirmStep ? (
              <div className="space-y-3.5">
                <div className="rounded-xl border border-border bg-surface-deep p-3.5 text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Payment ID:</span>
                    <strong className="font-mono">{refundTarget.id}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Refund Amount:</span>
                    <strong className="font-mono text-amber-300">
                      {formatINR(refundBreakdown.totalRefundAmount)}
                    </strong>
                  </div>
                  {refundBreakdown.walletRefundAmount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Credit Back to Customer Wallet:</span>
                      <strong className="font-mono text-emerald-400">
                        +{refundBreakdown.walletRefundAmount} Credits ({formatINR(refundBreakdown.walletRefundAmount)})
                      </strong>
                    </div>
                  )}
                  {refundBreakdown.onlineRefundAmount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Gateway Online Refund:</span>
                      <strong className="font-mono text-sky-300">
                        {formatINR(refundBreakdown.onlineRefundAmount)}
                      </strong>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-muted-foreground mb-1">
                    Refund Reason (Required) *
                  </label>
                  <input
                    type="text"
                    required
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    placeholder="e.g. Customer requested cancellation before delivery"
                    data-testid="refund-reason-input"
                    className="w-full rounded-xl border border-border bg-surface-deep px-3 py-2 text-xs text-white outline-none focus:border-rose-400"
                  />
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setRefundTarget(null)}
                    className="rounded-xl border border-border px-4 py-2 text-xs font-bold text-muted-foreground cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!refundReason.trim()}
                    onClick={() => setRefundConfirmStep(true)}
                    data-testid="refund-review-btn"
                    className="rounded-xl bg-rose-500 px-4 py-2 text-xs font-black uppercase text-white hover:brightness-110 disabled:opacity-50 cursor-pointer"
                  >
                    Review Refund
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 p-3.5 text-xs text-rose-100 space-y-1">
                  <div className="font-black uppercase text-rose-300">
                    Irreversible Refund Confirmation
                  </div>
                  <p>
                    You are about to refund <strong>{formatINR(refundBreakdown.totalRefundAmount)}</strong>{' '}
                    for payment <strong className="font-mono">{refundTarget.id}</strong> (Reason:{' '}
                    <em>{refundReason.trim()}</em>). Duplicate refunds for this payment will be permanently blocked.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={isRefunding}
                    onClick={() => setRefundConfirmStep(false)}
                    className="rounded-xl border border-border px-4 py-2 text-xs font-bold text-muted-foreground cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={isRefunding}
                    onClick={handleConfirmRefund}
                    data-testid="refund-confirm-execute-btn"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-rose-500 px-4 py-2 text-xs font-black uppercase text-white hover:brightness-110 cursor-pointer disabled:opacity-50"
                  >
                    {isRefunding ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    <span>Confirm Refund</span>
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

const KpiCard = ({
  label,
  value,
  accent = 'text-white',
}: {
  label: string;
  value: string;
  accent?: string;
}) => (
  <div className="rounded-2xl border border-border bg-surface-deep/75 p-3.5">
    <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
      {label}
    </div>
    <div className={`mt-1 text-lg sm:text-xl font-black font-display tabular-nums ${accent}`}>
      {value}
    </div>
  </div>
);

const StatusBadge = ({ status }: { status: PaymentStatus }) => (
  <span
    className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border whitespace-nowrap ${
      status === 'successful'
        ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
        : status === 'refunded' || status === 'partially_refunded'
        ? 'border-purple-500/40 bg-purple-500/15 text-purple-300'
        : status === 'failed' || status === 'cancelled'
        ? 'border-rose-500/40 bg-rose-500/15 text-rose-300'
        : 'border-amber-500/40 bg-amber-500/15 text-amber-300'
    }`}
  >
    {getPaymentStatusLabel(status)}
  </span>
);
