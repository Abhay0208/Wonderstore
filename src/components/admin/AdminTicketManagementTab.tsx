import React, { useState, useEffect } from 'react';
import {
  LifeBuoy,
  Search,
  Inbox,
  AlertCircle,
  Clock,
  CheckCheck,
  Lock,
  MessageSquare,
  Bell,
  Users,
  Bot,
  Star,
  ArrowLeft,
  Trash2,
  UserPlus,
  RotateCcw,
  RefreshCw,
  Shield,
  History,
  Send,
  Zap,
  Check,
  X,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useTickets } from '../../context/TicketContext';
import { useToast } from '../../context/ToastContext';
import {
  SupportTicket,
  SupportTicketPriority,
  SupportTicketStatus,
  SupportStaffPermission,
  TicketHistoryEntry,
} from '../../types';
import {
  SUPPORT_TICKET_CATEGORIES,
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_STATUSES,
  computeTicketDashboardStats,
  filterSupportTickets,
  getPriorityLabel,
  getStatusLabel,
} from '../../utils/supportTicketHelpers';
import { formatISTDateTime } from '../../utils/dateUtils';
import { TicketChatThread } from '../support/TicketChatThread';

interface AdminTicketManagementTabProps {
  onLogActivity?: (
    action: string,
    details: string,
    type?: 'ticket' | 'settings' | 'other',
    adminName?: string
  ) => void;
  adminName?: string;
}

export const AdminTicketManagementTab: React.FC<AdminTicketManagementTabProps> = ({
  onLogActivity,
  adminName,
}) => {
  const { success, error } = useToast();
  const {
    staffSession,
    staffTickets,
    staffNotifications,
    unreadStaffNotificationsCount,
    staffMembers,
    ratings,
    discordConfig,
    isLoadingStaffTickets,
    refreshStaffData,
    openStaffTicketBundle,
    replyAsStaff,
    updateTicketByStaff,
    deleteTicketByStaff,
    markStaffNotificationsRead,
    upsertStaffMember,
    deleteStaffMember,
    saveDiscordConfig,
    testDiscordWebhook,
  } = useTickets();

  const [subView, setSubView] = useState<'tickets' | 'notifications' | 'staff' | 'discord' | 'ratings'>('tickets');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [selectedHistory, setSelectedHistory] = useState<TicketHistoryEntry[]>([]);

  // Search & filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | SupportTicketStatus>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [priorityFilter, setPriorityFilter] = useState<string>('All');

  // Delete confirmation modal
  const [pendingDeleteTicket, setPendingDeleteTicket] = useState<SupportTicket | null>(null);

  // Staff permissions modal / form
  const [editingStaff, setEditingStaff] = useState<Partial<SupportStaffPermission> | null>(null);
  const [showPasskeys, setShowPasskeys] = useState<Record<string, boolean>>({});

  // Backend Discord config state (write-only for URL so raw secret is never returned/stored client-side)
  const [discordUrlInput, setDiscordUrlInput] = useState('');
  const [discordEnabled, setDiscordEnabled] = useState(true);
  const [discordBotName, setDiscordBotName] = useState('WonderMC Support Desk');
  const [discordPingRole, setDiscordPingRole] = useState('@here');
  const [discordNotifyNew, setDiscordNotifyNew] = useState(true);
  const [discordNotifyUpdate, setDiscordNotifyUpdate] = useState(true);
  const [savingDiscord, setSavingDiscord] = useState(false);
  const [testingDiscord, setTestingDiscord] = useState(false);

  useEffect(() => {
    if (discordConfig) {
      setDiscordEnabled(discordConfig.enabled);
      setDiscordBotName(discordConfig.botName || 'WonderMC Support Desk');
      setDiscordPingRole(discordConfig.pingRole || '');
      setDiscordNotifyNew(discordConfig.notifyOnNewTicket);
      setDiscordNotifyUpdate(discordConfig.notifyOnImportantUpdate);
    }
  }, [discordConfig]);

  const isAdmin = Boolean(staffSession?.isAdmin);
  const perm = staffSession?.permissions;
  const canReply = isAdmin || Boolean(perm?.canReply);
  const canAssign = isAdmin || Boolean(perm?.canAssign);
  const canChangeStatus = isAdmin || Boolean(perm?.canChangeStatus);
  const canAddInternalNotes = isAdmin || Boolean(perm?.canAddInternalNotes);
  const canDeleteTickets = isAdmin || Boolean(perm?.canDeleteTickets);

  const stats = computeTicketDashboardStats(staffTickets);
  const filteredTickets = filterSupportTickets(staffTickets, {
    search,
    category: categoryFilter,
    priority: priorityFilter,
    status: statusFilter,
  });

  const selectedTicket = staffTickets.find((t) => t.id === selectedTicketId) || null;

  const handleOpenTicket = async (tkt: SupportTicket) => {
    setSelectedTicketId(tkt.id);
    try {
      const b = await openStaffTicketBundle(tkt.id);
      setSelectedHistory(b.history || []);
    } catch {
      // handled in Thread
    }
  };

  const handleUpdatePatch = async (
    ticketId: string,
    patch: { status?: SupportTicketStatus; priority?: SupportTicketPriority; assignedStaffId?: string | null },
    toastMsg: string
  ) => {
    try {
      const updated = await updateTicketByStaff(ticketId, patch);
      const b = await openStaffTicketBundle(ticketId).catch(() => null);
      if (b) setSelectedHistory(b.history || []);
      onLogActivity?.('Support Ticket Updated', `${updated.ticketNumber}: ${toastMsg}`, 'ticket', adminName);
      success(toastMsg);
    } catch (err: any) {
      error(err?.message || 'Failed to update ticket.');
    }
  };

  const handleConfirmDelete = async () => {
    if (!pendingDeleteTicket) return;
    try {
      await deleteTicketByStaff(pendingDeleteTicket.id);
      onLogActivity?.(
        'Ticket Deleted',
        `Deleted support ticket ${pendingDeleteTicket.ticketNumber}`,
        'ticket',
        adminName
      );
      success(`Ticket ${pendingDeleteTicket.ticketNumber} deleted.`);
      if (selectedTicketId === pendingDeleteTicket.id) setSelectedTicketId(null);
      setPendingDeleteTicket(null);
    } catch (err: any) {
      error(err?.message || 'Failed to delete ticket.');
    }
  };

  const handleSaveStaffForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaff?.name?.trim()) {
      error('Please enter staff member name.');
      return;
    }
    try {
      await upsertStaffMember({
        id: editingStaff.id,
        name: editingStaff.name.trim(),
        roleTitle: (editingStaff.roleTitle || 'Moderator').trim(),
        passkey: editingStaff.passkey?.trim() || undefined,
        email: editingStaff.email?.trim() || undefined,
        active: editingStaff.active ?? true,
        canViewAllTickets: Boolean(editingStaff.canViewAllTickets),
        canReply: editingStaff.canReply ?? true,
        canAssign: Boolean(editingStaff.canAssign),
        canChangeStatus: editingStaff.canChangeStatus ?? true,
        canAddInternalNotes: editingStaff.canAddInternalNotes ?? true,
        canDeleteTickets: Boolean(editingStaff.canDeleteTickets),
      });
      setEditingStaff(null);
      success('Staff member permissions saved!');
    } catch (err: any) {
      error(err?.message || 'Failed to save staff permissions.');
    }
  };

  const handleSaveDiscordBackend = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingDiscord(true);
    try {
      await saveDiscordConfig({
        webhookUrl: discordUrlInput.trim() || undefined,
        enabled: discordEnabled,
        botName: discordBotName.trim(),
        pingRole: discordPingRole.trim(),
        notifyOnNewTicket: discordNotifyNew,
        notifyOnImportantUpdate: discordNotifyUpdate,
      });
      setDiscordUrlInput('');
      success('Discord support webhook settings saved securely on backend!');
    } catch (err: any) {
      error(err?.message || 'Failed to save Discord settings.');
    } finally {
      setSavingDiscord(false);
    }
  };

  const handleTestDiscordBackend = async () => {
    setTestingDiscord(true);
    try {
      await testDiscordWebhook(discordUrlInput.trim() || undefined);
      success('Test Discord alert dispatched from backend!');
    } catch (err: any) {
      error(err?.message || 'Discord webhook test failed.');
    } finally {
      setTestingDiscord(false);
    }
  };

  if (!staffSession) {
    return (
      <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-6 text-center space-y-2">
        <Shield className="w-8 h-8 text-amber-400 mx-auto" />
        <h4 className="text-sm font-black text-foreground">Staff / Admin Session Required</h4>
        <p className="text-xs text-muted-foreground">
          Please re-authenticate through the Admin / Staff Portal to manage central support tickets.
        </p>
      </div>
    );
  }

  const avgStars =
    ratings.length > 0
      ? (ratings.reduce((sum, r) => sum + r.stars, 0) / ratings.length).toFixed(1)
      : null;

  return (
    <div className="space-y-5">
      {/* Header + Portal Role Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <LifeBuoy className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-foreground font-display flex items-center gap-2 flex-wrap">
              <span>Support Ticket Management</span>
              <span className="rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-bold">
                LIVE SYNC
              </span>
              <span className="rounded-full bg-surface-deep text-muted-foreground border border-border px-2 py-0.5 text-[10px] font-bold">
                {staffSession.name} ({staffSession.roleTitle})
              </span>
            </h3>
            <p className="text-xs text-muted-foreground">
              {isAdmin
                ? 'Full Admin control: view all tickets, assign staff, manage permissions & backend Discord alerts.'
                : perm?.canViewAllTickets
                ? 'Authorized Staff access: viewing all support tickets.'
                : 'Scoped Staff view: displaying tickets assigned to your account.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void refreshStaffData()}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface-deep px-3 py-1.5 text-xs font-bold text-foreground hover:border-accent cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoadingStaffTickets ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Sub-Navigation Pills */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setSelectedTicketId(null);
            setSubView('tickets');
          }}
          className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-black uppercase cursor-pointer transition-colors ${
            subView === 'tickets'
              ? 'bg-accent text-accent-foreground'
              : 'bg-surface-deep border border-border text-muted-foreground hover:text-foreground'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Tickets ({staffTickets.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setSubView('notifications')}
          className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-black uppercase cursor-pointer transition-colors ${
            subView === 'notifications'
              ? 'bg-accent text-accent-foreground'
              : 'bg-surface-deep border border-border text-muted-foreground hover:text-foreground'
          }`}
        >
          <Bell className="w-3.5 h-3.5" />
          <span>Notifications</span>
          {unreadStaffNotificationsCount > 0 && (
            <span className="rounded-full bg-rose-500 px-1.5 py-0.2 text-[10px] font-black text-white">
              {unreadStaffNotificationsCount}
            </span>
          )}
        </button>

        {isAdmin && (
          <button
            type="button"
            onClick={() => setSubView('staff')}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-black uppercase cursor-pointer transition-colors ${
              subView === 'staff'
                ? 'bg-accent text-accent-foreground'
                : 'bg-surface-deep border border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Staff &amp; Permissions ({staffMembers.length})</span>
          </button>
        )}

        {isAdmin && (
          <button
            type="button"
            onClick={() => setSubView('discord')}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-black uppercase cursor-pointer transition-colors ${
              subView === 'discord'
                ? 'bg-indigo-600 text-white'
                : 'bg-surface-deep border border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>Discord Webhook</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setSubView('ratings')}
          className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-black uppercase cursor-pointer transition-colors ${
            subView === 'ratings'
              ? 'bg-amber-500 text-slate-950'
              : 'bg-surface-deep border border-border text-muted-foreground hover:text-foreground'
          }`}
        >
          <Star className="w-3.5 h-3.5" />
          <span>Ratings ({ratings.length})</span>
        </button>
      </div>

      {/* 6 Required Dashboard Stats Cards */}
      {subView === 'tickets' && !selectedTicket && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            <StatCard label="Total Tickets" value={stats.total} tone="default" icon={<Inbox className="w-4 h-4" />} />
            <StatCard label="Open Tickets" value={stats.open} tone="sky" icon={<AlertCircle className="w-4 h-4" />} />
            <StatCard label="In Progress" value={stats.inProgress} tone="indigo" icon={<Clock className="w-4 h-4" />} />
            <StatCard label="Waiting for User" value={stats.waitingForUser} tone="amber" icon={<MessageSquare className="w-4 h-4" />} />
            <StatCard label="Resolved" value={stats.resolved} tone="emerald" icon={<CheckCheck className="w-4 h-4" />} />
            <StatCard label="Closed" value={stats.closed} tone="slate" icon={<Lock className="w-4 h-4" />} />
          </div>

          {/* Search & Multi-Filters */}
          <div className="rounded-2xl border border-border bg-surface-deep p-3.5 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
              <div className="relative md:col-span-2">
                <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by Ticket ID (TKT-...), Username, Email, IGN..."
                  className="w-full rounded-xl border border-border bg-surface pl-9 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-accent"
                />
              </div>

              <select
                aria-label="Filter by Category"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="rounded-xl border border-border bg-surface px-3 py-2 text-xs font-bold text-foreground outline-none focus:border-accent"
              >
                <option value="All">All Categories</option>
                {SUPPORT_TICKET_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter by Priority"
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="rounded-xl border border-border bg-surface px-3 py-2 text-xs font-bold text-foreground outline-none focus:border-accent"
              >
                <option value="All">All Priorities</option>
                {SUPPORT_TICKET_PRIORITIES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-black uppercase cursor-pointer ${
                  statusFilter === 'all'
                    ? 'bg-accent text-accent-foreground'
                    : 'bg-surface text-muted-foreground border border-border hover:text-foreground'
                }`}
              >
                All ({staffTickets.length})
              </button>
              {SUPPORT_TICKET_STATUSES.map((st) => {
                const count = staffTickets.filter((t) => t.status === st.id).length;
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setStatusFilter(st.id)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-black uppercase cursor-pointer ${
                      statusFilter === st.id
                        ? 'bg-accent text-accent-foreground'
                        : 'bg-surface text-muted-foreground border border-border hover:text-foreground'
                    }`}
                  >
                    {st.label} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {/* Ticket List */}
          <div className="space-y-3">
            {filteredTickets.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-12 text-center bg-surface-deep/50">
                <Inbox className="w-10 h-10 text-muted-foreground/40 mx-auto mb-2" />
                <h4 className="text-sm font-black text-foreground">No Support Tickets Found</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Real tickets submitted by logged-in users will appear here immediately.
                </p>
              </div>
            ) : (
              filteredTickets.map((tkt) => {
                const statusMeta = SUPPORT_TICKET_STATUSES.find((s) => s.id === tkt.status);
                const priorityMeta = SUPPORT_TICKET_PRIORITIES.find((p) => p.id === tkt.priority);
                return (
                  <div
                    key={tkt.id}
                    className="rounded-2xl border border-border bg-surface-deep/80 p-4 hover:border-accent/60 transition-all space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => void handleOpenTicket(tkt)}
                        className="text-left flex-1 min-w-[240px] cursor-pointer space-y-1.5"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-black px-2 py-0.5 rounded bg-accent/15 text-accent border border-accent/30">
                            {tkt.ticketNumber}
                          </span>
                          <span className="text-sm font-black text-foreground hover:text-accent transition-colors">
                            {tkt.subject}
                          </span>
                          {(tkt.unreadByStaff || 0) > 0 && (
                            <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-black text-white">
                              New Message
                            </span>
                          )}
                          {tkt.ratingSubmitted && (
                            <span className="rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 text-[10px] font-bold">
                              ★ Rated
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                          <span>
                            User: <strong className="text-foreground">{tkt.username}</strong> ({tkt.userEmail})
                          </span>
                          <span>Category: <strong className="text-foreground">{tkt.category}</strong></span>
                          <span>
                            Assigned:{' '}
                            <strong className={tkt.assignedStaffName ? 'text-emerald-400' : 'text-amber-300'}>
                              {tkt.assignedStaffName || 'Unassigned'}
                            </strong>
                          </span>
                          <span className="font-mono">Created: {formatISTDateTime(tkt.createdAt)}</span>
                          {tkt.lastReplyAt && (
                            <span className="font-mono">Last Reply: {formatISTDateTime(tkt.lastReplyAt)}</span>
                          )}
                        </div>
                      </button>

                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${priorityMeta?.badgeClass || ''}`}>
                          {getPriorityLabel(tkt.priority)}
                        </span>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${statusMeta?.badgeClass || ''}`}>
                          {getStatusLabel(tkt.status)}
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleOpenTicket(tkt)}
                          className="rounded-lg bg-accent px-3 py-1.5 text-[11px] font-black uppercase text-accent-foreground hover:opacity-90 cursor-pointer"
                        >
                          Open &amp; Reply
                        </button>
                        {canDeleteTickets && (
                          <button
                            type="button"
                            onClick={() => setPendingDeleteTicket(tkt)}
                            className="p-1.5 rounded-lg border border-border bg-surface text-muted-foreground hover:text-rose-400 hover:border-rose-400 cursor-pointer"
                            title="Delete Ticket"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* Detailed Ticket Workspace */}
      {subView === 'tickets' && selectedTicket && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setSelectedTicketId(null)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface-deep px-3 py-1.5 text-xs font-bold text-foreground hover:border-accent cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to All Tickets</span>
            </button>

            <div className="flex flex-wrap items-center gap-2">
              {canAssign && (
                <select
                  aria-label="Assign staff member"
                  value={selectedTicket.assignedStaffId || ''}
                  onChange={(e) =>
                    void handleUpdatePatch(
                      selectedTicket.id,
                      { assignedStaffId: e.target.value || null },
                      e.target.value ? 'Staff assignment updated!' : 'Ticket unassigned'
                    )
                  }
                  className="rounded-xl border border-border bg-surface-deep px-2.5 py-1.5 text-xs font-bold text-foreground outline-none focus:border-accent"
                >
                  <option value="">Unassigned</option>
                  <option value="owner-admin">Main Server Owner (Owner)</option>
                  {staffMembers
                    .filter((s) => s.active)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.roleTitle})
                      </option>
                    ))}
                </select>
              )}

              <select
                aria-label="Ticket priority"
                value={selectedTicket.priority}
                onChange={(e) =>
                  void handleUpdatePatch(
                    selectedTicket.id,
                    { priority: e.target.value as SupportTicketPriority },
                    `Priority updated to ${e.target.value.toUpperCase()}`
                  )
                }
                className="rounded-xl border border-border bg-surface-deep px-2.5 py-1.5 text-xs font-bold text-foreground outline-none focus:border-accent"
              >
                {SUPPORT_TICKET_PRIORITIES.map((p) => (
                  <option key={p.id} value={p.id}>
                    Priority: {p.label}
                  </option>
                ))}
              </select>

              {canChangeStatus && (
                <select
                  aria-label="Ticket status"
                  value={selectedTicket.status}
                  onChange={(e) =>
                    void handleUpdatePatch(
                      selectedTicket.id,
                      { status: e.target.value as SupportTicketStatus },
                      `Status changed to ${getStatusLabel(e.target.value as SupportTicketStatus)}`
                    )
                  }
                  className="rounded-xl border border-border bg-surface-deep px-2.5 py-1.5 text-xs font-bold text-foreground outline-none focus:border-accent"
                >
                  {SUPPORT_TICKET_STATUSES.map((s) => (
                    <option key={s.id} value={s.id}>
                      Status: {s.label}
                    </option>
                  ))}
                </select>
              )}

              {canChangeStatus && selectedTicket.status !== 'closed' && (
                <button
                  type="button"
                  onClick={() =>
                    void handleUpdatePatch(selectedTicket.id, { status: 'closed' }, 'Ticket closed')
                  }
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-500/40 bg-slate-500/15 px-3 py-1.5 text-xs font-bold text-foreground hover:bg-slate-500/25 cursor-pointer"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Close</span>
                </button>
              )}

              {canChangeStatus && (selectedTicket.status === 'closed' || selectedTicket.status === 'resolved') && (
                <button
                  type="button"
                  onClick={() =>
                    void handleUpdatePatch(selectedTicket.id, { status: 'open' }, 'Ticket reopened')
                  }
                  className="inline-flex items-center gap-1 rounded-xl border border-sky-500/40 bg-sky-500/15 px-3 py-1.5 text-xs font-bold text-sky-300 hover:bg-sky-500/25 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reopen</span>
                </button>
              )}

              {canDeleteTickets && (
                <button
                  type="button"
                  onClick={() => setPendingDeleteTicket(selectedTicket)}
                  className="inline-flex items-center gap-1 rounded-xl border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 text-xs font-bold text-rose-300 hover:bg-rose-500/25 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
              )}
            </div>
          </div>

          <TicketChatThread
            ticketId={selectedTicket.id}
            viewerRole={isAdmin ? 'admin' : 'staff'}
            loadBundle={openStaffTicketBundle}
            onSendMessage={async (tId, input) => {
              const res = await replyAsStaff(tId, input);
              setSelectedHistory(res.history || []);
              return res;
            }}
            canReply={canReply}
            canAddInternalNotes={canAddInternalNotes}
          />

          {/* Ticket History */}
          {selectedHistory.length > 0 && (
            <div className="rounded-2xl border border-border bg-surface-deep p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-muted-foreground">
                <History className="w-4 h-4 text-accent" />
                <span>Ticket Audit History ({selectedHistory.length})</span>
              </div>
              <div className="space-y-1.5 max-h-44 overflow-y-auto text-xs">
                {selectedHistory.map((h) => (
                  <div
                    key={h.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface px-3 py-1.5 border border-border/60"
                  >
                    <span>
                      <strong className="text-foreground">{h.action}:</strong>{' '}
                      <span className="text-muted-foreground">{h.details}</span>
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {formatISTDateTime(h.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Notifications View */}
      {subView === 'notifications' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black uppercase tracking-wider text-foreground">
              Staff &amp; Admin Ticket Alerts ({unreadStaffNotificationsCount} Unread)
            </h4>
            {unreadStaffNotificationsCount > 0 && (
              <button
                type="button"
                onClick={() => void markStaffNotificationsRead()}
                className="inline-flex items-center gap-1 text-xs font-bold text-accent hover:underline cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Mark all read</span>
              </button>
            )}
          </div>
          {staffNotifications.length === 0 ? (
            <div className="rounded-2xl border border-border bg-surface-deep p-8 text-center text-xs text-muted-foreground">
              No staff ticket alerts yet.
            </div>
          ) : (
            staffNotifications.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  void markStaffNotificationsRead([n.id]);
                  setSubView('tickets');
                  const target = staffTickets.find((t) => t.id === n.ticketId);
                  if (target) void handleOpenTicket(target);
                }}
                className={`w-full text-left rounded-2xl border p-3.5 cursor-pointer transition-colors ${
                  n.read
                    ? 'border-border bg-surface-deep/50 text-muted-foreground'
                    : 'border-accent/50 bg-accent/10 text-foreground'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-black text-foreground flex items-center gap-2">
                    {!n.read && <span className="h-2 w-2 rounded-full bg-rose-500" />}
                    {n.title}
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {formatISTDateTime(n.createdAt)}
                  </span>
                </div>
                <p className="text-xs">{n.body}</p>
              </button>
            ))
          )}
        </div>
      )}

      {/* Staff & Permissions View (Admin Only) */}
      {subView === 'staff' && isAdmin && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-black text-foreground">Authorized Support Staff &amp; Permissions</h4>
              <p className="text-xs text-muted-foreground">
                Staff members authenticate in the Admin / Staff Portal using their passkey and see only permitted tickets and actions.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setEditingStaff({
                  name: '',
                  roleTitle: 'Moderator',
                  passkey: '',
                  active: true,
                  canViewAllTickets: false,
                  canReply: true,
                  canAssign: false,
                  canChangeStatus: true,
                  canAddInternalNotes: true,
                  canDeleteTickets: false,
                })
              }
              className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2 text-xs font-black uppercase text-accent-foreground cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Add Staff Member</span>
            </button>
          </div>

          {editingStaff && (
            <form
              onSubmit={handleSaveStaffForm}
              className="rounded-2xl border border-accent/40 bg-surface-deep p-4 space-y-3"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-foreground mb-1">Staff Name *</label>
                  <input
                    type="text"
                    required
                    value={editingStaff.name || ''}
                    onChange={(e) => setEditingStaff((p) => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Moderator Sam"
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-foreground outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-foreground mb-1">Staff Role Badge *</label>
                  <input
                    type="text"
                    required
                    value={editingStaff.roleTitle || ''}
                    onChange={(e) => setEditingStaff((p) => ({ ...p, roleTitle: e.target.value }))}
                    placeholder="e.g. Senior Moderator"
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-foreground outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-foreground mb-1">Portal Passkey</label>
                  <input
                    type="text"
                    value={editingStaff.passkey || ''}
                    onChange={(e) => setEditingStaff((p) => ({ ...p, passkey: e.target.value }))}
                    placeholder="Leave blank to keep/auto-generate"
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs font-mono text-foreground outline-none focus:border-accent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                {[
                  { key: 'active', label: 'Active Account' },
                  { key: 'canViewAllTickets', label: 'View All Tickets (vs Assigned Only)' },
                  { key: 'canReply', label: 'Reply to Users' },
                  { key: 'canChangeStatus', label: 'Change Status' },
                  { key: 'canAddInternalNotes', label: 'Add Internal Staff Notes' },
                  { key: 'canAssign', label: 'Assign Tickets' },
                  { key: 'canDeleteTickets', label: 'Delete Tickets' },
                ].map((opt) => (
                  <label key={opt.key} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean((editingStaff as any)[opt.key])}
                      onChange={(e) =>
                        setEditingStaff((p) => ({ ...p, [opt.key]: e.target.checked }))
                      }
                      className="rounded border-border"
                    />
                    <span className="text-foreground font-medium">{opt.label}</span>
                  </label>
                ))}
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingStaff(null)}
                  className="rounded-xl border border-border bg-surface px-3.5 py-1.5 text-xs font-bold text-muted-foreground cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-accent px-4 py-1.5 text-xs font-black uppercase text-accent-foreground cursor-pointer"
                >
                  Save Permissions
                </button>
              </div>
            </form>
          )}

          <div className="space-y-2.5">
            {staffMembers.map((member) => (
              <div
                key={member.id}
                className="rounded-2xl border border-border bg-surface-deep p-4 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-black text-foreground">{member.name}</span>
                    <span className="rounded-full bg-accent/15 text-accent border border-accent/30 px-2 py-0.5 text-[10px] font-bold">
                      {member.roleTitle}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        member.active
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-rose-500/20 text-rose-300'
                      }`}
                    >
                      {member.active ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
                    <span>{member.canViewAllTickets ? 'All Tickets' : 'Assigned Only'}</span>
                    <span>•</span>
                    {member.canReply && <span>Reply</span>}
                    {member.canChangeStatus && <span>• Status</span>}
                    {member.canAddInternalNotes && <span>• Internal Notes</span>}
                    {member.canAssign && <span>• Assign</span>}
                    {member.canDeleteTickets && <span>• Delete</span>}
                  </div>
                  {member.passkey && (
                    <div className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground">
                      <span>Passkey:</span>
                      <span>{showPasskeys[member.id] ? member.passkey : '••••••••'}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setShowPasskeys((prev) => ({ ...prev, [member.id]: !prev[member.id] }))
                        }
                        className="text-accent cursor-pointer"
                      >
                        {showPasskeys[member.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingStaff(member)}
                    className="rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-bold text-foreground hover:border-accent cursor-pointer"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteStaffMember(member.id)}
                    className="p-2 rounded-xl border border-border bg-surface text-muted-foreground hover:text-rose-400 cursor-pointer"
                    title="Remove Staff Member"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Backend-Only Discord Support Webhook Configuration (Admin Only) */}
      {subView === 'discord' && isAdmin && (
        <form
          onSubmit={handleSaveDiscordBackend}
          className="rounded-2xl border border-indigo-500/30 bg-surface-deep p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
            <div>
              <h4 className="text-sm font-black uppercase tracking-wider text-foreground flex items-center gap-2">
                <Bot className="w-4 h-4 text-indigo-400" />
                <span>Backend Discord Support Webhook</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    discordConfig?.hasWebhook
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-surface text-muted-foreground border border-border'
                  }`}
                >
                  {discordConfig?.hasWebhook ? 'Configured (Secret Protected)' : 'Not Configured'}
                </span>
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Webhook URLs are stored strictly on the backend server and never exposed to browser client code.
              </p>
            </div>
            <label className="flex items-center gap-2 text-xs font-bold text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={discordEnabled}
                onChange={(e) => setDiscordEnabled(e.target.checked)}
              />
              <span>Enable Support Alerts</span>
            </label>
          </div>

          {discordConfig?.hasWebhook && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-xs text-emerald-200 font-mono">
              Saved Webhook: {discordConfig.webhookPreview}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-foreground mb-1">
              Set / Replace Discord Webhook URL (Write-Only)
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="url"
                value={discordUrlInput}
                onChange={(e) => setDiscordUrlInput(e.target.value)}
                placeholder={
                  discordConfig?.hasWebhook
                    ? 'Leave blank to keep existing backend webhook, or paste new URL...'
                    : 'https://discord.com/api/webhooks/...'
                }
                className="flex-1 rounded-xl border border-border bg-surface px-3.5 py-2 text-xs font-mono text-foreground outline-none focus:border-indigo-400"
              />
              <button
                type="button"
                onClick={() => void handleTestDiscordBackend()}
                disabled={testingDiscord || (!discordUrlInput.trim() && !discordConfig?.hasWebhook)}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-4 py-2 text-xs font-bold text-indigo-300 hover:bg-indigo-500/20 disabled:opacity-50 cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>{testingDiscord ? 'Sending...' : 'Send Test'}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-foreground mb-1">Bot Name</label>
              <input
                type="text"
                value={discordBotName}
                onChange={(e) => setDiscordBotName(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-foreground outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-foreground mb-1">Role Ping</label>
              <input
                type="text"
                value={discordPingRole}
                onChange={(e) => setDiscordPingRole(e.target.value)}
                placeholder="@here or <@&ROLE_ID>"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-foreground outline-none"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-xs">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={discordNotifyNew}
                onChange={(e) => setDiscordNotifyNew(e.target.checked)}
              />
              <span>Notify on New Ticket Created</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={discordNotifyUpdate}
                onChange={(e) => setDiscordNotifyUpdate(e.target.checked)}
              />
              <span>Notify on Assignments &amp; Status Updates</span>
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="submit"
              disabled={savingDiscord}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-black uppercase text-white hover:bg-indigo-500 cursor-pointer disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{savingDiscord ? 'Saving...' : 'Save Backend Config'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Ratings Summary View */}
      {subView === 'ratings' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-center justify-between">
            <div>
              <h4 className="text-sm font-black text-foreground">Customer Support Ratings</h4>
              <p className="text-xs text-muted-foreground">
                Verified 1–5 star ratings submitted after tickets are marked Resolved.
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-black text-amber-400 font-display">
                {avgStars ? `${avgStars} ★` : '—'}
              </div>
              <span className="text-[11px] text-muted-foreground">{ratings.length} total reviews</span>
            </div>
          </div>

          {ratings.length === 0 ? (
            <div className="rounded-2xl border border-border bg-surface-deep p-8 text-center text-xs text-muted-foreground">
              No ticket ratings submitted yet.
            </div>
          ) : (
            <div className="space-y-2.5">
              {ratings.map((r) => (
                <div
                  key={r.id}
                  className="rounded-2xl border border-border bg-surface-deep p-4 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-black text-accent">{r.ticketNumber}</span>
                      <span className="text-xs font-bold text-foreground">{r.username}</span>
                      <span className="inline-flex items-center gap-0.5 text-amber-400">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={`w-3.5 h-3.5 ${
                              i < r.stars ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'
                            }`}
                          />
                        ))}
                      </span>
                    </div>
                    {r.feedback && <p className="text-xs text-muted-foreground">"{r.feedback}"</p>}
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {formatISTDateTime(r.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {pendingDeleteTicket && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md rounded-2xl border border-rose-500/40 bg-surface p-5 space-y-4 shadow-2xl">
            <h4 className="text-base font-black text-foreground">
              Delete Ticket {pendingDeleteTicket.ticketNumber}?
            </h4>
            <p className="text-xs text-muted-foreground">
              This will permanently remove the ticket, conversation messages, attachments, and history from the central database.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDeleteTicket(null)}
                className="inline-flex items-center gap-1 rounded-xl border border-border bg-surface-deep px-4 py-2 text-xs font-bold text-foreground cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmDelete()}
                className="inline-flex items-center gap-1 rounded-xl bg-rose-600 px-4 py-2 text-xs font-black uppercase text-white hover:bg-rose-500 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Delete Permanently</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const StatCard: React.FC<{
  label: string;
  value: number;
  tone: 'default' | 'sky' | 'indigo' | 'amber' | 'emerald' | 'slate';
  icon: React.ReactNode;
}> = ({ label, value, tone, icon }) => {
  const toneMap = {
    default: 'border-border bg-surface-deep text-foreground',
    sky: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
    indigo: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300',
    amber: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    slate: 'border-slate-500/30 bg-slate-500/10 text-slate-300',
  };
  return (
    <div className={`rounded-xl border p-3 flex flex-col justify-between ${toneMap[tone]}`}>
      <div className="flex items-center justify-between gap-1 text-[10px] font-black uppercase tracking-wider mb-1">
        <span className="truncate">{label}</span>
        {icon}
      </div>
      <span className="text-xl font-black font-display">{value}</span>
    </div>
  );
};
