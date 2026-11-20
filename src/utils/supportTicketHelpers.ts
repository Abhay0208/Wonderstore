import {
  SupportTicket,
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketStatus,
  SupportMessage,
  SupportStaffPermission,
} from '../types';

export const SUPPORT_TICKET_CATEGORIES: readonly SupportTicketCategory[] = [
  'Technical Support',
  'Payment & Billing',
  'Minecraft Server Support',
  'Account Issues',
  'Bug Report',
  'Other',
] as const;

export const SUPPORT_TICKET_PRIORITIES: readonly {
  id: SupportTicketPriority;
  label: string;
  badgeClass: string;
}[] = [
  { id: 'low', label: 'Low', badgeClass: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
  { id: 'normal', label: 'Normal', badgeClass: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  { id: 'high', label: 'High', badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  { id: 'urgent', label: 'Urgent', badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40' },
] as const;

export const SUPPORT_TICKET_STATUSES: readonly {
  id: SupportTicketStatus;
  label: string;
  badgeClass: string;
}[] = [
  { id: 'open', label: 'Open', badgeClass: 'bg-sky-500/20 text-sky-300 border-sky-500/40' },
  { id: 'in_progress', label: 'In Progress', badgeClass: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40' },
  { id: 'waiting_for_user', label: 'Waiting for User', badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  { id: 'answered', label: 'Answered', badgeClass: 'bg-teal-500/20 text-teal-300 border-teal-500/40' },
  { id: 'resolved', label: 'Resolved', badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
  { id: 'closed', label: 'Closed', badgeClass: 'bg-slate-600/25 text-slate-300 border-slate-500/40' },
] as const;

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5MB
export const ALLOWED_ATTACHMENT_MIME_PREFIXES = ['image/', 'text/plain', 'application/pdf'];

export function isValidSupportCategory(category: string): category is SupportTicketCategory {
  return (SUPPORT_TICKET_CATEGORIES as readonly string[]).includes(category);
}

export function isValidSupportPriority(priority: string): priority is SupportTicketPriority {
  return SUPPORT_TICKET_PRIORITIES.some((p) => p.id === priority);
}

export function isValidSupportStatus(status: string): status is SupportTicketStatus {
  return SUPPORT_TICKET_STATUSES.some((s) => s.id === status);
}

export function getStatusLabel(status: SupportTicketStatus): string {
  return SUPPORT_TICKET_STATUSES.find((s) => s.id === status)?.label || 'Open';
}

export function getPriorityLabel(priority: SupportTicketPriority): string {
  return SUPPORT_TICKET_PRIORITIES.find((p) => p.id === priority)?.label || 'Normal';
}

export function generateUniqueTicketNumber(existingNumbers: Set<string> = new Set()): string {
  for (let i = 0; i < 20; i++) {
    const code = Math.floor(100000 + Math.random() * 900000);
    const candidate = `TKT-${code}`;
    if (!existingNumbers.has(candidate)) {
      return candidate;
    }
  }
  return `TKT-${Date.now().toString().slice(-6)}`;
}

export function validateCreateTicketInput(input: {
  subject: string;
  category: string;
  priority: string;
  description: string;
}): string | null {
  const subject = (input.subject || '').trim();
  const description = (input.description || '').trim();
  if (subject.length < 3 || subject.length > 160) {
    return 'Ticket subject must be between 3 and 160 characters.';
  }
  if (!isValidSupportCategory(input.category)) {
    return 'Please select a valid ticket category.';
  }
  if (!isValidSupportPriority(input.priority)) {
    return 'Please select a valid ticket priority.';
  }
  if (description.length < 5 || description.length > 5000) {
    return 'Detailed description must be between 5 and 5000 characters.';
  }
  return null;
}

export function validateAttachmentFileMeta(meta: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}): string | null {
  if (!meta.fileName || meta.fileName.length > 180) {
    return 'Invalid file name.';
  }
  if (!meta.sizeBytes || meta.sizeBytes <= 0 || meta.sizeBytes > MAX_ATTACHMENT_BYTES) {
    return 'Attachment size must be between 1 byte and 5MB.';
  }
  const okMime = ALLOWED_ATTACHMENT_MIME_PREFIXES.some((prefix) =>
    (meta.mimeType || '').toLowerCase().startsWith(prefix)
  );
  if (!okMime) {
    return 'Only images (PNG/JPG/WEBP/GIF), PDF, and TXT files are allowed.';
  }
  return null;
}

export interface TicketDashboardStats {
  total: number;
  open: number;
  inProgress: number;
  waitingForUser: number;
  answered: number;
  resolved: number;
  closed: number;
}

export function computeTicketDashboardStats(tickets: SupportTicket[]): TicketDashboardStats {
  const stats: TicketDashboardStats = {
    total: tickets.length,
    open: 0,
    inProgress: 0,
    waitingForUser: 0,
    answered: 0,
    resolved: 0,
    closed: 0,
  };
  for (const t of tickets) {
    if (t.status === 'open') stats.open += 1;
    else if (t.status === 'in_progress') stats.inProgress += 1;
    else if (t.status === 'waiting_for_user') stats.waitingForUser += 1;
    else if (t.status === 'answered') stats.answered += 1;
    else if (t.status === 'resolved') stats.resolved += 1;
    else if (t.status === 'closed') stats.closed += 1;
  }
  return stats;
}

export function filterSupportTickets(
  tickets: SupportTicket[],
  filters: {
    search?: string;
    category?: string;
    priority?: string;
    status?: string;
  }
): SupportTicket[] {
  const q = (filters.search || '').trim().toLowerCase();
  const cat = filters.category || 'All';
  const prio = filters.priority || 'All';
  const status = filters.status || 'all';

  return tickets.filter((t) => {
    if (status !== 'all' && t.status !== status) return false;
    if (cat !== 'All' && t.category !== cat) return false;
    if (prio !== 'All' && t.priority !== prio) return false;
    if (!q) return true;

    return (
      t.ticketNumber.toLowerCase().includes(q) ||
      t.username.toLowerCase().includes(q) ||
      t.userEmail.toLowerCase().includes(q) ||
      (t.ign && t.ign.toLowerCase().includes(q)) ||
      t.subject.toLowerCase().includes(q)
    );
  });
}

export function filterMessagesForViewer(
  messages: SupportMessage[],
  viewerRole: 'user' | 'staff' | 'admin'
): SupportMessage[] {
  if (viewerRole === 'staff' || viewerRole === 'admin') {
    return messages;
  }
  return messages.filter((m) => !m.isInternal);
}

export function canStaffAccessTicket(
  ticket: SupportTicket,
  staff: { isAdmin: boolean; staffId: string; permissions?: SupportStaffPermission }
): boolean {
  if (staff.isAdmin) return true;
  if (!staff.permissions || !staff.permissions.active) return false;
  if (staff.permissions.canViewAllTickets) return true;
  return ticket.assignedStaffId === staff.staffId;
}

export function canUserSubmitRating(
  ticket: SupportTicket,
  viewerUserId: string,
  hasExistingRating: boolean
): { allowed: boolean; reason?: string } {
  if (!viewerUserId || ticket.userId !== viewerUserId) {
    return { allowed: false, reason: 'You can only rate your own support tickets.' };
  }
  if (ticket.status !== 'resolved') {
    return { allowed: false, reason: 'Tickets can be rated once marked as Resolved.' };
  }
  if (hasExistingRating || ticket.ratingSubmitted) {
    return { allowed: false, reason: 'A rating has already been submitted for this ticket.' };
  }
  return { allowed: true };
}
