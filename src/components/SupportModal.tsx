import React, { useState, useEffect } from 'react';
import { useStoreConfig } from '../context/StoreConfigContext';
import { useToast } from '../context/ToastContext';
import { useTickets } from '../context/TicketContext';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { SupportTicketPriority } from '../types';
import {
  SUPPORT_TICKET_CATEGORIES,
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_STATUSES,
  getStatusLabel,
  getPriorityLabel,
  validateAttachmentFileMeta,
} from '../utils/supportTicketHelpers';
import {
  AttachmentUploadPayload,
  readFileAsAttachmentPayload,
} from '../services/supportService';
import { TicketChatThread } from './support/TicketChatThread';
import { formatISTDateTime } from '../utils/dateUtils';
import {
  X,
  HeartHandshake,
  Send,
  MessageSquare,
  HelpCircle,
  Plus,
  Bell,
  Paperclip,
  Image as ImageIcon,
  ArrowLeft,
  Clock,
  CheckCheck,
  Loader2,
  Lock,
} from 'lucide-react';

interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRequireLogin?: () => void;
}

export const SupportModal: React.FC<SupportModalProps> = ({ isOpen, onClose, onRequireLogin }) => {
  const { config } = useStoreConfig();
  const { success, error } = useToast();
  const {
    userTickets,
    userNotifications,
    unreadUserNotificationsCount,
    isLoadingUserTickets,
    createTicket,
    openUserTicketBundle,
    replyAsUser,
    submitTicketRating,
    markUserNotificationsRead,
  } = useTickets();
  const { user } = useAuth();
  const { username: cartIgn } = useCart();

  const [viewMode, setViewMode] = useState<'my_tickets' | 'create' | 'notifications' | 'faq'>('my_tickets');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  // Ticket creation form state
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<string>(SUPPORT_TICKET_CATEGORIES[0]);
  const [priority, setPriority] = useState<SupportTicketPriority>('normal');
  const [ign, setIgn] = useState(cartIgn || '');
  const [description, setDescription] = useState('');
  const [attachments, setAttachments] = useState<AttachmentUploadPayload[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && cartIgn && !ign) {
      setIgn(cartIgn);
    }
  }, [isOpen, cartIgn]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleAttachFiles = async (files: FileList | null) => {
    if (!files) return;
    const added: AttachmentUploadPayload[] = [];
    for (const file of Array.from(files)) {
      if (attachments.length + added.length >= 4) {
        error('Maximum 4 attachments allowed per ticket.');
        break;
      }
      const errMsg = validateAttachmentFileMeta({
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
      });
      if (errMsg) {
        error(errMsg);
        continue;
      }
      try {
        added.push(await readFileAsAttachmentPayload(file));
      } catch (err: any) {
        error(err?.message || 'Failed to read attachment');
      }
    }
    if (added.length > 0) setAttachments((prev) => [...prev, ...added]);
  };

  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      onRequireLogin?.();
      return;
    }

    setSubmitting(true);
    try {
      const created = await createTicket({
        subject: subject.trim(),
        category,
        priority,
        description: description.trim(),
        ign: ign.trim() || undefined,
        attachments,
      });
      success(`Ticket ${created.ticketNumber} created! Staff has been notified.`);
      setSubject('');
      setDescription('');
      setAttachments([]);
      setPriority('normal');
      setSelectedTicketId(created.id);
      setViewMode('my_tickets');
    } catch (err: any) {
      error(err?.message || 'Failed to create support ticket.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      <div className="relative z-10 w-full max-w-3xl max-h-[92vh] flex flex-col rounded-3xl border border-border bg-surface shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-deep px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/15 text-accent border border-accent/30">
              <HeartHandshake className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black tracking-tight text-foreground font-display">
                {config.brand} Support Center
              </h2>
              <p className="text-xs text-muted-foreground">
                Real-time player support tickets, live staff chat &amp; updates
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {user && (
              <button
                type="button"
                onClick={() => {
                  setSelectedTicketId(null);
                  setViewMode('create');
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2 text-xs font-black uppercase tracking-wider text-accent-foreground hover:opacity-90 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create New Ticket</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border bg-surface p-2 text-muted-foreground hover:text-foreground cursor-pointer"
              aria-label="Close Support Center"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sub Navigation */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-deep/50 px-4 py-2.5">
          <button
            type="button"
            onClick={() => {
              setSelectedTicketId(null);
              setViewMode('my_tickets');
            }}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black uppercase cursor-pointer transition-colors ${
              viewMode === 'my_tickets'
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-surface'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>My Tickets ({userTickets.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedTicketId(null);
              setViewMode('create');
            }}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black uppercase cursor-pointer transition-colors ${
              viewMode === 'create'
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-surface'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Ticket</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedTicketId(null);
              setViewMode('notifications');
            }}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black uppercase cursor-pointer transition-colors ${
              viewMode === 'notifications'
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-surface'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            <span>Notifications</span>
            {unreadUserNotificationsCount > 0 && (
              <span className="rounded-full bg-rose-500 px-1.5 py-0.2 text-[10px] font-black text-white">
                {unreadUserNotificationsCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedTicketId(null);
              setViewMode('faq');
            }}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black uppercase cursor-pointer transition-colors ${
              viewMode === 'faq'
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-surface'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>FAQs</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {viewMode === 'faq' ? (
            <div className="space-y-3 text-xs">
              <div className="rounded-2xl border border-border bg-surface-deep p-4">
                <h4 className="font-black text-foreground mb-1">How fast are purchases delivered?</h4>
                <p className="text-muted-foreground leading-relaxed">
                  Most purchases activate within 5–15 minutes after submitting your UTR reference code. Open a <strong>Payment &amp; Billing</strong> ticket if you need urgent verification.
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-surface-deep p-4">
                <h4 className="font-black text-foreground mb-1">How do I track staff replies?</h4>
                <p className="text-muted-foreground leading-relaxed">
                  Your Support Center and User Dashboard update in real time when a staff member replies or updates your ticket status.
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-surface-deep p-4">
                <h4 className="font-black text-foreground mb-1">Which Minecraft versions are supported?</h4>
                <p className="text-muted-foreground leading-relaxed">
                  {config.serverIp} supports Java &amp; Bedrock players (Port {config.bedrockPort || '19132'}).
                </p>
              </div>
            </div>
          ) : !user ? (
            <div className="rounded-2xl border border-border bg-surface-deep p-8 text-center space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent border border-accent/30">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="text-base font-black text-foreground">Login Required for Support</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Sign in with your account to create tickets, attach screenshots, chat live with staff, and view your ticket history.
              </p>
              {onRequireLogin && (
                <button
                  type="button"
                  onClick={onRequireLogin}
                  className="rounded-xl bg-accent px-5 py-2.5 text-xs font-black uppercase text-accent-foreground cursor-pointer"
                >
                  Log In / Register
                </button>
              )}
            </div>
          ) : viewMode === 'create' ? (
            <form onSubmit={handleSubmitTicket} className="space-y-4">
              <div className="rounded-2xl border border-border bg-surface-deep p-4 space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-foreground mb-1">
                    Ticket Subject <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    minLength={3}
                    maxLength={160}
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Brief summary of your issue..."
                    className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-xs text-foreground outline-none focus:border-accent"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-foreground mb-1">
                      Ticket Category <span className="text-rose-400">*</span>
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-xs text-foreground outline-none focus:border-accent"
                    >
                      {SUPPORT_TICKET_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-foreground mb-1">
                      Priority <span className="text-rose-400">*</span>
                    </label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as SupportTicketPriority)}
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-xs text-foreground outline-none focus:border-accent"
                    >
                      {SUPPORT_TICKET_PRIORITIES.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-foreground mb-1">
                      Minecraft IGN (Optional)
                    </label>
                    <input
                      type="text"
                      value={ign}
                      onChange={(e) => setIgn(e.target.value)}
                      placeholder="e.g. Steve123"
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-xs text-foreground outline-none focus:border-accent"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-foreground mb-1">
                    Detailed Description <span className="text-rose-400">*</span>
                  </label>
                  <textarea
                    required
                    minLength={5}
                    maxLength={5000}
                    rows={4}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe your issue in detail (include order ID, UTR, server mode, timestamps, or steps to reproduce)..."
                    className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-xs text-foreground outline-none focus:border-accent resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-foreground mb-1.5">
                    Optional Image / File Attachments (Max 4 files, 5MB each)
                  </label>
                  <label className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border hover:border-accent bg-surface p-4 text-center cursor-pointer transition-colors">
                    <Paperclip className="w-5 h-5 text-accent mb-1" />
                    <span className="text-xs font-bold text-foreground">
                      Click to upload screenshots or files
                    </span>
                    <span className="text-[10px] text-muted-foreground mt-0.5">
                      PNG, JPG, WEBP, PDF, TXT supported
                    </span>
                    <input
                      type="file"
                      multiple
                      accept="image/*,.pdf,.txt"
                      onChange={(e) => {
                        void handleAttachFiles(e.target.files);
                        e.target.value = '';
                      }}
                      className="hidden"
                    />
                  </label>

                  {attachments.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {attachments.map((att, idx) => (
                        <div
                          key={`${att.fileName}-${idx}`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs text-foreground"
                        >
                          <ImageIcon className="w-3.5 h-3.5 text-accent" />
                          <span className="max-w-[160px] truncate">{att.fileName}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setAttachments((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="text-muted-foreground hover:text-rose-400 cursor-pointer"
                            aria-label="Remove attachment"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] text-muted-foreground">
                  Creating as <strong className="text-foreground">{user.displayName || user.email}</strong> ({user.email})
                </span>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-xs font-black uppercase tracking-wider text-accent-foreground hover:opacity-90 disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  <span>{submitting ? 'Submitting...' : 'Submit Ticket'}</span>
                </button>
              </div>
            </form>
          ) : viewMode === 'notifications' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-wider text-foreground">
                  Support Notifications ({unreadUserNotificationsCount} Unread)
                </h3>
                {unreadUserNotificationsCount > 0 && (
                  <button
                    type="button"
                    onClick={() => void markUserNotificationsRead()}
                    className="inline-flex items-center gap-1 text-xs font-bold text-accent hover:underline cursor-pointer"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    <span>Mark all read</span>
                  </button>
                )}
              </div>

              {userNotifications.length === 0 ? (
                <div className="rounded-2xl border border-border bg-surface-deep p-8 text-center text-xs text-muted-foreground">
                  No support notifications yet.
                </div>
              ) : (
                userNotifications.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => {
                      void markUserNotificationsRead([n.id]);
                      setSelectedTicketId(n.ticketId);
                      setViewMode('my_tickets');
                    }}
                    className={`w-full text-left rounded-2xl border p-3.5 transition-colors cursor-pointer ${
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
          ) : selectedTicketId ? (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setSelectedTicketId(null)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface-deep px-3 py-1.5 text-xs font-bold text-foreground hover:border-accent cursor-pointer"
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
          ) : isLoadingUserTickets ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              Loading your tickets...
            </div>
          ) : userTickets.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-surface-deep p-8 text-center space-y-3">
              <MessageSquare className="w-10 h-10 text-accent/50 mx-auto" />
              <h3 className="text-sm font-black text-foreground">No Support Tickets Yet</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Have a billing question, in-game bug report, or technical issue? Click "Create New Ticket" to start chatting with our staff.
              </p>
              <button
                type="button"
                onClick={() => setViewMode('create')}
                className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-black uppercase text-accent-foreground cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create New Ticket</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {userTickets.map((t) => {
                const statusMeta = SUPPORT_TICKET_STATUSES.find((s) => s.id === t.status);
                const priorityMeta = SUPPORT_TICKET_PRIORITIES.find((p) => p.id === t.priority);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTicketId(t.id)}
                    className="w-full text-left rounded-2xl border border-border bg-surface-deep p-4 hover:border-accent transition-all cursor-pointer space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-black px-2 py-0.5 rounded bg-accent/15 text-accent border border-accent/30">
                          {t.ticketNumber}
                        </span>
                        <span className="text-sm font-black text-foreground">{t.subject}</span>
                        {(t.unreadByUser || 0) > 0 && (
                          <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-black text-white">
                            {t.unreadByUser} New Reply
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${priorityMeta?.badgeClass || ''}`}>
                          {getPriorityLabel(t.priority)}
                        </span>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${statusMeta?.badgeClass || ''}`}>
                          {getStatusLabel(t.status)}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span>Category: <strong className="text-foreground">{t.category}</strong></span>
                      <span className="flex items-center gap-1 font-mono">
                        <Clock className="w-3 h-3" />
                        {formatISTDateTime(t.updatedAt || t.createdAt)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
