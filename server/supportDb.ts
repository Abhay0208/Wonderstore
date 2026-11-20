import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { getSupabaseAdmin } from './supabaseAdmin';
import type {
  SupportTicket,
  SupportMessage,
  SupportAttachment,
  SupportStaffAssignment,
  SupportNotification,
  SupportRating,
  SupportStaffPermission,
  TicketHistoryEntry,
  SupportTicketPriority,
  SupportTicketStatus,
  TicketSenderRole,
  SupportTicketDetailBundle,
} from '../src/types';
import {
  generateUniqueTicketNumber,
  validateCreateTicketInput,
  validateAttachmentFileMeta,
  isValidSupportPriority,
  isValidSupportStatus,
  filterMessagesForViewer,
  canStaffAccessTicket,
  canUserSubmitRating,
  getStatusLabel,
} from '../src/utils/supportTicketHelpers';

export interface SupportDbSchema {
  support_tickets: SupportTicket[];
  support_messages: SupportMessage[];
  support_attachments: SupportAttachment[];
  support_staff_assignments: SupportStaffAssignment[];
  support_notifications: SupportNotification[];
  support_ratings: SupportRating[];
  support_staff_permissions: SupportStaffPermission[];
  ticket_history: TicketHistoryEntry[];
}

export interface SessionTokenPayload {
  kind: 'user' | 'staff';
  uid: string;
  email?: string;
  name: string;
  isAdmin: boolean;
  isOwner: boolean;
  staffId?: string;
  roleTitle?: string;
  subPermissions?: string[];
  exp: number;
}

export interface RealtimeSupportEvent {
  type:
    | 'ticket_created'
    | 'ticket_updated'
    | 'ticket_deleted'
    | 'message_created'
    | 'notification_created'
    | 'rating_created'
    | 'staff_updated';
  ticketId?: string;
  ticketOwnerId?: string;
  targetStaffId?: string;
  timestamp: string;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'support_db.json');
const SESSION_SECRET_FILE = path.join(DATA_DIR, 'session_secret.key');

function loadOrCreateSessionSecret(): string {
  const envSecret = (process.env.SUPPORT_SESSION_SECRET || '').trim();
  if (envSecret) return envSecret;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(SESSION_SECRET_FILE)) {
      const existing = fs.readFileSync(SESSION_SECRET_FILE, 'utf-8').trim();
      if (existing.length >= 32) return existing;
    }
    const generated = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(SESSION_SECRET_FILE, generated, 'utf-8');
    return generated;
  } catch {
    return crypto.randomBytes(32).toString('hex');
  }
}

const SESSION_SECRET = loadOrCreateSessionSecret();

const DEFAULT_OWNER_PASSKEY =
  process.env.ADMIN_SECURITY_KEY || 'vQ7!mZ2#L9@xR4$kT8^pN6&yW3';

const DEFAULT_STAFF_PERMISSIONS: SupportStaffPermission[] = [
  {
    id: 'staff-support-lead',
    name: 'Support & News Admin',
    roleTitle: 'Support Moderator',
    passkey: 'supportpass123',
    active: true,
    canViewAllTickets: false, // By default sees assigned tickets until Admin enables View All
    canReply: true,
    canAssign: false,
    canChangeStatus: true,
    canAddInternalNotes: true,
    canDeleteTickets: false,
    updatedAt: new Date().toISOString(),
  },
];

function createEmptyDb(): SupportDbSchema {
  return {
    support_tickets: [],
    support_messages: [],
    support_attachments: [],
    support_staff_assignments: [],
    support_notifications: [],
    support_ratings: [],
    support_staff_permissions: [...DEFAULT_STAFF_PERMISSIONS],
    ticket_history: [],
  };
}

class SupportDatabase {
  private cache: SupportDbSchema | null = null;
  public readonly events = new EventEmitter();

  constructor() {
    this.events.setMaxListeners(200);
  }

  private ensureDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  public read(): SupportDbSchema {
    if (this.cache) return this.cache;
    this.ensureDir();
    if (!fs.existsSync(DB_FILE)) {
      const initial = createEmptyDb();
      this.write(initial);
      return initial;
    }
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<SupportDbSchema>;
      const hydrated: SupportDbSchema = {
        support_tickets: Array.isArray(parsed.support_tickets) ? parsed.support_tickets : [],
        support_messages: Array.isArray(parsed.support_messages) ? parsed.support_messages : [],
        support_attachments: Array.isArray(parsed.support_attachments) ? parsed.support_attachments : [],
        support_staff_assignments: Array.isArray(parsed.support_staff_assignments) ? parsed.support_staff_assignments : [],
        support_notifications: Array.isArray(parsed.support_notifications) ? parsed.support_notifications : [],
        support_ratings: Array.isArray(parsed.support_ratings) ? parsed.support_ratings : [],
        support_staff_permissions:
          Array.isArray(parsed.support_staff_permissions) && parsed.support_staff_permissions.length > 0
            ? parsed.support_staff_permissions
            : [...DEFAULT_STAFF_PERMISSIONS],
        ticket_history: Array.isArray(parsed.ticket_history) ? parsed.ticket_history : [],
      };
      this.cache = hydrated;
      return hydrated;
    } catch {
      const initial = createEmptyDb();
      this.write(initial);
      return initial;
    }
  }

  private write(db: SupportDbSchema): void {
    this.cache = db;

    const admin = getSupabaseAdmin();
    if (admin) {
      // Upsert tickets
      if (db.support_tickets.length) {
        admin.from('support_tickets').upsert(
          db.support_tickets.map((t) => ({
            id: t.id,
            ticket_number: t.ticketNumber,
            user_id: t.userId,
            username: t.username,
            user_email: t.userEmail,
            ign: t.ign,
            contact: t.contact,
            discord_contact: t.discordContact,
            category: t.category,
            priority: t.priority,
            subject: t.subject,
            description: t.description,
            screenshot_url: t.screenshotUrl,
            status: t.status,
            assigned_staff_id: t.assignedStaffId,
            assigned_staff_name: t.assignedStaffName,
            assigned_staff_role: t.assignedStaffRole,
            created_at: t.createdAt,
            updated_at: t.updatedAt,
            last_reply_at: t.lastReplyAt,
            last_reply_by_role: t.lastReplyByRole,
            unread_by_user: t.unreadByUser ?? 0,
            unread_by_staff: t.unreadByStaff ?? 0,
            attachments_count: t.attachmentsCount ?? 0,
            rating_submitted: t.ratingSubmitted ?? false,
            admin_note: t.adminNote,
            staff_notes: t.staffNotes,
          })),
          { onConflict: 'id' }
        ).then(({ error }) => {
          if (error) console.error('[supportDb] tickets upsert', error.message);
        });
      }

      if (db.support_messages.length) {
        admin.from('support_messages').upsert(
          db.support_messages.map((m) => ({
            id: m.id,
            ticket_id: m.ticketId,
            ticket_owner_id: m.ticketOwnerId,
            sender_id: m.senderId,
            sender_name: m.senderName,
            sender_role: m.senderRole,
            sender_staff_title: m.senderStaffTitle,
            message: m.message,
            is_internal: m.isInternal,
            attachment_ids: m.attachmentIds ?? [],
            created_at: m.createdAt,
          })),
          { onConflict: 'id' }
        ).then(({ error }) => {
          if (error) console.error('[supportDb] messages upsert', error.message);
        });
      }

      // Other tables can be extended similarly
    }

    // Local fallback
    try {
      this.ensureDir();
      const tmpFile = `${DB_FILE}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf-8');
      fs.renameSync(tmpFile, DB_FILE);
    } catch {
      // ignore
    }
  }

  public resetCacheFromDisk(): void {
    this.cache = null;
  }

  private emitEvent(ev: Omit<RealtimeSupportEvent, 'timestamp'>) {
    this.events.emit('support_event', {
      ...ev,
      timestamp: new Date().toISOString(),
    } satisfies RealtimeSupportEvent);
  }

  // ==================== TOKEN SIGNING & AUTH ====================
  public signSessionToken(payload: Omit<SessionTokenPayload, 'exp'>, ttlMs = 12 * 3600 * 1000): string {
    const full: SessionTokenPayload = {
      ...payload,
      exp: Date.now() + ttlMs,
    };
    const body = Buffer.from(JSON.stringify(full)).toString('base64url');
    const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
    return `${body}.${sig}`;
  }

  public verifySessionToken(token?: string): SessionTokenPayload | null {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [body, sig] = parts;
    const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    try {
      const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8')) as SessionTokenPayload;
      if (!parsed.exp || parsed.exp < Date.now()) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  public authenticateStaffOrAdmin(passkey: string, customSubAdminKeys?: { id: string; name: string; password: string; permissions: string[] }[]) {
    const clean = (passkey || '').trim();
    if (!clean) return null;

    if (clean === DEFAULT_OWNER_PASSKEY) {
      const token = this.signSessionToken({
        kind: 'staff',
        uid: 'owner-admin',
        name: 'Main Server Owner',
        isAdmin: true,
        isOwner: true,
        staffId: 'owner-admin',
        roleTitle: 'Main Owner',
      });
      return {
        token,
        isAdmin: true,
        isOwner: true,
        staffId: 'owner-admin',
        name: 'Main Server Owner',
        roleTitle: 'Main Owner',
        permissions: null as SupportStaffPermission | null,
      };
    }

    const db = this.read();
    const staffMatch = db.support_staff_permissions.find(
      (s) => s.active && s.passkey && s.passkey.trim() === clean
    );
    if (staffMatch) {
      const token = this.signSessionToken({
        kind: 'staff',
        uid: staffMatch.id,
        name: staffMatch.name,
        isAdmin: false,
        isOwner: false,
        staffId: staffMatch.id,
        roleTitle: staffMatch.roleTitle,
      });
      return {
        token,
        isAdmin: false,
        isOwner: false,
        staffId: staffMatch.id,
        name: staffMatch.name,
        roleTitle: staffMatch.roleTitle,
        permissions: { ...staffMatch, passkey: undefined },
      };
    }

    // Also allow any active SubAdminKey synced from admin configuration with tickets, wallet, payment_management, or orders permission
    if (Array.isArray(customSubAdminKeys)) {
      const subMatch = customSubAdminKeys.find(
        (k) =>
          k.password?.trim() === clean &&
          Array.isArray(k.permissions) &&
          (k.permissions.includes('tickets') ||
            k.permissions.includes('wallet') ||
            k.permissions.includes('payment_management') ||
            k.permissions.includes('orders'))
      );
      if (subMatch) {
        const token = this.signSessionToken({
          kind: 'staff',
          uid: subMatch.id,
          name: subMatch.name,
          isAdmin: false,
          isOwner: false,
          staffId: subMatch.id,
          roleTitle: 'Sub-Admin',
          subPermissions: subMatch.permissions,
        });
        return {
          token,
          isAdmin: false,
          isOwner: false,
          staffId: subMatch.id,
          name: subMatch.name,
          roleTitle: 'Sub-Admin',
          subPermissions: subMatch.permissions,
          permissions: {
            id: subMatch.id,
            name: subMatch.name,
            roleTitle: 'Sub-Admin',
            active: true,
            canViewAllTickets: false,
            canReply: true,
            canAssign: false,
            canChangeStatus: true,
            canAddInternalNotes: true,
            canDeleteTickets: false,
            updatedAt: new Date().toISOString(),
          },
        };
      }
    }

    return null;
  }

  public getStaffPermissionRecord(session: SessionTokenPayload): SupportStaffPermission | undefined {
    if (session.isAdmin) return undefined;
    const db = this.read();
    return db.support_staff_permissions.find((s) => s.id === (session.staffId || session.uid));
  }

  // ==================== TICKETS QUERIES & MUTATIONS ====================
  public listTicketsForSession(session: SessionTokenPayload): SupportTicket[] {
    const db = this.read();
    if (session.kind === 'user') {
      return db.support_tickets
        .filter((t) => t.userId === session.uid)
        .map((t) => ({ ...t, staffNotes: undefined }));
    }

    const perm = this.getStaffPermissionRecord(session);
    return db.support_tickets.filter((t) =>
      canStaffAccessTicket(t, {
        isAdmin: session.isAdmin,
        staffId: session.staffId || session.uid,
        permissions: perm,
      })
    );
  }

  public getTicketBundle(
    ticketId: string,
    session: SessionTokenPayload
  ): { ok: true; bundle: SupportTicketDetailBundle } | { ok: false; status: number; error: string } {
    const db = this.read();
    const ticket = db.support_tickets.find((t) => t.id === ticketId || t.ticketNumber === ticketId);
    if (!ticket) {
      return { ok: false, status: 404, error: 'Ticket not found.' };
    }

    if (session.kind === 'user') {
      if (ticket.userId !== session.uid) {
        return { ok: false, status: 403, error: 'Forbidden: you can only access your own tickets.' };
      }
    } else {
      const perm = this.getStaffPermissionRecord(session);
      if (
        !canStaffAccessTicket(ticket, {
          isAdmin: session.isAdmin,
          staffId: session.staffId || session.uid,
          permissions: perm,
        })
      ) {
        return { ok: false, status: 403, error: 'Forbidden: ticket not assigned to you.' };
      }
    }

    const viewerRole: 'user' | 'staff' | 'admin' =
      session.kind === 'user' ? 'user' : session.isAdmin ? 'admin' : 'staff';

    const rawMessages = db.support_messages
      .filter((m) => m.ticketId === ticket.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    const visibleMessages = filterMessagesForViewer(rawMessages, viewerRole);
    const attachments = db.support_attachments.filter((a) => a.ticketId === ticket.id);
    const assignments = db.support_staff_assignments.filter((a) => a.ticketId === ticket.id);
    const rating = db.support_ratings.find((r) => r.ticketId === ticket.id) || null;
    const history =
      viewerRole === 'user'
        ? db.ticket_history.filter(
            (h) => h.ticketId === ticket.id && !h.action.toLowerCase().includes('internal')
          )
        : db.ticket_history.filter((h) => h.ticketId === ticket.id);

    return {
      ok: true,
      bundle: {
        ticket: viewerRole === 'user' ? { ...ticket, staffNotes: undefined } : ticket,
        messages: visibleMessages,
        attachments,
        assignments,
        rating,
        history: [...history].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      },
    };
  }

  public createTicket(
    session: SessionTokenPayload,
    input: {
      subject: string;
      category: string;
      priority: string;
      description: string;
      ign?: string;
      attachments?: Array<{ fileName: string; mimeType: string; sizeBytes: number; dataUrl: string }>;
    }
  ): { ok: true; ticket: SupportTicket; attachments: SupportAttachment[] } | { ok: false; status: number; error: string } {
    const validationErr = validateCreateTicketInput({
      subject: input.subject,
      category: input.category,
      priority: input.priority,
      description: input.description,
    });
    if (validationErr) {
      return { ok: false, status: 400, error: validationErr };
    }

    const attachmentsInput = Array.isArray(input.attachments) ? input.attachments.slice(0, 5) : [];
    for (const att of attachmentsInput) {
      const attErr = validateAttachmentFileMeta(att);
      if (attErr) return { ok: false, status: 400, error: attErr };
      if (!att.dataUrl || !att.dataUrl.startsWith('data:')) {
        return { ok: false, status: 400, error: 'Attachment payload must be a valid data URL.' };
      }
    }

    const db = this.read();
    const existingNums = new Set(db.support_tickets.map((t) => t.ticketNumber));
    const ticketNumber = generateUniqueTicketNumber(existingNums);
    const now = new Date().toISOString();
    const ticketId = `ticket_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const firstMsgId = `msg_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

    const savedAttachments: SupportAttachment[] = attachmentsInput.map((att, idx) => ({
      id: `att_${Date.now()}_${idx}_${crypto.randomBytes(2).toString('hex')}`,
      ticketId,
      ticketOwnerId: session.uid,
      messageId: firstMsgId,
      uploaderId: session.uid,
      fileName: att.fileName.trim(),
      mimeType: att.mimeType,
      sizeBytes: att.sizeBytes,
      dataUrl: att.dataUrl,
      createdAt: now,
    }));

    const ticket: SupportTicket = {
      id: ticketId,
      ticketNumber,
      userId: session.uid,
      username: session.name || 'Player',
      userEmail: session.email || 'player@wondermc.fun',
      ign: input.ign?.trim() || undefined,
      category: input.category as SupportTicket['category'],
      priority: input.priority as SupportTicketPriority,
      subject: input.subject.trim(),
      description: input.description.trim(),
      message: input.description.trim(),
      screenshotUrl: savedAttachments[0]?.dataUrl,
      status: 'open',
      createdAt: now,
      updatedAt: now,
      lastReplyAt: now,
      lastReplyByRole: 'user',
      unreadByUser: 0,
      unreadByStaff: 1,
      attachmentsCount: savedAttachments.length,
      ratingSubmitted: false,
    };

    const initialMessage: SupportMessage = {
      id: firstMsgId,
      ticketId,
      ticketOwnerId: session.uid,
      senderId: session.uid,
      senderName: session.name || 'Player',
      senderRole: 'user',
      message: input.description.trim(),
      isInternal: false,
      attachmentIds: savedAttachments.map((a) => a.id),
      createdAt: now,
    };

    const historyEntry: TicketHistoryEntry = {
      id: `hist_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
      ticketId,
      actorName: session.name || 'Player',
      actorRole: 'user',
      action: 'Ticket Created',
      details: `Opened ticket ${ticketNumber} (${ticket.category}, priority: ${ticket.priority.toUpperCase()})`,
      createdAt: now,
    };

    const staffNotification: SupportNotification = {
      id: `notif_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      recipientType: 'staff',
      recipientId: 'all',
      ticketId,
      ticketNumber,
      type: 'new_ticket',
      title: `New Ticket ${ticketNumber}`,
      body: `${ticket.username} opened "${ticket.subject}" (${ticket.category})`,
      read: false,
      createdAt: now,
    };

    db.support_tickets.unshift(ticket);
    db.support_messages.push(initialMessage);
    db.support_attachments.push(...savedAttachments);
    db.ticket_history.push(historyEntry);
    db.support_notifications.unshift(staffNotification);
    this.write(db);

    this.emitEvent({ type: 'ticket_created', ticketId, ticketOwnerId: ticket.userId });
    this.emitEvent({ type: 'notification_created', ticketId, ticketOwnerId: ticket.userId });

    return { ok: true, ticket, attachments: savedAttachments };
  }

  public postMessage(
    ticketId: string,
    session: SessionTokenPayload,
    input: {
      message: string;
      isInternal?: boolean;
      attachments?: Array<{ fileName: string; mimeType: string; sizeBytes: number; dataUrl: string }>;
      nextStatus?: SupportTicketStatus;
    }
  ): { ok: true; message: SupportMessage; ticket: SupportTicket; attachments: SupportAttachment[] } | { ok: false; status: number; error: string } {
    const cleanMsg = (input.message || '').trim();
    const attachmentsInput = Array.isArray(input.attachments) ? input.attachments.slice(0, 5) : [];

    if (!cleanMsg && attachmentsInput.length === 0) {
      return { ok: false, status: 400, error: 'Message text or an attachment is required.' };
    }
    if (cleanMsg.length > 4000) {
      return { ok: false, status: 400, error: 'Message cannot exceed 4000 characters.' };
    }
    for (const att of attachmentsInput) {
      const attErr = validateAttachmentFileMeta(att);
      if (attErr) return { ok: false, status: 400, error: attErr };
    }

    const db = this.read();
    const idx = db.support_tickets.findIndex((t) => t.id === ticketId || t.ticketNumber === ticketId);
    if (idx === -1) return { ok: false, status: 404, error: 'Ticket not found.' };
    const ticket = db.support_tickets[idx];

    const isStaffSession = session.kind === 'staff';
    const wantInternal = Boolean(input.isInternal);

    if (!isStaffSession) {
      if (ticket.userId !== session.uid) {
        return { ok: false, status: 403, error: 'Forbidden: cannot reply to another user ticket.' };
      }
      if (wantInternal) {
        return { ok: false, status: 403, error: 'Forbidden: customers cannot create internal staff notes.' };
      }
    } else {
      const perm = this.getStaffPermissionRecord(session);
      if (!canStaffAccessTicket(ticket, { isAdmin: session.isAdmin, staffId: session.staffId || session.uid, permissions: perm })) {
        return { ok: false, status: 403, error: 'Forbidden: ticket not assigned to you.' };
      }
      if (!session.isAdmin && !perm?.canReply) {
        return { ok: false, status: 403, error: 'Forbidden: reply permission disabled.' };
      }
      if (wantInternal && !session.isAdmin && !perm?.canAddInternalNotes) {
        return { ok: false, status: 403, error: 'Forbidden: internal staff note permission disabled.' };
      }
    }

    const now = new Date().toISOString();
    const msgId = `msg_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const savedAttachments: SupportAttachment[] = attachmentsInput.map((att, i) => ({
      id: `att_${Date.now()}_${i}_${crypto.randomBytes(2).toString('hex')}`,
      ticketId: ticket.id,
      ticketOwnerId: ticket.userId,
      messageId: msgId,
      uploaderId: session.uid,
      fileName: att.fileName.trim(),
      mimeType: att.mimeType,
      sizeBytes: att.sizeBytes,
      dataUrl: att.dataUrl,
      createdAt: now,
    }));

    const senderRole: TicketSenderRole = !isStaffSession
      ? 'user'
      : session.isAdmin
      ? 'admin'
      : 'staff';

    const createdMsg: SupportMessage = {
      id: msgId,
      ticketId: ticket.id,
      ticketOwnerId: ticket.userId,
      senderId: session.uid,
      senderName: session.name,
      senderRole,
      senderStaffTitle: isStaffSession ? session.roleTitle || 'Staff' : undefined,
      message: cleanMsg || '[Attachment uploaded]',
      isInternal: wantInternal,
      attachmentIds: savedAttachments.map((a) => a.id),
      createdAt: now,
    };

    let nextStatus = ticket.status;
    if (isStaffSession && !wantInternal) {
      if (input.nextStatus && isValidSupportStatus(input.nextStatus)) {
        nextStatus = input.nextStatus;
      } else if (ticket.status === 'open' || ticket.status === 'in_progress') {
        nextStatus = 'answered';
      }
    } else if (!isStaffSession && (ticket.status === 'waiting_for_user' || ticket.status === 'answered')) {
      nextStatus = 'open';
    }

    const updatedTicket: SupportTicket = {
      ...ticket,
      status: nextStatus,
      updatedAt: now,
      lastReplyAt: wantInternal ? ticket.lastReplyAt : now,
      lastReplyByRole: wantInternal ? ticket.lastReplyByRole : senderRole,
      unreadByUser: isStaffSession && !wantInternal ? (ticket.unreadByUser || 0) + 1 : ticket.unreadByUser || 0,
      unreadByStaff: !isStaffSession ? (ticket.unreadByStaff || 0) + 1 : ticket.unreadByStaff || 0,
      attachmentsCount: (ticket.attachmentsCount || 0) + savedAttachments.length,
      adminNote: isStaffSession && !wantInternal ? createdMsg.message : ticket.adminNote,
    };

    db.support_tickets[idx] = updatedTicket;
    db.support_messages.push(createdMsg);
    db.support_attachments.push(...savedAttachments);

    if (wantInternal) {
      db.ticket_history.push({
        id: `hist_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
        ticketId: ticket.id,
        actorName: session.name,
        actorRole: senderRole,
        action: 'Internal Staff Note',
        details: `${session.name} (${session.roleTitle || 'Staff'}) added a private internal note.`,
        createdAt: now,
      });
    } else if (isStaffSession) {
      db.support_notifications.unshift({
        id: `notif_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        recipientType: 'user',
        recipientId: ticket.userId,
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        type: 'staff_reply',
        title: `Staff Reply on ${ticket.ticketNumber}`,
        body: `${session.name} (${session.roleTitle || 'Staff'}) replied: ${createdMsg.message.slice(0, 100)}`,
        read: false,
        createdAt: now,
      });
      db.ticket_history.push({
        id: `hist_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
        ticketId: ticket.id,
        actorName: session.name,
        actorRole: senderRole,
        action: 'Staff Reply',
        details: `${session.name} replied publicly to ${ticket.username}.`,
        createdAt: now,
      });
    } else {
      db.support_notifications.unshift({
        id: `notif_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        recipientType: 'staff',
        recipientId: ticket.assignedStaffId || 'all',
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        type: 'user_reply',
        title: `User Reply on ${ticket.ticketNumber}`,
        body: `${ticket.username} replied: ${createdMsg.message.slice(0, 100)}`,
        read: false,
        createdAt: now,
      });
    }

    this.write(db);
    this.emitEvent({
      type: 'message_created',
      ticketId: ticket.id,
      ticketOwnerId: ticket.userId,
      targetStaffId: ticket.assignedStaffId,
    });
    this.emitEvent({
      type: 'ticket_updated',
      ticketId: ticket.id,
      ticketOwnerId: ticket.userId,
      targetStaffId: ticket.assignedStaffId,
    });
    if (!wantInternal) {
      this.emitEvent({
        type: 'notification_created',
        ticketId: ticket.id,
        ticketOwnerId: ticket.userId,
        targetStaffId: ticket.assignedStaffId,
      });
    }

    return { ok: true, message: createdMsg, ticket: updatedTicket, attachments: savedAttachments };
  }

  public markTicketRead(ticketId: string, session: SessionTokenPayload): SupportTicket | null {
    const db = this.read();
    const idx = db.support_tickets.findIndex((t) => t.id === ticketId);
    if (idx === -1) return null;
    const t = db.support_tickets[idx];
    if (session.kind === 'user' && t.userId !== session.uid) return null;
    if (session.kind === 'user') {
      db.support_tickets[idx] = { ...t, unreadByUser: 0 };
      db.support_notifications.forEach((n) => {
        if (n.recipientType === 'user' && n.recipientId === session.uid && n.ticketId === t.id) {
          n.read = true;
        }
      });
    } else {
      db.support_tickets[idx] = { ...t, unreadByStaff: 0 };
      db.support_notifications.forEach((n) => {
        if (n.recipientType !== 'user' && n.ticketId === t.id) {
          n.read = true;
        }
      });
    }
    this.write(db);
    return db.support_tickets[idx];
  }

  public updateTicketByStaff(
    ticketId: string,
    session: SessionTokenPayload,
    patch: {
      status?: SupportTicketStatus;
      priority?: SupportTicketPriority;
      assignedStaffId?: string | null;
    }
  ): { ok: true; ticket: SupportTicket; importantUpdateSummary?: string } | { ok: false; status: number; error: string } {
    if (session.kind !== 'staff') {
      return { ok: false, status: 403, error: 'Forbidden: staff or admin role required.' };
    }
    const db = this.read();
    const idx = db.support_tickets.findIndex((t) => t.id === ticketId || t.ticketNumber === ticketId);
    if (idx === -1) return { ok: false, status: 404, error: 'Ticket not found.' };
    const current = db.support_tickets[idx];
    const perm = this.getStaffPermissionRecord(session);

    if (!canStaffAccessTicket(current, { isAdmin: session.isAdmin, staffId: session.staffId || session.uid, permissions: perm })) {
      return { ok: false, status: 403, error: 'Forbidden: you do not have access to this ticket.' };
    }

    const now = new Date().toISOString();
    let next = { ...current, updatedAt: now };
    let importantUpdateSummary: string | undefined;

    if (patch.status && patch.status !== current.status) {
      if (!session.isAdmin && !perm?.canChangeStatus) {
        return { ok: false, status: 403, error: 'Forbidden: status modification permission disabled.' };
      }
      if (!isValidSupportStatus(patch.status)) {
        return { ok: false, status: 400, error: 'Invalid ticket status.' };
      }
      const prevLabel = getStatusLabel(current.status);
      const nextLabel = getStatusLabel(patch.status);
      next.status = patch.status;
      importantUpdateSummary = `Status changed from **${prevLabel}** to **${nextLabel}** by ${session.name}.`;

      db.ticket_history.push({
        id: `hist_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
        ticketId: current.id,
        actorName: session.name,
        actorRole: session.isAdmin ? 'admin' : 'staff',
        action: `Status Changed: ${nextLabel}`,
        details: `${session.name} changed status from ${prevLabel} to ${nextLabel}`,
        createdAt: now,
      });

      const notifType =
        patch.status === 'resolved' ? 'resolved' : patch.status === 'closed' ? 'closed' : 'status_changed';
      db.support_notifications.unshift({
        id: `notif_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        recipientType: 'user',
        recipientId: current.userId,
        ticketId: current.id,
        ticketNumber: current.ticketNumber,
        type: notifType,
        title: `Ticket ${current.ticketNumber} ${nextLabel}`,
        body:
          patch.status === 'resolved'
            ? `Your ticket "${current.subject}" was marked Resolved by ${session.name}. You can now rate our support!`
            : `Status updated from ${prevLabel} to ${nextLabel} by ${session.name}.`,
        read: false,
        createdAt: now,
      });
    }

    if (patch.priority && patch.priority !== current.priority) {
      if (!isValidSupportPriority(patch.priority)) {
        return { ok: false, status: 400, error: 'Invalid ticket priority.' };
      }
      next.priority = patch.priority;
      db.ticket_history.push({
        id: `hist_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
        ticketId: current.id,
        actorName: session.name,
        actorRole: session.isAdmin ? 'admin' : 'staff',
        action: 'Priority Updated',
        details: `${session.name} set priority to ${patch.priority.toUpperCase()}`,
        createdAt: now,
      });
    }

    if (patch.assignedStaffId !== undefined) {
      if (!session.isAdmin && !perm?.canAssign) {
        return { ok: false, status: 403, error: 'Forbidden: ticket assignment permission disabled.' };
      }
      if (!patch.assignedStaffId) {
        next.assignedStaffId = undefined;
        next.assignedStaffName = undefined;
        next.assignedStaffRole = undefined;
        db.support_staff_assignments.forEach((a) => {
          if (a.ticketId === current.id) a.active = false;
        });
      } else {
        const staffMember =
          patch.assignedStaffId === 'owner-admin'
            ? { id: 'owner-admin', name: 'Main Server Owner', roleTitle: 'Main Owner' }
            : db.support_staff_permissions.find((s) => s.id === patch.assignedStaffId);
        if (!staffMember) {
          return { ok: false, status: 404, error: 'Target staff member not found.' };
        }
        next.assignedStaffId = staffMember.id;
        next.assignedStaffName = staffMember.name;
        next.assignedStaffRole = staffMember.roleTitle;
        db.support_staff_assignments.forEach((a) => {
          if (a.ticketId === current.id) a.active = false;
        });
        db.support_staff_assignments.push({
          id: `assign_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
          ticketId: current.id,
          staffId: staffMember.id,
          staffName: staffMember.name,
          staffRole: staffMember.roleTitle,
          assignedBy: session.name,
          assignedAt: now,
          active: true,
        });
        db.support_notifications.unshift({
          id: `notif_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
          recipientType: 'staff',
          recipientId: staffMember.id,
          ticketId: current.id,
          ticketNumber: current.ticketNumber,
          type: 'assigned',
          title: `Assigned Ticket ${current.ticketNumber}`,
          body: `${session.name} assigned "${current.subject}" to ${staffMember.name}.`,
          read: false,
          createdAt: now,
        });
        db.ticket_history.push({
          id: `hist_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
          ticketId: current.id,
          actorName: session.name,
          actorRole: session.isAdmin ? 'admin' : 'staff',
          action: 'Ticket Assigned',
          details: `Assigned to ${staffMember.name} (${staffMember.roleTitle}) by ${session.name}`,
          createdAt: now,
        });
        importantUpdateSummary =
          importantUpdateSummary || `Assigned to **${staffMember.name}** (${staffMember.roleTitle}) by ${session.name}.`;
      }
    }

    db.support_tickets[idx] = next;
    this.write(db);
    this.emitEvent({
      type: 'ticket_updated',
      ticketId: current.id,
      ticketOwnerId: current.userId,
      targetStaffId: next.assignedStaffId,
    });
    this.emitEvent({
      type: 'notification_created',
      ticketId: current.id,
      ticketOwnerId: current.userId,
      targetStaffId: next.assignedStaffId,
    });

    return { ok: true, ticket: next, importantUpdateSummary };
  }

  public deleteTicket(
    ticketId: string,
    session: SessionTokenPayload
  ): { ok: true } | { ok: false; status: number; error: string } {
    if (session.kind !== 'staff') {
      return { ok: false, status: 403, error: 'Forbidden: admin permission required.' };
    }
    const perm = this.getStaffPermissionRecord(session);
    if (!session.isAdmin && !perm?.canDeleteTickets) {
      return { ok: false, status: 403, error: 'Forbidden: delete permission required.' };
    }

    const db = this.read();
    const target = db.support_tickets.find((t) => t.id === ticketId);
    if (!target) return { ok: false, status: 404, error: 'Ticket not found.' };

    db.support_tickets = db.support_tickets.filter((t) => t.id !== ticketId);
    db.support_messages = db.support_messages.filter((m) => m.ticketId !== ticketId);
    db.support_attachments = db.support_attachments.filter((a) => a.ticketId !== ticketId);
    db.support_staff_assignments = db.support_staff_assignments.filter((a) => a.ticketId !== ticketId);
    db.support_notifications = db.support_notifications.filter((n) => n.ticketId !== ticketId);
    db.support_ratings = db.support_ratings.filter((r) => r.ticketId !== ticketId);
    db.ticket_history = db.ticket_history.filter((h) => h.ticketId !== ticketId);

    this.write(db);
    this.emitEvent({ type: 'ticket_deleted', ticketId, ticketOwnerId: target.userId });
    return { ok: true };
  }

  // ==================== RATINGS ====================
  public submitRating(
    ticketId: string,
    session: SessionTokenPayload,
    stars: number,
    feedback?: string
  ): { ok: true; rating: SupportRating } | { ok: false; status: number; error: string } {
    if (session.kind !== 'user') {
      return { ok: false, status: 403, error: 'Only the ticket owner can rate support.' };
    }
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
      return { ok: false, status: 400, error: 'Rating must be an integer between 1 and 5 stars.' };
    }
    const db = this.read();
    const idx = db.support_tickets.findIndex((t) => t.id === ticketId);
    if (idx === -1) return { ok: false, status: 404, error: 'Ticket not found.' };
    const ticket = db.support_tickets[idx];
    const existingRating = db.support_ratings.some((r) => r.ticketId === ticket.id);

    const check = canUserSubmitRating(ticket, session.uid, existingRating);
    if (!check.allowed) {
      return { ok: false, status: existingRating ? 409 : 400, error: check.reason || 'Cannot submit rating.' };
    }

    const now = new Date().toISOString();
    const rating: SupportRating = {
      id: ticket.id,
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      userId: session.uid,
      username: ticket.username,
      stars: stars as 1 | 2 | 3 | 4 | 5,
      feedback: feedback?.trim() ? feedback.trim().slice(0, 1000) : undefined,
      createdAt: now,
    };

    db.support_ratings.unshift(rating);
    db.support_tickets[idx] = { ...ticket, ratingSubmitted: true, updatedAt: now };
    db.ticket_history.push({
      id: `hist_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
      ticketId: ticket.id,
      actorName: ticket.username,
      actorRole: 'user',
      action: `Rated Support (${stars}/5)`,
      details: `${ticket.username} submitted a ${stars}-star rating${rating.feedback ? `: "${rating.feedback}"` : '.'}`,
      createdAt: now,
    });
    this.write(db);
    this.emitEvent({ type: 'rating_created', ticketId: ticket.id, ticketOwnerId: ticket.userId });
    this.emitEvent({ type: 'ticket_updated', ticketId: ticket.id, ticketOwnerId: ticket.userId });

    return { ok: true, rating };
  }

  public listRatings(session: SessionTokenPayload): SupportRating[] {
    const db = this.read();
    if (session.kind === 'user') {
      return db.support_ratings.filter((r) => r.userId === session.uid);
    }
    return db.support_ratings;
  }

  // ==================== NOTIFICATIONS ====================
  public listNotifications(session: SessionTokenPayload): SupportNotification[] {
    const db = this.read();
    if (session.kind === 'user') {
      return db.support_notifications.filter(
        (n) => n.recipientType === 'user' && n.recipientId === session.uid
      );
    }
    const staffId = session.staffId || session.uid;
    return db.support_notifications.filter(
      (n) =>
        (n.recipientType === 'staff' || n.recipientType === 'admin') &&
        (n.recipientId === 'all' || n.recipientId === staffId || session.isAdmin)
    );
  }

  public markNotificationsRead(session: SessionTokenPayload, ids?: string[]): void {
    const db = this.read();
    const idSet = Array.isArray(ids) && ids.length > 0 ? new Set(ids) : null;
    for (const n of db.support_notifications) {
      if (idSet && !idSet.has(n.id)) continue;
      if (session.kind === 'user') {
        if (n.recipientType === 'user' && n.recipientId === session.uid) n.read = true;
      } else if (n.recipientType === 'staff' || n.recipientType === 'admin') {
        if (n.recipientId === 'all' || n.recipientId === (session.staffId || session.uid) || session.isAdmin) {
          n.read = true;
        }
      }
    }
    this.write(db);
  }

  public pushUserNotification(
    userId: string,
    payload: {
      ticketId: string;
      ticketNumber: string;
      type: SupportNotification['type'];
      title: string;
      body: string;
    }
  ): SupportNotification {
    const db = this.read();
    const notification: SupportNotification = {
      id: `notif-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      recipientType: 'user',
      recipientId: userId,
      ticketId: payload.ticketId,
      ticketNumber: payload.ticketNumber,
      type: payload.type,
      title: payload.title.slice(0, 140),
      body: payload.body.slice(0, 400),
      read: false,
      createdAt: new Date().toISOString(),
    };
    db.support_notifications.unshift(notification);
    if (db.support_notifications.length > 500) {
      db.support_notifications = db.support_notifications.slice(0, 500);
    }
    this.write(db);
    this.emitEvent({
      type: 'notification_created',
      ticketId: payload.ticketId,
      ticketOwnerId: userId,
    });
    return notification;
  }

  // ==================== STAFF PERMISSIONS MANAGEMENT ====================
  public listStaffMembers(includePasskeys: boolean): SupportStaffPermission[] {
    const db = this.read();
    return db.support_staff_permissions.map((s) =>
      includePasskeys ? s : { ...s, passkey: undefined }
    );
  }

  public upsertStaffMember(
    session: SessionTokenPayload,
    member: Partial<SupportStaffPermission> & { id?: string; name: string; roleTitle: string }
  ): { ok: true; member: SupportStaffPermission } | { ok: false; status: number; error: string } {
    if (!session.isAdmin) {
      return { ok: false, status: 403, error: 'Only Main Owner/Admin can manage staff permissions.' };
    }
    const cleanName = (member.name || '').trim();
    const cleanRole = (member.roleTitle || 'Moderator').trim();
    if (!cleanName) {
      return { ok: false, status: 400, error: 'Staff member name is required.' };
    }

    const db = this.read();
    const now = new Date().toISOString();
    const targetId = member.id || `staff_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
    const existingIdx = db.support_staff_permissions.findIndex((s) => s.id === targetId);
    const existing = existingIdx >= 0 ? db.support_staff_permissions[existingIdx] : undefined;

    const record: SupportStaffPermission = {
      id: targetId,
      name: cleanName.slice(0, 80),
      roleTitle: cleanRole.slice(0, 60),
      passkey:
        typeof member.passkey === 'string' && member.passkey.trim()
          ? member.passkey.trim()
          : existing?.passkey || `staff${Math.floor(1000 + Math.random() * 9000)}`,
      email: typeof member.email === 'string' ? member.email.trim() : existing?.email,
      active: typeof member.active === 'boolean' ? member.active : existing?.active ?? true,
      canViewAllTickets:
        typeof member.canViewAllTickets === 'boolean'
          ? member.canViewAllTickets
          : existing?.canViewAllTickets ?? false,
      canReply: typeof member.canReply === 'boolean' ? member.canReply : existing?.canReply ?? true,
      canAssign: typeof member.canAssign === 'boolean' ? member.canAssign : existing?.canAssign ?? false,
      canChangeStatus:
        typeof member.canChangeStatus === 'boolean'
          ? member.canChangeStatus
          : existing?.canChangeStatus ?? true,
      canAddInternalNotes:
        typeof member.canAddInternalNotes === 'boolean'
          ? member.canAddInternalNotes
          : existing?.canAddInternalNotes ?? true,
      canDeleteTickets:
        typeof member.canDeleteTickets === 'boolean'
          ? member.canDeleteTickets
          : existing?.canDeleteTickets ?? false,
      updatedAt: now,
    };

    if (existingIdx >= 0) {
      db.support_staff_permissions[existingIdx] = record;
    } else {
      db.support_staff_permissions.push(record);
    }

    this.write(db);
    this.emitEvent({ type: 'staff_updated', targetStaffId: record.id });
    return { ok: true, member: record };
  }

  public deleteStaffMember(session: SessionTokenPayload, staffId: string): { ok: true } | { ok: false; status: number; error: string } {
    if (!session.isAdmin) {
      return { ok: false, status: 403, error: 'Only Main Owner/Admin can remove staff members.' };
    }
    const db = this.read();
    db.support_staff_permissions = db.support_staff_permissions.filter((s) => s.id !== staffId);
    this.write(db);
    this.emitEvent({ type: 'staff_updated' });
    return { ok: true };
  }
}

export const supportDb = new SupportDatabase();
