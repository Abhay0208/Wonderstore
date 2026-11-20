import React, { useState, useEffect } from 'react';
import {
  X,
  ShoppingBag,
  MessageSquare,
  Clock,
  CheckCircle2,
  AlertCircle,
  Package,
  Search,
  LogOut,
  ArrowLeft,
  Bell,
  Plus,
  CheckCheck,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useTickets } from '../context/TicketContext';
import { useWallet } from '../context/WalletContext';
import { Order } from '../types';
import { formatISTDateTime } from '../utils/dateUtils';
import { formatINR } from '../config/storeDefaults';
import { UserWalletTab } from './wallet/UserWalletTab';
import {
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_STATUSES,
  getPriorityLabel,
  getStatusLabel,
} from '../utils/supportTicketHelpers';
import { TicketChatThread } from './support/TicketChatThread';

export type AccountModalTab = 'orders' | 'wallet' | 'tickets' | 'notifications';

interface UserAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: Order[];
  onOpenSupportCenter?: () => void;
  initialTab?: AccountModalTab;
}

export const UserAccountModal: React.FC<UserAccountModalProps> = ({
  isOpen,
  onClose,
  orders,
  onOpenSupportCenter,
  initialTab = 'orders',
}) => {
  const { user, logout } = useAuth();
  const { username: currentIgn } = useCart();
  const { wallet } = useWallet();
  const {
    userTickets,
    userNotifications,
    unreadUserNotificationsCount,
    openUserTicketBundle,
    replyAsUser,
    submitTicketRating,
    markUserNotificationsRead,
  } = useTickets();

  const [activeTab, setActiveTab] = useState<AccountModalTab>(initialTab);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    } else {
      setSelectedTicketId(null);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !user) return null;

  const userOrders = orders.filter((o) => {
    const isUidMatch = o.userId === user.uid;
    const isEmailMatch = user.email && o.userId?.toLowerCase() === user.email.toLowerCase();
    const isIgnMatch = currentIgn && o.ign?.toLowerCase() === currentIgn.toLowerCase();
    return isUidMatch || isEmailMatch || isIgnMatch;
  });

  const filteredOrders = userOrders.filter((order) => {
    if (statusFilter === 'pending' && order.status !== 'pending') return false;
    if (statusFilter === 'completed' && order.status !== 'completed') return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchNumber =
        order.orderNumber?.toLowerCase().includes(q) || order.id.toLowerCase().includes(q);
      const matchIgn = order.ign?.toLowerCase().includes(q);
      const matchUtr = order.utr?.toLowerCase().includes(q);
      const matchItem = order.items.some((i) => i.name.toLowerCase().includes(q));
      return matchNumber || matchIgn || matchUtr || matchItem;
    }
    return true;
  });

  const pendingOrdersCount = userOrders.filter((o) => o.status === 'pending').length;
  const completedOrdersCount = userOrders.filter((o) => o.status === 'completed').length;
  const unreadTicketRepliesCount = userTickets.reduce((acc, t) => acc + (t.unreadByUser || 0), 0);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      <div
        data-testid="user-account-modal"
        className="relative z-10 w-full max-w-4xl h-[88vh] sm:h-[85vh] max-h-[92vh] flex flex-col rounded-3xl border-2 border-sky-500/30 bg-[#071326] shadow-2xl shadow-sky-950/80 text-foreground font-sans overflow-hidden"
      >
        {/* Header */}
        <div className="shrink-0 flex flex-wrap items-center justify-between p-4 sm:p-6 border-b border-sky-500/20 bg-surface-deep/80 backdrop-blur-md gap-3 sm:gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="relative shrink-0">
              <img
                src={
                  user.photoURL ||
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(
                    user.displayName || user.email || 'User'
                  )}&background=0ea5e9&color=fff`
                }
                alt="Avatar"
                referrerPolicy="no-referrer"
                className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl border-2 border-sky-400/40 object-cover shadow-md"
              />
              <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 bg-emerald-500 rounded-full border-2 border-[#071326]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-xl font-black text-foreground truncate">
                  {user.displayName || 'Customer Dashboard'}
                </h2>
                <span className="rounded-full bg-sky-500/20 border border-sky-500/40 px-2.5 py-0.5 text-[10px] font-black text-sky-300 uppercase tracking-wider shrink-0">
                  VERIFIED CUSTOMER
                </span>
              </div>
              <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">{user.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap shrink-0">
            {onOpenSupportCenter && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenSupportCenter();
                }}
                className="px-3 sm:px-3.5 py-2 rounded-xl text-xs font-black uppercase bg-accent text-accent-foreground hover:opacity-90 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Support Center</span>
              </button>
            )}
            <button
              type="button"
              onClick={async () => {
                await logout();
                onClose();
              }}
              className="px-3 sm:px-3.5 py-2 rounded-xl text-xs font-extrabold uppercase text-rose-400 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors cursor-pointer"
              aria-label="Close Account Dashboard"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Fixed Options Navigation Bar */}
        <div
          data-testid="account-options-bar"
          role="tablist"
          aria-label="Account sections"
          className="shrink-0 grid grid-cols-4 gap-1.5 sm:gap-2 p-2 bg-surface-deep/40 border-b border-sky-500/10"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'orders'}
            data-testid="account-tab-orders"
            onClick={() => {
              setSelectedTicketId(null);
              setActiveTab('orders');
            }}
            className={`w-full min-w-0 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 sm:py-3 px-1 sm:px-3 rounded-2xl text-[10px] sm:text-xs font-black uppercase tracking-normal sm:tracking-wider transition-colors cursor-pointer min-h-[52px] sm:min-h-[44px] ${
              activeTab === 'orders'
                ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/25 ring-1 ring-sky-400/40'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
            }`}
          >
            <ShoppingBag className="w-4 h-4 shrink-0" />
            <span className="truncate max-w-full whitespace-nowrap">
              <span className="sm:hidden">Orders ({userOrders.length})</span>
              <span className="hidden sm:inline">My Orders ({userOrders.length})</span>
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'wallet'}
            data-testid="account-tab-wallet"
            onClick={() => {
              setSelectedTicketId(null);
              setActiveTab('wallet');
            }}
            className={`w-full min-w-0 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 sm:py-3 px-1 sm:px-3 rounded-2xl text-[10px] sm:text-xs font-black uppercase tracking-normal sm:tracking-wider transition-colors cursor-pointer min-h-[52px] sm:min-h-[44px] ${
              activeTab === 'wallet'
                ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/25 ring-1 ring-sky-400/40'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
            }`}
          >
            <Wallet className="w-4 h-4 shrink-0" />
            <span className="truncate max-w-full whitespace-nowrap">
              <span className="sm:hidden">Wallet</span>
              <span className="hidden sm:inline">Wallet ({wallet ? `${wallet.balance} Cr` : '0 Cr'})</span>
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'tickets'}
            data-testid="account-tab-tickets"
            onClick={() => setActiveTab('tickets')}
            className={`relative w-full min-w-0 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 sm:py-3 px-1 sm:px-3 rounded-2xl text-[10px] sm:text-xs font-black uppercase tracking-normal sm:tracking-wider transition-colors cursor-pointer min-h-[52px] sm:min-h-[44px] ${
              activeTab === 'tickets'
                ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/25 ring-1 ring-sky-400/40'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
            }`}
          >
            <MessageSquare className="w-4 h-4 shrink-0" />
            <span className="truncate max-w-full whitespace-nowrap">
              <span className="sm:hidden">Tickets ({userTickets.length})</span>
              <span className="hidden sm:inline">My Tickets ({userTickets.length})</span>
            </span>
            {unreadTicketRepliesCount > 0 && (
              <span className="absolute top-1.5 right-1.5 sm:static rounded-full bg-rose-500 px-1.5 py-0.2 text-[10px] font-black text-white shrink-0">
                {unreadTicketRepliesCount}
              </span>
            )}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'notifications'}
            data-testid="account-tab-notifications"
            onClick={() => {
              setSelectedTicketId(null);
              setActiveTab('notifications');
            }}
            className={`relative w-full min-w-0 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 sm:py-3 px-1 sm:px-3 rounded-2xl text-[10px] sm:text-xs font-black uppercase tracking-normal sm:tracking-wider transition-colors cursor-pointer min-h-[52px] sm:min-h-[44px] ${
              activeTab === 'notifications'
                ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/25 ring-1 ring-sky-400/40'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
            }`}
          >
            <Bell className="w-4 h-4 shrink-0" />
            <span className="truncate max-w-full whitespace-nowrap">Alerts</span>
            {unreadUserNotificationsCount > 0 && (
              <span className="absolute top-1.5 right-1.5 sm:static rounded-full bg-rose-500 px-1.5 py-0.2 text-[10px] font-black text-white shrink-0">
                {unreadUserNotificationsCount}
              </span>
            )}
          </button>
        </div>

        {/* Modal Body (Scrollable independently below fixed options bar) */}
        <div
          data-testid="account-modal-body"
          className="flex-1 min-h-0 overflow-y-auto [scrollbar-gutter:stable] p-4 sm:p-6 bg-gaming-background"
        >
          {activeTab === 'wallet' ? (
            <UserWalletTab />
          ) : activeTab === 'orders' ? (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3.5 rounded-2xl border border-sky-500/15 bg-surface-deep/50">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setStatusFilter('all')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase transition-all cursor-pointer ${
                      statusFilter === 'all'
                        ? 'bg-sky-500 text-white shadow-md shadow-sky-500/30'
                        : 'bg-surface text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    All ({userOrders.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('completed')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase transition-all cursor-pointer ${
                      statusFilter === 'completed'
                        ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/30 font-bold'
                        : 'bg-surface text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Delivered ({completedOrdersCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('pending')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase transition-all cursor-pointer ${
                      statusFilter === 'pending'
                        ? 'bg-yellow-400 text-slate-950 shadow-md shadow-yellow-400/30 font-bold'
                        : 'bg-surface text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Pending ({pendingOrdersCount})
                  </button>
                </div>

                <div className="relative flex-1 max-w-xs">
                  <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search order #, item, or IGN..."
                    className="w-full bg-surface border border-sky-500/20 rounded-xl pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-sky-400"
                  />
                </div>
              </div>

              {filteredOrders.length === 0 ? (
                <EmptyState
                  icon={<ShoppingBag className="w-12 h-12" />}
                  title={userOrders.length === 0 ? 'No Orders Found' : 'No Matching Orders'}
                  description={
                    userOrders.length === 0
                      ? 'You have not placed any orders yet. Select a rank, crate key, or coins package from the store to make your first purchase!'
                      : 'No orders match your selected filter criteria.'
                  }
                />
              ) : (
                filteredOrders.map((order) => {
                  const isCompleted = order.status === 'completed';
                  const isFailed = order.status === 'failed' || order.status === 'refunded';
                  return (
                    <div
                      key={order.id}
                      className="rounded-2xl border border-sky-500/20 bg-surface-deep/60 p-4 sm:p-5 space-y-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sky-500/10 pb-3">
                        <div className="flex items-center gap-3">
                          <div
                            className={`p-2.5 rounded-xl border ${
                              isCompleted
                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                                : isFailed
                                ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                                : 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40'
                            }`}
                          >
                            <Package className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-black text-foreground font-mono">
                                #{order.orderNumber || order.id}
                              </span>
                              <span
                                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10.5px] font-black uppercase tracking-wider ${
                                  isCompleted
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
                                    : isFailed
                                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50'
                                    : 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/50'
                                }`}
                              >
                                {isCompleted ? (
                                  <>
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>Delivered</span>
                                  </>
                                ) : isFailed ? (
                                  <>
                                    <AlertCircle className="w-3.5 h-3.5" />
                                    <span>Cancelled</span>
                                  </>
                                ) : (
                                  <>
                                    <Clock className="w-3.5 h-3.5" />
                                    <span>Pending Review</span>
                                  </>
                                )}
                              </span>
                            </div>
                            <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                              <Clock className="w-3 h-3 text-sky-400" />
                              <span>{formatISTDateTime(order.createdAt)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-lg font-black text-gold font-display">
                            {formatINR(order.totalAmount)}
                          </div>
                          <div className="text-[10px] font-extrabold text-muted-foreground uppercase font-mono">
                            {order.paymentMethod || 'UPI Payment'}
                          </div>
                          {(order.walletUsed || 0) > 0 && (
                            <div className="text-[10px] font-mono text-amber-300 mt-0.5">
                              Wallet {formatINR(order.walletUsed || 0)}
                              {(order.onlinePaid || 0) > 0 ? ` + Online ${formatINR(order.onlinePaid || 0)}` : ''}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {order.items.map((item, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-2.5 rounded-xl bg-surface border border-sky-500/10"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-mono text-xs font-black text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-md">
                                {item.qty}x
                              </span>
                              <span className="text-xs font-bold text-foreground truncate">
                                {item.name}
                              </span>
                            </div>
                            <span className="text-xs font-mono font-bold text-muted-foreground">
                              {formatINR(item.price * item.qty)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : activeTab === 'notifications' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-wider text-foreground">
                  Support Notifications ({unreadUserNotificationsCount} Unread)
                </h3>
                {unreadUserNotificationsCount > 0 && (
                  <button
                    type="button"
                    onClick={() => void markUserNotificationsRead()}
                    className="inline-flex items-center gap-1 text-xs font-bold text-sky-400 hover:underline cursor-pointer"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    <span>Mark all read</span>
                  </button>
                )}
              </div>

              {userNotifications.length === 0 ? (
                <EmptyState
                  icon={<Bell className="w-12 h-12" />}
                  title="No Notifications Yet"
                  description="You'll receive alerts here whenever staff replies to or updates one of your support tickets."
                />
              ) : (
                userNotifications.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => {
                      void markUserNotificationsRead([n.id]);
                      setSelectedTicketId(n.ticketId);
                      setActiveTab('tickets');
                    }}
                    className={`w-full text-left rounded-2xl border p-4 transition-colors cursor-pointer ${
                      n.read
                        ? 'border-sky-500/15 bg-surface-deep/50 text-muted-foreground'
                        : 'border-sky-400/50 bg-sky-500/10 text-foreground'
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
          ) : selectedTicketId ? (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setSelectedTicketId(null)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-sky-500/30 bg-surface-deep px-3 py-1.5 text-xs font-bold text-foreground hover:border-sky-400 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to My Tickets</span>
              </button>

              <TicketChatThread
                ticketId={selectedTicketId}
                viewerRole="user"
                viewerUserId={user.uid}
                loadBundle={openUserTicketBundle}
                onSendMessage={replyAsUser}
                onSubmitRating={async (tId, stars, feedback) => {
                  await submitTicketRating(tId, stars, feedback);
                }}
              />
            </div>
          ) : (
            <div className="space-y-4">
              {onOpenSupportCenter && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenSupportCenter();
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-black uppercase text-accent-foreground hover:opacity-90 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create New Ticket</span>
                  </button>
                </div>
              )}

              {userTickets.length === 0 ? (
                <EmptyState
                  icon={<MessageSquare className="w-12 h-12" />}
                  title="No Support Tickets Yet"
                  description="Need help with a rank delivery, billing, or account issue? Open the Support Center to create a ticket."
                />
              ) : (
                userTickets.map((ticket) => {
                  const statusMeta = SUPPORT_TICKET_STATUSES.find((s) => s.id === ticket.status);
                  const priorityMeta = SUPPORT_TICKET_PRIORITIES.find((p) => p.id === ticket.priority);
                  return (
                    <button
                      key={ticket.id}
                      type="button"
                      onClick={() => setSelectedTicketId(ticket.id)}
                      className="w-full text-left rounded-2xl border border-sky-500/20 bg-surface-deep/60 p-4 sm:p-5 transition-all hover:border-sky-500/40 hover:bg-surface-deep/80 shadow-md space-y-2.5 cursor-pointer"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-black px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30">
                            {ticket.ticketNumber}
                          </span>
                          <span className="text-sm font-black text-foreground">
                            {ticket.subject}
                          </span>
                          {(ticket.unreadByUser || 0) > 0 && (
                            <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-black text-white">
                              {ticket.unreadByUser} New
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${priorityMeta?.badgeClass || ''}`}>
                            {getPriorityLabel(ticket.priority)}
                          </span>
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${statusMeta?.badgeClass || ''}`}>
                            {getStatusLabel(ticket.status)}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span>
                          Category: <strong className="text-foreground">{ticket.category}</strong>
                          {ticket.assignedStaffName ? ` · Staff: ${ticket.assignedStaffName}` : ''}
                        </span>
                        <span className="flex items-center gap-1 font-mono">
                          <Clock className="w-3 h-3 text-sky-400" />
                          {formatISTDateTime(ticket.updatedAt || ticket.createdAt)}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const EmptyState = ({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) => (
  <div className="flex flex-col items-center justify-center py-14 px-4 text-center">
    <div className="mb-4 p-5 rounded-3xl bg-sky-500/10 text-sky-400 border border-sky-500/20 shadow-inner">
      {icon}
    </div>
    <h3 className="text-base sm:text-lg font-black text-foreground mb-1.5">{title}</h3>
    <p className="text-xs sm:text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
      {description}
    </p>
  </div>
);
