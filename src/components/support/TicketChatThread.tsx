import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Send,
  Paperclip,
  X,
  Lock,
  ShieldCheck,
  User as UserIcon,
  Star,
  Loader2,
  AlertCircle,
  Download,
  Image as ImageIcon,
  FileText,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import {
  SupportTicketDetailBundle,
  SupportAttachment,
  SupportTicketStatus,
} from '../../types';
import {
  AttachmentUploadPayload,
  readFileAsAttachmentPayload,
} from '../../services/supportService';
import {
  getPriorityLabel,
  getStatusLabel,
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_STATUSES,
  validateAttachmentFileMeta,
} from '../../utils/supportTicketHelpers';
import { formatISTDateTime } from '../../utils/dateUtils';
import { useToast } from '../../context/ToastContext';

interface TicketChatThreadProps {
  ticketId: string;
  viewerRole: 'user' | 'staff' | 'admin';
  viewerUserId?: string;
  loadBundle: (ticketId: string) => Promise<SupportTicketDetailBundle>;
  onSendMessage: (
    ticketId: string,
    input: {
      message: string;
      isInternal?: boolean;
      attachments?: AttachmentUploadPayload[];
      nextStatus?: SupportTicketStatus;
    }
  ) => Promise<SupportTicketDetailBundle>;
  onSubmitRating?: (ticketId: string, stars: number, feedback?: string) => Promise<void>;
  canReply?: boolean;
  canAddInternalNotes?: boolean;
}

export const TicketChatThread: React.FC<TicketChatThreadProps> = ({
  ticketId,
  viewerRole,
  viewerUserId,
  loadBundle,
  onSendMessage,
  onSubmitRating,
  canReply = true,
  canAddInternalNotes = false,
}) => {
  const { success, error } = useToast();
  const [bundle, setBundle] = useState<SupportTicketDetailBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [replyText, setReplyText] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<AttachmentUploadPayload[]>([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Ticket rating form state
  const [ratingStars, setRatingStars] = useState<number>(5);
  const [hoveredStar, setHoveredStar] = useState<number>(0);
  const [ratingFeedback, setRatingFeedback] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);

  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const fetchThread = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const nextBundle = await loadBundle(ticketId);
        setBundle(nextBundle);
        setLoadError(null);
      } catch (err: any) {
        setLoadError(err?.message || 'Unable to load ticket conversation.');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [ticketId, loadBundle]
  );

  useEffect(() => {
    void fetchThread(false);
  }, [fetchThread]);

  // Real-time update listener via custom event emitted by TicketContext SSE/polling
  useEffect(() => {
    const onRealtime = (e: Event) => {
      const detail = (e as CustomEvent<{ ticketId?: string }>).detail;
      if (!detail?.ticketId || detail.ticketId === ticketId) {
        void fetchThread(true);
      }
    };
    window.addEventListener('wondermc:ticket-realtime', onRealtime);
    return () => window.removeEventListener('wondermc:ticket-realtime', onRealtime);
  }, [ticketId, fetchThread]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [bundle?.messages.length]);

  const handleAttachFiles = async (files: FileList | null) => {
    if (!files) return;
    const added: AttachmentUploadPayload[] = [];
    for (const file of Array.from(files)) {
      if (pendingAttachments.length + added.length >= 4) {
        error('Maximum 4 attachments allowed per message.');
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
        const payload = await readFileAsAttachmentPayload(file);
        added.push(payload);
      } catch (err: any) {
        error(err?.message || 'Failed to read attachment.');
      }
    }
    if (added.length > 0) {
      setPendingAttachments((prev) => [...prev, ...added]);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendError(null);
    const clean = replyText.trim();
    if (!clean && pendingAttachments.length === 0) {
      setSendError('Please type a message or attach an image/file.');
      return;
    }

    setSending(true);
    try {
      const updated = await onSendMessage(ticketId, {
        message: clean,
        isInternal: viewerRole !== 'user' && canAddInternalNotes ? isInternalNote : false,
        attachments: pendingAttachments,
      });
      setBundle(updated);
      setReplyText('');
      setPendingAttachments([]);
      if (isInternalNote) {
        success('Private internal staff note saved.');
      }
    } catch (err: any) {
      const msg = err?.message || 'Failed to send reply.';
      setSendError(msg);
      error(msg);
    } finally {
      setSending(false);
    }
  };

  const handleRateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSubmitRating || !bundle) return;
    setSubmittingRating(true);
    try {
      await onSubmitRating(bundle.ticket.id, ratingStars, ratingFeedback.trim() || undefined);
      await fetchThread(true);
      success('Thank you for rating our support team!');
    } catch (err: any) {
      error(err?.message || 'Failed to submit rating.');
    } finally {
      setSubmittingRating(false);
    }
  };

  if (loading && !bundle) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
        <span className="text-xs font-bold">Loading ticket conversation...</span>
      </div>
    );
  }

  if (loadError && !bundle) {
    return (
      <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-xs text-rose-300 flex items-center gap-2">
        <AlertCircle className="w-4 h-4 shrink-0" />
        <span>{loadError}</span>
      </div>
    );
  }

  if (!bundle) return null;

  const { ticket, messages, attachments, rating } = bundle;
  const visibleMessages =
    viewerRole === 'user' ? messages.filter((m) => !m.isInternal) : messages;
  const statusMeta = SUPPORT_TICKET_STATUSES.find((s) => s.id === ticket.status);
  const priorityMeta = SUPPORT_TICKET_PRIORITIES.find((p) => p.id === ticket.priority);
  const attachmentById = new Map<string, SupportAttachment>(attachments.map((a) => [a.id, a]));
  const isClosed = ticket.status === 'closed';
  const showRatingForm =
    viewerRole === 'user' &&
    ticket.status === 'resolved' &&
    !rating &&
    !ticket.ratingSubmitted &&
    (!viewerUserId || ticket.userId === viewerUserId) &&
    Boolean(onSubmitRating);

  return (
    <div className="space-y-4">
      {/* Metadata Header */}
      <div className="rounded-2xl border border-border bg-surface-deep/90 p-4 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-black px-2.5 py-1 rounded-lg bg-accent/15 text-accent border border-accent/30">
              {ticket.ticketNumber}
            </span>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${statusMeta?.badgeClass || ''}`}>
              {getStatusLabel(ticket.status)}
            </span>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${priorityMeta?.badgeClass || ''}`}>
              {getPriorityLabel(ticket.priority)} Priority
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-surface border border-border text-muted-foreground">
              {ticket.category}
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground font-mono flex items-center gap-1">
            <Clock className="w-3 h-3 text-accent" />
            {formatISTDateTime(ticket.createdAt)}
          </span>
        </div>

        <h4 className="text-sm sm:text-base font-black text-foreground">{ticket.subject}</h4>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span>
            User: <strong className="text-foreground">{ticket.username}</strong> ({ticket.userEmail})
          </span>
          {ticket.ign && (
            <span>
              IGN: <strong className="text-accent font-mono">{ticket.ign}</strong>
            </span>
          )}
          <span>
            Assigned:{' '}
            <strong className={ticket.assignedStaffName ? 'text-emerald-400' : 'text-amber-300'}>
              {ticket.assignedStaffName
                ? `${ticket.assignedStaffName}${ticket.assignedStaffRole ? ` (${ticket.assignedStaffRole})` : ''}`
                : 'Unassigned'}
            </strong>
          </span>
        </div>
      </div>

      {/* Real-time Conversation Feed */}
      <div className="rounded-2xl border border-border bg-surface-deep/60 p-3.5 sm:p-4 max-h-[380px] overflow-y-auto space-y-3">
        {visibleMessages.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">No messages yet.</p>
        ) : (
          visibleMessages.map((msg) => {
            const isUserMsg = msg.senderRole === 'user';
            const msgAttachments = (msg.attachmentIds || [])
              .map((id) => attachmentById.get(id))
              .filter((x): x is SupportAttachment => Boolean(x));

            // User messages align right, Staff/Admin align left
            return (
              <div
                key={msg.id}
                data-testid={`ticket-message-${msg.id}`}
                className={`flex flex-col ${isUserMsg ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[88%] sm:max-w-[78%] rounded-2xl px-3.5 py-2.5 border text-xs leading-relaxed shadow-sm ${
                    msg.isInternal
                      ? 'bg-violet-950/70 border-violet-500/50 text-violet-100'
                      : isUserMsg
                      ? 'bg-sky-500/15 border-sky-500/40 text-foreground rounded-tr-sm'
                      : 'bg-surface border-emerald-500/35 text-foreground rounded-tl-sm'
                  }`}
                >
                  {/* Sender & Role Header */}
                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    {isUserMsg ? (
                      <UserIcon className="w-3 h-3 text-sky-400" />
                    ) : msg.isInternal ? (
                      <Lock className="w-3 h-3 text-violet-300" />
                    ) : (
                      <ShieldCheck className="w-3 h-3 text-emerald-400" />
                    )}
                    <span className="font-black text-[11px] text-foreground">{msg.senderName}</span>
                    {!isUserMsg && (
                      <span
                        className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider ${
                          msg.isInternal
                            ? 'bg-violet-500/30 text-violet-200 border border-violet-400/40'
                            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        }`}
                      >
                        {msg.isInternal
                          ? 'INTERNAL STAFF NOTE (PRIVATE)'
                          : msg.senderStaffTitle || (msg.senderRole === 'admin' ? 'Admin' : 'Staff')}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground font-mono ml-auto pl-2">
                      {formatISTDateTime(msg.createdAt)}
                    </span>
                  </div>

                  {/* Body */}
                  <p className="whitespace-pre-wrap break-words">{msg.message}</p>

                  {/* Attachments */}
                  {msgAttachments.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-border/50 flex flex-wrap gap-2">
                      {msgAttachments.map((att) =>
                        att.mimeType.startsWith('image/') ? (
                          <button
                            key={att.id}
                            type="button"
                            onClick={() => setPreviewImage(att.dataUrl)}
                            className="group relative rounded-lg overflow-hidden border border-border bg-black/40 cursor-pointer"
                            title={`View ${att.fileName}`}
                          >
                            <img
                              src={att.dataUrl}
                              alt={att.fileName}
                              className="h-20 w-28 object-cover group-hover:scale-105 transition-transform"
                            />
                            <span className="block px-1.5 py-0.5 text-[9px] text-muted-foreground truncate max-w-[112px]">
                              {att.fileName}
                            </span>
                          </button>
                        ) : (
                          <a
                            key={att.id}
                            href={att.dataUrl}
                            download={att.fileName}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-deep px-2.5 py-1.5 text-[11px] font-bold text-foreground hover:border-accent"
                          >
                            <FileText className="w-3.5 h-3.5 text-accent" />
                            <span className="truncate max-w-[140px]">{att.fileName}</span>
                            <Download className="w-3 h-3 text-muted-foreground" />
                          </a>
                        )
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Existing Submitted Rating Display */}
      {rating && (
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <div className="font-black text-foreground flex items-center gap-1.5">
                <span>Support Experience Rating:</span>
                <span className="inline-flex items-center gap-0.5 text-amber-400">
                  {Array.from({ length: 5 }).map((_, idx) => (
                    <Star
                      key={idx}
                      className={`w-3.5 h-3.5 ${idx < rating.stars ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40'}`}
                    />
                  ))}
                </span>
                <span className="font-mono text-amber-300">({rating.stars}/5)</span>
              </div>
              {rating.feedback && (
                <p className="text-muted-foreground mt-0.5 italic">"{rating.feedback}"</p>
              )}
            </div>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground">
            {formatISTDateTime(rating.createdAt)}
          </span>
        </div>
      )}

      {/* User Rating Form when Resolved */}
      {showRatingForm && (
        <form
          onSubmit={handleRateSubmit}
          className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h5 className="text-xs font-black uppercase tracking-wider text-amber-300">
                Rate Your Support Experience
              </h5>
              <p className="text-[11px] text-muted-foreground">
                This ticket has been marked Resolved. Let us know how our staff helped!
              </p>
            </div>
            <div className="flex items-center gap-1" role="radiogroup" aria-label="Star rating">
              {[1, 2, 3, 4, 5].map((star) => {
                const filled = star <= (hoveredStar || ratingStars);
                return (
                  <button
                    key={star}
                    type="button"
                    aria-label={`${star} star${star > 1 ? 's' : ''}`}
                    onMouseEnter={() => setHoveredStar(star)}
                    onMouseLeave={() => setHoveredStar(0)}
                    onClick={() => setRatingStars(star)}
                    className="p-1 cursor-pointer transition-transform hover:scale-110"
                  >
                    <Star
                      className={`w-5 h-5 ${
                        filled ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40'
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          <textarea
            rows={2}
            value={ratingFeedback}
            onChange={(e) => setRatingFeedback(e.target.value)}
            maxLength={1000}
            placeholder="Optional feedback about the staff response..."
            className="w-full rounded-xl border border-border bg-surface-deep px-3 py-2 text-xs text-foreground outline-none focus:border-amber-400 resize-none"
          />

          <button
            type="submit"
            disabled={submittingRating}
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-xs font-black uppercase text-slate-950 hover:opacity-90 disabled:opacity-50 cursor-pointer"
          >
            {submittingRating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Star className="w-3.5 h-3.5 fill-slate-950" />}
            <span>Submit Rating ({ratingStars}/5)</span>
          </button>
        </form>
      )}

      {/* Reply Composer */}
      {canReply && (!isClosed || viewerRole !== 'user') ? (
        <form onSubmit={handleSend} className="rounded-2xl border border-border bg-surface-deep p-3.5 space-y-3">
          {viewerRole !== 'user' && canAddInternalNotes && (
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-border/60">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsInternalNote(false)}
                  className={`px-3 py-1 rounded-lg text-[11px] font-black uppercase cursor-pointer transition-colors ${
                    !isInternalNote
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-surface text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Public Staff Reply
                </button>
                <button
                  type="button"
                  onClick={() => setIsInternalNote(true)}
                  className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-[11px] font-black uppercase cursor-pointer transition-colors ${
                    isInternalNote
                      ? 'bg-violet-500 text-white'
                      : 'bg-surface text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Lock className="w-3 h-3" />
                  Internal Note (Private)
                </button>
              </div>
              {isInternalNote && (
                <span className="text-[10px] font-bold text-violet-300">
                  Hidden from customer
                </span>
              )}
            </div>
          )}

          {sendError && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-[11px] text-rose-300 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{sendError}</span>
            </div>
          )}

          <textarea
            rows={2}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder={
              isInternalNote
                ? 'Write a private internal note visible only to staff & admins...'
                : 'Type your reply message here...'
            }
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-accent resize-none"
          />

          {pendingAttachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {pendingAttachments.map((att, idx) => (
                <div
                  key={`${att.fileName}-${idx}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1 text-[11px] text-foreground"
                >
                  <ImageIcon className="w-3 h-3 text-accent" />
                  <span className="max-w-[140px] truncate">{att.fileName}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setPendingAttachments((prev) => prev.filter((_, i) => i !== idx))
                    }
                    className="text-muted-foreground hover:text-rose-400 cursor-pointer"
                    aria-label="Remove attachment"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground hover:border-accent cursor-pointer transition-colors">
              <Paperclip className="w-3.5 h-3.5 text-accent" />
              <span>Attach Image / File</span>
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

            <button
              type="submit"
              disabled={sending}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wider cursor-pointer disabled:opacity-50 transition-all ${
                isInternalNote
                  ? 'bg-violet-500 text-white hover:bg-violet-400'
                  : 'bg-accent text-accent-foreground hover:opacity-90'
              }`}
            >
              {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span>
                {sending
                  ? 'Sending...'
                  : isInternalNote
                  ? 'Save Internal Note'
                  : 'Send Reply'}
              </span>
            </button>
          </div>
        </form>
      ) : isClosed && viewerRole === 'user' ? (
        <div className="rounded-xl border border-border bg-surface-deep p-3 text-center text-xs text-muted-foreground">
          This ticket is closed. Open a new ticket in Support Center if you still need assistance.
        </div>
      ) : null}

      {/* Image Lightbox Preview */}
      {previewImage && (
        <div
          className="fixed inset-0 z-[150] flex items-center justify-center bg-black/85 p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-3xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="absolute -top-3 -right-3 rounded-full bg-surface p-2 text-foreground border border-border cursor-pointer"
              aria-label="Close image preview"
            >
              <X className="w-4 h-4" />
            </button>
            <img
              src={previewImage}
              alt="Attachment full view"
              className="max-h-[85vh] w-auto rounded-2xl border border-border object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
};
