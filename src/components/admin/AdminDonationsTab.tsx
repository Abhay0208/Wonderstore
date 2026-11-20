import React, { useEffect, useMemo, useState } from 'react';
import {
  Crown,
  HeartHandshake,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Trophy,
  Gift,
  Settings as SettingsIcon,
  Plus,
  Trash2,
  Edit3,
  ArrowUp,
  ArrowDown,
  Upload,
  Eye,
  X,
  Save,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Users,
  IndianRupee,
  ClipboardList,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { donationService, type AdminDonationOverviewResponse } from '../../services/donationService';
import { useToast } from '../../context/ToastContext';
import { useTickets } from '../../context/TicketContext';
import { formatINR } from '../../config/storeDefaults';
import { formatISTDateTime } from '../../utils/dateUtils';
import { DONATION_BADGE_PRESETS, validateImagePayload } from '../../utils/donationHelpers';
import { optimizeImage } from '../../utils/imageOptimizer';
import type {
  ActivityLog,
  DonationEdition,
  DonationRequest,
  DonationRewardCategory,
  DonationRewardTier,
  DonationSettings,
  DonatorLeaderboardPeriod,
  ManualDonatorLeaderboardEntry,
} from '../../types';

interface AdminDonationsTabProps {
  onLogActivity?: (
    action: string,
    details: string,
    type?: ActivityLog['type'],
    adminName?: string
  ) => void;
}

type DonationsSubTab = 'requests' | 'leaderboard' | 'rewards' | 'settings';

export const AdminDonationsTab: React.FC<AdminDonationsTabProps> = ({ onLogActivity }) => {
  const { success, error } = useToast();
  const { staffSession } = useTickets();
  const authToken = staffSession?.token;

  const [subTab, setSubTab] = useState<DonationsSubTab>('requests');
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState<AdminDonationOverviewResponse | null>(null);
  const [showAuditLogs, setShowAuditLogs] = useState(false);

  // Requests filter & remarks
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [remarksMap, setRemarksMap] = useState<Record<string, string>>({});
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [lightboxScreenshot, setLightboxScreenshot] = useState<string | null>(null);

  // Leaderboard editor state
  const [editingLbId, setEditingLbId] = useState<string | null>(null);
  const [lbUsername, setLbUsername] = useState('');
  const [lbEdition, setLbEdition] = useState<DonationEdition>('java');
  const [lbAmount, setLbAmount] = useState('');
  const [lbBadge, setLbBadge] = useState<string>('Mythic Donor');
  const [lbPeriod, setLbPeriod] = useState<DonatorLeaderboardPeriod>('both');
  const [lbAvatarUrl, setLbAvatarUrl] = useState('');
  const [lbSaving, setLbSaving] = useState(false);

  // Reward tier editor state
  const [editingRewardId, setEditingRewardId] = useState<string | null>(null);
  const [rewName, setRewName] = useState('');
  const [rewMinAmount, setRewMinAmount] = useState('');
  const [rewCategory, setRewCategory] = useState<DonationRewardCategory>('Rank');
  const [rewDescription, setRewDescription] = useState('');
  const [rewBadgeLabel, setRewBadgeLabel] = useState('');
  const [rewEnabled, setRewEnabled] = useState(true);
  const [rewSaving, setRewSaving] = useState(false);

  // Settings editor state
  const [settingsForm, setSettingsForm] = useState<DonationSettings | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);

  const refreshData = async () => {
    try {
      const overview = await donationService.getAdminOverview(authToken);
      setData(overview);
      setSettingsForm(overview.settings);
      const nextRemarks: Record<string, string> = {};
      overview.requests.forEach((r) => {
        nextRemarks[r.id] = r.adminRemarks || '';
      });
      setRemarksMap((prev) => ({ ...nextRemarks, ...prev }));
    } catch (err: any) {
      error(err?.message || 'Failed to load Donations Admin Overview.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refreshData();
  }, [authToken]);

  const filteredRequests = useMemo(() => {
    const list = data?.requests || [];
    const q = searchQuery.trim().toLowerCase();
    return list.filter((req) => {
      if (statusFilter !== 'ALL' && req.status !== statusFilter) return false;
      if (!q) return true;
      return (
        req.username.toLowerCase().includes(q) ||
        req.utr.toLowerCase().includes(q) ||
        req.referenceNumber.toLowerCase().includes(q)
      );
    });
  }, [data?.requests, statusFilter, searchQuery]);

  // ==================== REQUEST HANDLERS ====================
  const handleApprove = async (req: DonationRequest) => {
    setBusyRequestId(req.id);
    try {
      await donationService.approveRequest(req.id, remarksMap[req.id], authToken);
      success(`Approved donation ${req.referenceNumber} from ${req.username}!`);
      onLogActivity?.(
        'Donation Approved',
        `Approved ₹${req.amount} donation from ${req.username} (UTR: ${req.utr})`,
        'payment'
      );
      await refreshData();
    } catch (err: any) {
      error(err?.message || 'Approval failed.');
    } finally {
      setBusyRequestId(null);
    }
  };

  const handleReject = async (req: DonationRequest) => {
    setBusyRequestId(req.id);
    try {
      await donationService.rejectRequest(req.id, remarksMap[req.id], authToken);
      success(`Rejected donation ${req.referenceNumber}.`);
      onLogActivity?.(
        'Donation Rejected',
        `Rejected ₹${req.amount} donation from ${req.username}`,
        'payment'
      );
      await refreshData();
    } catch (err: any) {
      error(err?.message || 'Rejection failed.');
    } finally {
      setBusyRequestId(null);
    }
  };

  const handleToggleRewardStatus = async (req: DonationRequest) => {
    const nextStatus = req.rewardStatus === 'DELIVERED' ? 'PENDING' : 'DELIVERED';
    setBusyRequestId(req.id);
    try {
      await donationService.updateRewardDeliveryStatus(req.id, nextStatus, authToken);
      success(`Reward marked as ${nextStatus} for ${req.username}.`);
      await refreshData();
    } catch (err: any) {
      error(err?.message || 'Failed to update reward status.');
    } finally {
      setBusyRequestId(null);
    }
  };

  const handleDeleteRequest = async (req: DonationRequest) => {
    setBusyRequestId(req.id);
    try {
      await donationService.deleteRequest(req.id, authToken);
      success(`Deleted donation record ${req.referenceNumber}.`);
      await refreshData();
    } catch (err: any) {
      error(err?.message || 'Delete failed.');
    } finally {
      setBusyRequestId(null);
    }
  };

  // ==================== LEADERBOARD HANDLERS ====================
  const resetLeaderboardForm = () => {
    setEditingLbId(null);
    setLbUsername('');
    setLbEdition('java');
    setLbAmount('');
    setLbBadge('Mythic Donor');
    setLbPeriod('both');
    setLbAvatarUrl('');
  };

  const startEditLeaderboard = (entry: ManualDonatorLeaderboardEntry) => {
    setEditingLbId(entry.id);
    setLbUsername(entry.username);
    setLbEdition(entry.edition);
    setLbAmount(String(entry.amount));
    setLbBadge(entry.badge);
    setLbPeriod(entry.period || 'both');
    setLbAvatarUrl(entry.avatarUrl || '');
  };

  const handleUploadDonorAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const optimized = await optimizeImage(file, 256, 256, 0.85);
      const check = validateImagePayload(optimized, { required: false, label: 'Donor avatar' });
      if (!check.valid) {
        error(check.error || 'Invalid avatar image.');
        return;
      }
      setLbAvatarUrl(check.cleaned);
      success('Donor profile image attached!');
    } catch {
      error('Failed to process avatar image.');
    }
  };

  const handleSaveLeaderboard = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmt = Number(lbAmount);
    if (!lbUsername.trim() || !Number.isFinite(numericAmt) || numericAmt < 0) {
      error('Please enter a valid donor Minecraft username and non-negative amount.');
      return;
    }
    setLbSaving(true);
    try {
      await donationService.saveLeaderboardEntry(
        {
          id: editingLbId || undefined,
          username: lbUsername.trim(),
          edition: lbEdition,
          amount: numericAmt,
          badge: lbBadge.trim() || 'Supporter',
          avatarUrl: lbAvatarUrl || undefined,
          period: lbPeriod,
        },
        authToken
      );
      success(editingLbId ? 'Leaderboard donor updated!' : 'Manual donor added to leaderboard!');
      onLogActivity?.(
        'Donator Leaderboard Updated',
        `Saved manual donor ${lbUsername.trim()} (₹${numericAmt})`,
        'settings'
      );
      resetLeaderboardForm();
      await refreshData();
    } catch (err: any) {
      error(err?.message || 'Failed to save leaderboard donor.');
    } finally {
      setLbSaving(false);
    }
  };

  const handleMoveLeaderboard = async (index: number, direction: -1 | 1) => {
    if (!data?.leaderboard) return;
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= data.leaderboard.length) return;
    const copy = [...data.leaderboard];
    const [item] = copy.splice(index, 1);
    copy.splice(targetIdx, 0, item);
    try {
      await donationService.reorderLeaderboard(
        copy.map((c) => c.id),
        authToken
      );
      success('Leaderboard positions updated!');
      await refreshData();
    } catch (err: any) {
      error(err?.message || 'Failed to reorder leaderboard.');
    }
  };

  const handleDeleteLeaderboardEntry = async (entryId: string) => {
    try {
      await donationService.deleteLeaderboardEntry(entryId, authToken);
      success('Removed donor from leaderboard.');
      if (editingLbId === entryId) resetLeaderboardForm();
      await refreshData();
    } catch (err: any) {
      error(err?.message || 'Failed to delete entry.');
    }
  };

  // ==================== REWARD HANDLERS ====================
  const resetRewardForm = () => {
    setEditingRewardId(null);
    setRewName('');
    setRewMinAmount('');
    setRewCategory('Rank');
    setRewDescription('');
    setRewBadgeLabel('');
    setRewEnabled(true);
  };

  const startEditReward = (tier: DonationRewardTier) => {
    setEditingRewardId(tier.id);
    setRewName(tier.name);
    setRewMinAmount(String(tier.minAmount));
    setRewCategory(tier.category);
    setRewDescription(tier.description);
    setRewBadgeLabel(tier.badgeLabel || '');
    setRewEnabled(tier.enabled !== false);
  };

  const handleSaveReward = async (e: React.FormEvent) => {
    e.preventDefault();
    const minAmt = Number(rewMinAmount);
    if (!rewName.trim() || !Number.isFinite(minAmt) || minAmt < 0) {
      error('Please provide a valid reward tier name and amount.');
      return;
    }
    setRewSaving(true);
    try {
      await donationService.saveRewardTier(
        {
          id: editingRewardId || undefined,
          name: rewName.trim(),
          minAmount: minAmt,
          category: rewCategory,
          description: rewDescription.trim(),
          badgeLabel: rewBadgeLabel.trim() || undefined,
          enabled: rewEnabled,
        },
        authToken
      );
      success(editingRewardId ? 'Reward tier updated!' : 'Reward tier created!');
      resetRewardForm();
      await refreshData();
    } catch (err: any) {
      error(err?.message || 'Failed to save reward tier.');
    } finally {
      setRewSaving(false);
    }
  };

  const handleToggleRewardTierEnabled = async (tier: DonationRewardTier) => {
    try {
      await donationService.saveRewardTier(
        {
          ...tier,
          enabled: !tier.enabled,
        },
        authToken
      );
      success(`${tier.name} ${tier.enabled ? 'disabled' : 'enabled'}.`);
      await refreshData();
    } catch (err: any) {
      error(err?.message || 'Failed to toggle reward tier.');
    }
  };

  const handleDeleteRewardTier = async (rewardId: string) => {
    try {
      await donationService.deleteRewardTier(rewardId, authToken);
      success('Reward tier deleted.');
      if (editingRewardId === rewardId) resetRewardForm();
      await refreshData();
    } catch (err: any) {
      error(err?.message || 'Failed to delete reward tier.');
    }
  };

  // ==================== SETTINGS HANDLERS ====================
  const handleQuickToggleSetting = async (
    key: 'enabled' | 'leaderboardEnabled' | 'rewardsEnabled',
    nextVal: boolean
  ) => {
    try {
      const res = await donationService.updateSettings({ [key]: nextVal }, authToken);
      setSettingsForm(res.settings);
      success('Donation setting updated!');
      await refreshData();
    } catch (err: any) {
      error(err?.message || 'Failed to update setting.');
    }
  };

  const handleUploadCustomQr = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !settingsForm) return;
    try {
      const optimized = await optimizeImage(file, 640, 640, 0.9);
      const check = validateImagePayload(optimized, { required: true, label: 'Custom QR' });
      if (!check.valid) {
        error(check.error || 'Invalid QR image.');
        return;
      }
      setSettingsForm({
        ...settingsForm,
        qrMode: 'custom',
        customQrUrl: check.cleaned,
      });
      success('Custom QR uploaded! Click Save Settings to apply.');
    } catch {
      error('Failed to process QR code image.');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settingsForm) return;
    setSettingsSaving(true);
    try {
      await donationService.updateSettings(settingsForm, authToken);
      success('All donation settings saved successfully!');
      onLogActivity?.(
        'Donation Settings Saved',
        `Updated donation UPI (${settingsForm.upiId}) and configuration`,
        'settings'
      );
      await refreshData();
    } catch (err: any) {
      error(err?.message || 'Failed to save donation settings.');
    } finally {
      setSettingsSaving(false);
    }
  };

  if (isLoading || !data) {
    return (
      <div className="py-12 flex items-center justify-center text-amber-300 gap-2 text-xs font-black uppercase">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Loading Donations Management...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="admin-donations-root">
      {/* Header & KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-4">
          <div className="flex items-center justify-between text-emerald-300 mb-1">
            <span className="text-[10px] font-black uppercase tracking-wider">Total Approved</span>
            <IndianRupee className="w-4 h-4" />
          </div>
          <div data-testid="admin-donations-kpi-total" className="text-xl font-black text-white font-display">
            {formatINR(data.stats.totalApprovedAmount)}
          </div>
          <span className="text-[10px] text-emerald-200/70">
            {data.stats.approvedCount} approved request(s)
          </span>
        </div>

        <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4">
          <div className="flex items-center justify-between text-amber-300 mb-1">
            <span className="text-[10px] font-black uppercase tracking-wider">Pending Review</span>
            <Clock className="w-4 h-4" />
          </div>
          <div data-testid="admin-donations-kpi-pending" className="text-xl font-black text-white font-display">
            {data.stats.pendingCount}
          </div>
          <span className="text-[10px] text-amber-200/70">Awaiting manual UTR check</span>
        </div>

        <div className="rounded-2xl border border-purple-500/30 bg-purple-950/20 p-4">
          <div className="flex items-center justify-between text-purple-300 mb-1">
            <span className="text-[10px] font-black uppercase tracking-wider">Total Donors</span>
            <Users className="w-4 h-4" />
          </div>
          <div data-testid="admin-donations-kpi-donors" className="text-xl font-black text-white font-display">
            {data.stats.totalUniqueDonors}
          </div>
          <span className="text-[10px] text-purple-200/70">Verified &amp; manual entries</span>
        </div>

        <div className="rounded-2xl border border-sky-500/30 bg-sky-950/20 p-4">
          <div className="flex items-center justify-between text-sky-300 mb-1">
            <span className="text-[10px] font-black uppercase tracking-wider">Reward Delivery</span>
            <Gift className="w-4 h-4" />
          </div>
          <div className="text-xl font-black text-white font-display">
            {data.stats.pendingRewardsCount} Pending
          </div>
          <span className="text-[10px] text-sky-200/70">
            {data.stats.deliveredRewardsCount} delivered in-game
          </span>
        </div>
      </div>

      {/* Sub-navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="admin-donations-subtab-requests"
            onClick={() => setSubTab('requests')}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-black uppercase cursor-pointer transition-all ${
              subTab === 'requests'
                ? 'bg-gradient-to-r from-amber-500 to-purple-600 text-white shadow'
                : 'bg-surface-deep text-muted-foreground hover:text-foreground border border-border'
            }`}
          >
            <HeartHandshake className="w-3.5 h-3.5" />
            <span>Requests ({data.requests.length})</span>
          </button>

          <button
            type="button"
            data-testid="admin-donations-subtab-leaderboard"
            onClick={() => setSubTab('leaderboard')}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-black uppercase cursor-pointer transition-all ${
              subTab === 'leaderboard'
                ? 'bg-gradient-to-r from-amber-500 to-purple-600 text-white shadow'
                : 'bg-surface-deep text-muted-foreground hover:text-foreground border border-border'
            }`}
          >
            <Trophy className="w-3.5 h-3.5" />
            <span>Leaderboard ({data.leaderboard.length})</span>
          </button>

          <button
            type="button"
            data-testid="admin-donations-subtab-rewards"
            onClick={() => setSubTab('rewards')}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-black uppercase cursor-pointer transition-all ${
              subTab === 'rewards'
                ? 'bg-gradient-to-r from-amber-500 to-purple-600 text-white shadow'
                : 'bg-surface-deep text-muted-foreground hover:text-foreground border border-border'
            }`}
          >
            <Gift className="w-3.5 h-3.5" />
            <span>Rewards ({data.rewards.length})</span>
          </button>

          <button
            type="button"
            data-testid="admin-donations-subtab-settings"
            onClick={() => setSubTab('settings')}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-black uppercase cursor-pointer transition-all ${
              subTab === 'settings'
                ? 'bg-gradient-to-r from-amber-500 to-purple-600 text-white shadow'
                : 'bg-surface-deep text-muted-foreground hover:text-foreground border border-border'
            }`}
          >
            <SettingsIcon className="w-3.5 h-3.5" />
            <span>Settings</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => void refreshData()}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface-deep px-3 py-2 text-xs font-bold text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {/* ================================================================ */}
      {/* SUBTAB 1: DONATION REQUESTS & VERIFICATION                       */}
      {/* ================================================================ */}
      {subTab === 'requests' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  data-testid={`admin-donations-filter-${st.toLowerCase()}`}
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase cursor-pointer ${
                    statusFilter === st
                      ? 'bg-amber-500 text-slate-950 shadow'
                      : 'bg-surface-deep text-muted-foreground border border-border hover:text-foreground'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 flex-1 max-w-sm">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  data-testid="admin-donations-search-input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by username or UTR..."
                  className="w-full rounded-xl border border-border bg-surface-deep pl-8 pr-3 py-2 text-xs text-foreground outline-none focus:border-amber-400"
                />
              </div>
              <button
                type="button"
                onClick={() => setShowAuditLogs(!showAuditLogs)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface-deep px-3 py-2 text-xs font-bold text-muted-foreground hover:text-foreground cursor-pointer whitespace-nowrap"
              >
                <ClipboardList className="w-3.5 h-3.5 text-purple-300" />
                <span>Audit ({data.auditLogs.length})</span>
              </button>
            </div>
          </div>

          {showAuditLogs && (
            <div className="rounded-2xl border border-purple-500/30 bg-surface-deep p-4 space-y-2 max-h-64 overflow-y-auto">
              <h4 className="text-xs font-black uppercase text-purple-300 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" />
                <span>Admin Donation Audit Log</span>
              </h4>
              {data.auditLogs.length === 0 ? (
                <p className="text-xs text-muted-foreground">No admin actions logged yet.</p>
              ) : (
                data.auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-xl border border-border bg-surface p-2.5 text-[11px] flex flex-wrap justify-between gap-2"
                  >
                    <div>
                      <span className="font-black text-amber-300 mr-2">[{log.action}]</span>
                      <span className="text-foreground">{log.details}</span>
                    </div>
                    <span className="text-muted-foreground font-mono">
                      {log.adminName} · {formatISTDateTime(log.timestamp)}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}

          {filteredRequests.length === 0 ? (
            <div className="rounded-2xl border border-border bg-surface-deep p-8 text-center text-xs text-muted-foreground">
              No donation requests match your filter criteria.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRequests.map((req) => {
                const isBusy = busyRequestId === req.id;
                return (
                  <div
                    key={req.id}
                    data-testid={`admin-donation-card-${req.id}`}
                    className="rounded-2xl border border-border bg-surface-deep p-4 space-y-3"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border pb-3">
                      <div className="flex items-start gap-3 min-w-0">
                        {req.screenshotUrl && (
                          <button
                            type="button"
                            onClick={() => setLightboxScreenshot(req.screenshotUrl)}
                            title="View Full Payment Screenshot"
                            className="relative group h-16 w-16 rounded-xl overflow-hidden border border-amber-400/40 shrink-0 cursor-pointer"
                          >
                            <img
                              src={req.screenshotUrl}
                              alt="Payment SS"
                              className="h-full w-full object-cover"
                            />
                            <span className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                              <Eye className="w-4 h-4 text-white" />
                            </span>
                          </button>
                        )}
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-black text-foreground">
                              {req.username}
                            </span>
                            <span className="rounded bg-surface border border-border px-2 py-0.5 text-[10px] font-mono uppercase text-purple-300">
                              {req.edition}
                            </span>
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase ${
                                req.status === 'APPROVED'
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                  : req.status === 'REJECTED'
                                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                  : 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40'
                              }`}
                            >
                              {req.status}
                            </span>
                          </div>
                          <div className="text-xs font-mono text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                            <span>Ref: {req.referenceNumber}</span>
                            <span>
                              UTR: <strong className="text-foreground">{req.utr}</strong>
                            </span>
                            <span>{formatISTDateTime(req.createdAt)}</span>
                          </div>
                          {req.message && (
                            <p className="text-xs text-purple-200/90 italic">
                              &ldquo;{req.message}&rdquo;
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="text-left md:text-right shrink-0 space-y-1">
                        <div className="text-xl font-black text-amber-300 font-display">
                          {formatINR(req.amount)}
                        </div>
                        {req.rewardName && (
                          <div className="flex md:justify-end items-center gap-1.5 text-[11px]">
                            <span className="text-muted-foreground truncate max-w-[180px]">
                              {req.rewardName}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded font-black text-[10px] ${
                                req.rewardStatus === 'DELIVERED'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : 'bg-amber-500/20 text-amber-300'
                              }`}
                            >
                              {req.rewardStatus}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Remarks + Action Buttons */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <input
                        type="text"
                        value={remarksMap[req.id] ?? req.adminRemarks ?? ''}
                        onChange={(e) =>
                          setRemarksMap((prev) => ({ ...prev, [req.id]: e.target.value }))
                        }
                        placeholder="Add admin remarks / notes..."
                        className="flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-xs text-foreground outline-none focus:border-amber-400"
                      />

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {req.status !== 'APPROVED' && (
                          <button
                            type="button"
                            disabled={isBusy}
                            data-testid={`admin-approve-donation-${req.id}`}
                            onClick={() => void handleApprove(req)}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-3 py-2 text-xs font-black uppercase cursor-pointer disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Approve</span>
                          </button>
                        )}
                        {req.status !== 'REJECTED' && (
                          <button
                            type="button"
                            disabled={isBusy}
                            data-testid={`admin-reject-donation-${req.id}`}
                            onClick={() => void handleReject(req)}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 hover:bg-rose-500/30 px-3 py-2 text-xs font-black uppercase cursor-pointer disabled:opacity-50"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Reject</span>
                          </button>
                        )}
                        {req.status === 'APPROVED' && req.rewardStatus !== 'NONE' && (
                          <button
                            type="button"
                            disabled={isBusy}
                            data-testid={`admin-toggle-reward-delivery-${req.id}`}
                            onClick={() => void handleToggleRewardStatus(req)}
                            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-black uppercase cursor-pointer disabled:opacity-50 ${
                              req.rewardStatus === 'DELIVERED'
                                ? 'border-amber-400/40 bg-amber-500/15 text-amber-200'
                                : 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300'
                            }`}
                          >
                            <Gift className="w-3.5 h-3.5" />
                            <span>
                              {req.rewardStatus === 'DELIVERED'
                                ? 'Mark Pending'
                                : 'Mark Delivered'}
                            </span>
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={isBusy}
                          data-testid={`admin-delete-donation-${req.id}`}
                          aria-label={`Delete donation ${req.referenceNumber}`}
                          onClick={() => void handleDeleteRequest(req)}
                          className="p-2 rounded-xl border border-border text-muted-foreground hover:text-rose-400 cursor-pointer"
                          title="Delete Request"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* SUBTAB 2: MANUAL DONATOR LEADERBOARD MANAGEMENT                  */}
      {/* ================================================================ */}
      {subTab === 'leaderboard' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface-deep p-4">
            <div>
              <h4 className="text-sm font-black text-foreground">Leaderboard Visibility</h4>
              <p className="text-xs text-muted-foreground">
                Show or hide Top Donators Leaderboard on the public Donator Page. Approved donations automatically aggregate here.
              </p>
            </div>
            <button
              type="button"
              data-testid="admin-toggle-leaderboard-visibility"
              onClick={() =>
                void handleQuickToggleSetting(
                  'leaderboardEnabled',
                  !data.settings.leaderboardEnabled
                )
              }
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black uppercase cursor-pointer ${
                data.settings.leaderboardEnabled
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-surface border border-border text-muted-foreground'
              }`}
            >
              {data.settings.leaderboardEnabled ? (
                <>
                  <ToggleRight className="w-4 h-4" />
                  <span>Enabled</span>
                </>
              ) : (
                <>
                  <ToggleLeft className="w-4 h-4" />
                  <span>Disabled</span>
                </>
              )}
            </button>
          </div>

          <form
            onSubmit={handleSaveLeaderboard}
            className="rounded-2xl border border-amber-500/30 bg-surface-deep p-4 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-black text-amber-300 flex items-center gap-2">
                <Crown className="w-4 h-4" />
                <span>
                  {editingLbId ? 'Edit Manual Leaderboard Donor' : 'Add Manual Donator Entry'}
                </span>
              </h4>
              {editingLbId && (
                <button
                  type="button"
                  onClick={resetLeaderboardForm}
                  className="text-xs font-bold text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Cancel Edit
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-muted-foreground mb-1">
                  Minecraft Username *
                </label>
                <input
                  type="text"
                  required
                  data-testid="admin-lb-username-input"
                  value={lbUsername}
                  onChange={(e) => setLbUsername(e.target.value)}
                  placeholder="PlayerIGN or .BedrockIGN"
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-foreground font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-muted-foreground mb-1">
                  Edition *
                </label>
                <select
                  data-testid="admin-lb-edition-select"
                  value={lbEdition}
                  onChange={(e) => setLbEdition(e.target.value as DonationEdition)}
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-foreground"
                >
                  <option value="java">Java Edition</option>
                  <option value="bedrock">Bedrock Edition</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-muted-foreground mb-1">
                  Donation Amount (₹ INR) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  required
                  data-testid="admin-lb-amount-input"
                  value={lbAmount}
                  onChange={(e) => setLbAmount(e.target.value)}
                  placeholder="e.g. 1500"
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-foreground font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-muted-foreground mb-1">
                  Donor Badge / Rank
                </label>
                <input
                  type="text"
                  list="donor-badge-presets"
                  data-testid="admin-lb-badge-input"
                  value={lbBadge}
                  onChange={(e) => setLbBadge(e.target.value)}
                  placeholder="e.g. Mythic Donor"
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-foreground"
                />
                <datalist id="donor-badge-presets">
                  {DONATION_BADGE_PRESETS.map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-muted-foreground mb-1">
                  Leaderboard Scope
                </label>
                <select
                  value={lbPeriod}
                  onChange={(e) => setLbPeriod(e.target.value as DonatorLeaderboardPeriod)}
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-foreground"
                >
                  <option value="both">Both (All-Time &amp; Monthly)</option>
                  <option value="all_time">All-Time Only</option>
                  <option value="monthly">Monthly Only</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-muted-foreground mb-1">
                  Optional Profile Image
                </label>
                <div className="flex items-center gap-2">
                  <label className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-bold text-foreground cursor-pointer hover:border-amber-400">
                    <Upload className="w-3.5 h-3.5 text-amber-300" />
                    <span>{lbAvatarUrl ? 'Change Image' : 'Upload Avatar'}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleUploadDonorAvatar}
                      className="sr-only"
                    />
                  </label>
                  {lbAvatarUrl && (
                    <button
                      type="button"
                      onClick={() => setLbAvatarUrl('')}
                      className="p-2 rounded-xl border border-border text-rose-400 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={lbSaving}
              data-testid="admin-lb-save-btn"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-purple-600 px-4 py-2.5 text-xs font-black uppercase text-white cursor-pointer disabled:opacity-60"
            >
              {lbSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              <span>{editingLbId ? 'Save Changes' : 'Add to Leaderboard'}</span>
            </button>
          </form>

          {/* Manual Leaderboard Entries List with Reorder Controls */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-black uppercase text-muted-foreground">
              Manual Leaderboard Entries (Position Order)
            </h4>
            {data.leaderboard.length === 0 ? (
              <p className="text-xs text-muted-foreground">No manual entries configured.</p>
            ) : (
              data.leaderboard.map((entry, idx) => (
                <div
                  key={entry.id}
                  data-testid={`admin-lb-row-${entry.id}`}
                  className="rounded-xl border border-border bg-surface-deep p-3 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-xs font-black text-amber-300 w-7">
                      #{idx + 1}
                    </span>
                    <img
                      src={
                        entry.avatarUrl ||
                        `https://mc-heads.net/avatar/${encodeURIComponent(
                          entry.username.replace(/^\.+/, '') || 'Steve'
                        )}/48`
                      }
                      alt={entry.username}
                      className="h-9 w-9 rounded-lg object-cover border border-border [image-rendering:pixelated]"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-black text-foreground truncate">
                          {entry.username}
                        </span>
                        <span className="text-[10px] font-mono uppercase text-muted-foreground">
                          ({entry.edition})
                        </span>
                      </div>
                      <span className="text-[11px] font-bold text-purple-300">
                        {entry.badge} · {entry.period}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-black text-amber-300 font-mono mr-2">
                      {formatINR(entry.amount)}
                    </span>
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => void handleMoveLeaderboard(idx, -1)}
                      className="p-1.5 rounded-lg border border-border bg-surface text-muted-foreground hover:text-foreground disabled:opacity-30 cursor-pointer"
                      aria-label="Move Up"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === data.leaderboard.length - 1}
                      onClick={() => void handleMoveLeaderboard(idx, 1)}
                      className="p-1.5 rounded-lg border border-border bg-surface text-muted-foreground hover:text-foreground disabled:opacity-30 cursor-pointer"
                      aria-label="Move Down"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => startEditLeaderboard(entry)}
                      className="p-1.5 rounded-lg border border-border bg-surface text-sky-300 hover:bg-sky-500/15 cursor-pointer"
                      aria-label="Edit Entry"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteLeaderboardEntry(entry.id)}
                      className="p-1.5 rounded-lg border border-border bg-surface text-rose-400 hover:bg-rose-500/15 cursor-pointer"
                      aria-label="Delete Entry"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* SUBTAB 3: DONATOR REWARDS MANAGEMENT                             */}
      {/* ================================================================ */}
      {subTab === 'rewards' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface-deep p-4">
            <div>
              <h4 className="text-sm font-black text-foreground">Donator Rewards System</h4>
              <p className="text-xs text-muted-foreground">
                Enable or disable reward tiers displayed on the Donator page.
              </p>
            </div>
            <button
              type="button"
              data-testid="admin-toggle-rewards-system"
              onClick={() =>
                void handleQuickToggleSetting('rewardsEnabled', !data.settings.rewardsEnabled)
              }
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black uppercase cursor-pointer ${
                data.settings.rewardsEnabled
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-surface border border-border text-muted-foreground'
              }`}
            >
              {data.settings.rewardsEnabled ? (
                <>
                  <ToggleRight className="w-4 h-4" />
                  <span>Enabled</span>
                </>
              ) : (
                <>
                  <ToggleLeft className="w-4 h-4" />
                  <span>Disabled</span>
                </>
              )}
            </button>
          </div>

          <form
            onSubmit={handleSaveReward}
            className="rounded-2xl border border-purple-500/30 bg-surface-deep p-4 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-black text-purple-300 flex items-center gap-2">
                <Gift className="w-4 h-4" />
                <span>{editingRewardId ? 'Edit Reward Tier' : 'Create Reward Tier'}</span>
              </h4>
              {editingRewardId && (
                <button
                  type="button"
                  onClick={resetRewardForm}
                  className="text-xs font-bold text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Cancel Edit
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-muted-foreground mb-1">
                  Reward Name *
                </label>
                <input
                  type="text"
                  required
                  data-testid="admin-rew-name-input"
                  value={rewName}
                  onChange={(e) => setRewName(e.target.value)}
                  placeholder="e.g. Emerald Rank + 10k Coins"
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-foreground"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-muted-foreground mb-1">
                  Minimum Donation Amount (₹) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  required
                  data-testid="admin-rew-amount-input"
                  value={rewMinAmount}
                  onChange={(e) => setRewMinAmount(e.target.value)}
                  placeholder="e.g. 250"
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-foreground font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-muted-foreground mb-1">
                  Category
                </label>
                <select
                  data-testid="admin-rew-category-select"
                  value={rewCategory}
                  onChange={(e) => setRewCategory(e.target.value as DonationRewardCategory)}
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-foreground"
                >
                  <option value="Rank">Minecraft Rank</option>
                  <option value="Coins">Coins</option>
                  <option value="Keys">Keys</option>
                  <option value="Kits">Kits</option>
                  <option value="Cosmetics">Cosmetics</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-muted-foreground mb-1">
                  Donor Badge Label (Optional)
                </label>
                <input
                  type="text"
                  value={rewBadgeLabel}
                  onChange={(e) => setRewBadgeLabel(e.target.value)}
                  placeholder="e.g. Diamond Supporter"
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-foreground"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-muted-foreground mb-1">
                  Description
                </label>
                <input
                  type="text"
                  data-testid="admin-rew-desc-input"
                  value={rewDescription}
                  onChange={(e) => setRewDescription(e.target.value)}
                  placeholder="Describe perks players receive in-game..."
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-foreground"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={rewSaving}
              data-testid="admin-rew-save-btn"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-purple-600 px-4 py-2.5 text-xs font-black uppercase text-white cursor-pointer disabled:opacity-60"
            >
              {rewSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              <span>{editingRewardId ? 'Save Reward Tier' : 'Create Reward Tier'}</span>
            </button>
          </form>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.rewards.map((tier) => (
              <div
                key={tier.id}
                className={`rounded-2xl border p-4 space-y-2 ${
                  tier.enabled ? 'border-border bg-surface-deep' : 'border-border/40 bg-surface-deep/40 opacity-70'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded bg-purple-500/20 border border-purple-400/30 px-2 py-0.5 text-[10px] font-black uppercase text-purple-200">
                    {tier.category} · {formatINR(tier.minAmount)}+
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void handleToggleRewardTierEnabled(tier)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase cursor-pointer ${
                        tier.enabled
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-surface text-muted-foreground'
                      }`}
                    >
                      {tier.enabled ? 'Active' : 'Disabled'}
                    </button>
                    <button
                      type="button"
                      onClick={() => startEditReward(tier)}
                      className="p-1.5 rounded-lg border border-border text-sky-300 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteRewardTier(tier.id)}
                      className="p-1.5 rounded-lg border border-border text-rose-400 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <h5 className="text-sm font-black text-foreground">{tier.name}</h5>
                <p className="text-xs text-muted-foreground">{tier.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* SUBTAB 4: DONATION SETTINGS                                      */}
      {/* ================================================================ */}
      {subTab === 'settings' && settingsForm && (
        <form
          onSubmit={handleSaveSettings}
          className="rounded-2xl border border-border bg-surface-deep p-5 space-y-5"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="rounded-xl border border-border bg-surface p-3.5 flex items-center justify-between cursor-pointer">
              <span className="text-xs font-black text-foreground">Donation Page Enabled</span>
              <input
                type="checkbox"
                data-testid="admin-settings-enabled-checkbox"
                checked={settingsForm.enabled}
                onChange={(e) => setSettingsForm({ ...settingsForm, enabled: e.target.checked })}
                className="h-4 w-4 accent-amber-400"
              />
            </label>

            <label className="rounded-xl border border-border bg-surface p-3.5 flex items-center justify-between cursor-pointer">
              <span className="text-xs font-black text-foreground">Leaderboard Enabled</span>
              <input
                type="checkbox"
                checked={settingsForm.leaderboardEnabled}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, leaderboardEnabled: e.target.checked })
                }
                className="h-4 w-4 accent-amber-400"
              />
            </label>

            <label className="rounded-xl border border-border bg-surface p-3.5 flex items-center justify-between cursor-pointer">
              <span className="text-xs font-black text-foreground">Reward System Enabled</span>
              <input
                type="checkbox"
                checked={settingsForm.rewardsEnabled}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, rewardsEnabled: e.target.checked })
                }
                className="h-4 w-4 accent-amber-400"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1">
                Donation UPI ID *
              </label>
              <input
                type="text"
                required
                data-testid="admin-settings-upi-input"
                value={settingsForm.upiId}
                onChange={(e) => setSettingsForm({ ...settingsForm, upiId: e.target.value })}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-foreground font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1">
                UPI Payee Name
              </label>
              <input
                type="text"
                value={settingsForm.upiPayeeName}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, upiPayeeName: e.target.value })
                }
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-foreground"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1">
                Minimum Donation Amount (0 = Optional / No Limit)
              </label>
              <input
                type="number"
                min={0}
                step="1"
                data-testid="admin-settings-min-amount-input"
                value={settingsForm.minAmount}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, minAmount: Number(e.target.value || 0) })
                }
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-foreground font-mono"
              />
            </div>
          </div>

          {/* QR Mode & Upload */}
          <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-black text-foreground">UPI QR Code Mode</span>
              <div className="flex rounded-lg bg-surface-deep p-0.5 border border-border">
                <button
                  type="button"
                  onClick={() => setSettingsForm({ ...settingsForm, qrMode: 'dynamic' })}
                  className={`px-3 py-1 rounded text-xs font-black cursor-pointer ${
                    settingsForm.qrMode === 'dynamic'
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-muted-foreground'
                  }`}
                >
                  Auto-Generate Dynamic QR
                </button>
                <button
                  type="button"
                  onClick={() => setSettingsForm({ ...settingsForm, qrMode: 'custom' })}
                  className={`px-3 py-1 rounded text-xs font-black cursor-pointer ${
                    settingsForm.qrMode === 'custom'
                      ? 'bg-purple-500 text-white'
                      : 'text-muted-foreground'
                  }`}
                >
                  Custom Uploaded QR
                </button>
              </div>
            </div>

            {settingsForm.qrMode === 'custom' && (
              <div className="flex flex-wrap items-center gap-4">
                {settingsForm.customQrUrl && (
                  <img
                    src={settingsForm.customQrUrl}
                    alt="Custom UPI QR"
                    className="h-24 w-24 rounded-xl bg-white p-1.5 object-contain border border-border"
                  />
                )}
                <label className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface-deep px-4 py-2 text-xs font-bold text-foreground cursor-pointer hover:border-amber-400">
                  <Upload className="w-4 h-4 text-amber-300" />
                  <span>Upload QR Code Image</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleUploadCustomQr}
                    className="sr-only"
                  />
                </label>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1">
                Payment Instructions
              </label>
              <textarea
                rows={3}
                data-testid="admin-settings-instructions-input"
                value={settingsForm.instructions}
                onChange={(e) => setSettingsForm({ ...settingsForm, instructions: e.target.value })}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-foreground"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1">
                Custom Thank-You Confirmation Message
              </label>
              <input
                type="text"
                data-testid="admin-settings-thankyou-input"
                value={settingsForm.thankYouMessage}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, thankYouMessage: e.target.value })
                }
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-foreground"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1">
                Rewards Showcase Banner Message
              </label>
              <input
                type="text"
                value={settingsForm.rewardsBannerMessage}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, rewardsBannerMessage: e.target.value })
                }
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-foreground"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={settingsSaving}
            data-testid="admin-settings-save-btn"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-purple-600 px-5 py-3 text-xs font-black uppercase text-white cursor-pointer disabled:opacity-60"
          >
            {settingsSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>Save Donation Settings</span>
          </button>
        </form>
      )}

      {/* SCREENSHOT LIGHTBOX */}
      {lightboxScreenshot && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
          <div className="relative max-w-2xl w-full rounded-2xl border border-amber-400/50 bg-surface p-4">
            <button
              type="button"
              onClick={() => setLightboxScreenshot(null)}
              className="absolute top-3 right-3 p-2 rounded-xl bg-surface-deep text-foreground cursor-pointer"
              aria-label="Close Screenshot"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={lightboxScreenshot}
              alt="Full Payment Proof Screenshot"
              className="max-h-[80vh] w-auto mx-auto rounded-xl object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
};
