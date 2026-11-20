import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SUPPORT_TICKET_CATEGORIES,
  generateUniqueTicketNumber,
  validateCreateTicketInput,
  validateAttachmentFileMeta,
  computeTicketDashboardStats,
  filterSupportTickets,
  filterMessagesForViewer,
  canStaffAccessTicket,
  canUserSubmitRating,
} from './supportTicketHelpers';
import { SupportMessage, SupportStaffPermission, SupportTicket } from '../types';

const sampleTickets: SupportTicket[] = [
  {
    id: 't1',
    ticketNumber: 'TKT-100001',
    userId: 'u1',
    username: 'AlexPlayer',
    userEmail: 'alex@example.com',
    ign: 'AlexMC',
    category: 'Payment & Billing',
    priority: 'urgent',
    subject: 'UPI rank delay',
    description: 'Paid via UPI UTR 123456',
    status: 'open',
    createdAt: '2026-01-01T10:00:00Z',
    updatedAt: '2026-01-01T10:00:00Z',
  },
  {
    id: 't2',
    ticketNumber: 'TKT-200002',
    userId: 'u2',
    username: 'SteveBuilder',
    userEmail: 'steve@example.com',
    category: 'Bug Report',
    priority: 'normal',
    subject: 'Vote key glitch',
    description: 'Crate menu freeze in lobby',
    status: 'waiting_for_user',
    assignedStaffId: 'staff-1',
    assignedStaffName: 'Moderator Sam',
    createdAt: '2026-01-01T11:00:00Z',
    updatedAt: '2026-01-01T12:00:00Z',
  },
  {
    id: 't3',
    ticketNumber: 'TKT-300003',
    userId: 'u1',
    username: 'AlexPlayer',
    userEmail: 'alex@example.com',
    category: 'Technical Support',
    priority: 'low',
    subject: 'Bedrock port help',
    description: 'Cannot connect on mobile',
    status: 'resolved',
    createdAt: '2026-01-01T13:00:00Z',
    updatedAt: '2026-01-01T14:00:00Z',
  },
];

describe('supportTicketHelpers', () => {
  it('enforces exact 6 categories and excludes Hosting Support', () => {
    assert.equal(SUPPORT_TICKET_CATEGORIES.length, 6);
    assert.ok(!SUPPORT_TICKET_CATEGORIES.includes('Hosting Support' as any));
    assert.deepEqual([...SUPPORT_TICKET_CATEGORIES], [
      'Technical Support',
      'Payment & Billing',
      'Minecraft Server Support',
      'Account Issues',
      'Bug Report',
      'Other',
    ]);
  });

  it('generates unique TKT-XXXXXX IDs', () => {
    const existing = new Set(['TKT-100001']);
    const id = generateUniqueTicketNumber(existing);
    assert.match(id, /^TKT-\d{6}$/);
    assert.notEqual(id, 'TKT-100001');
  });

  it('rejects invalid categories like Hosting Support and invalid descriptions', () => {
    assert.ok(
      validateCreateTicketInput({
        subject: 'Help needed',
        category: 'Hosting Support',
        priority: 'normal',
        description: 'Need help',
      })
    );
    assert.equal(
      validateCreateTicketInput({
        subject: 'Help needed',
        category: 'Minecraft Server Support',
        priority: 'high',
        description: 'Chunk loading slows down near spawn.',
      }),
      null
    );
  });

  it('validates attachment MIME types and 5MB cap', () => {
    assert.equal(
      validateAttachmentFileMeta({ fileName: 'proof.png', mimeType: 'image/png', sizeBytes: 1024 }),
      null
    );
    assert.ok(
      validateAttachmentFileMeta({ fileName: 'malware.exe', mimeType: 'application/x-msdownload', sizeBytes: 1024 })
    );
    assert.ok(
      validateAttachmentFileMeta({ fileName: 'huge.png', mimeType: 'image/png', sizeBytes: 6 * 1024 * 1024 })
    );
  });

  it('computes accurate 6-bucket dashboard statistics', () => {
    const stats = computeTicketDashboardStats(sampleTickets);
    assert.equal(stats.total, 3);
    assert.equal(stats.open, 1);
    assert.equal(stats.waitingForUser, 1);
    assert.equal(stats.resolved, 1);
    assert.equal(stats.closed, 0);
  });

  it('searches by ticket ID, username, email and filters by category, priority, status', () => {
    assert.equal(filterSupportTickets(sampleTickets, { search: 'TKT-200002' }).length, 1);
    assert.equal(filterSupportTickets(sampleTickets, { search: 'steve@example.com' }).length, 1);
    assert.equal(filterSupportTickets(sampleTickets, { search: 'AlexPlayer' }).length, 2);
    assert.equal(filterSupportTickets(sampleTickets, { priority: 'urgent' }).length, 1);
    assert.equal(filterSupportTickets(sampleTickets, { category: 'Bug Report' }).length, 1);
    assert.equal(filterSupportTickets(sampleTickets, { status: 'resolved' }).length, 1);
  });

  it('hides internal staff notes from regular users while keeping them for staff/admin', () => {
    const msgs: SupportMessage[] = [
      {
        id: 'm1',
        ticketId: 't1',
        ticketOwnerId: 'u1',
        senderId: 'staff-1',
        senderName: 'Mod Sam',
        senderRole: 'staff',
        senderStaffTitle: 'Moderator',
        message: 'Public reply',
        isInternal: false,
        createdAt: '2026-01-01T10:05:00Z',
      },
      {
        id: 'm2',
        ticketId: 't1',
        ticketOwnerId: 'u1',
        senderId: 'staff-1',
        senderName: 'Mod Sam',
        senderRole: 'staff',
        senderStaffTitle: 'Moderator',
        message: 'Secret internal staff note',
        isInternal: true,
        createdAt: '2026-01-01T10:06:00Z',
      },
    ];
    assert.equal(filterMessagesForViewer(msgs, 'user').length, 1);
    assert.equal(filterMessagesForViewer(msgs, 'user')[0].isInternal, false);
    assert.equal(filterMessagesForViewer(msgs, 'staff').length, 2);
    assert.equal(filterMessagesForViewer(msgs, 'admin').length, 2);
  });

  it('enforces staff ticket assignment scope & rating eligibility rules', () => {
    const restrictedStaff: SupportStaffPermission = {
      id: 'staff-1',
      name: 'Mod Sam',
      roleTitle: 'Moderator',
      active: true,
      canViewAllTickets: false,
      canReply: true,
      canAssign: false,
      canChangeStatus: true,
      canAddInternalNotes: true,
      canDeleteTickets: false,
      updatedAt: '2026-01-01T00:00:00Z',
    };
    assert.equal(canStaffAccessTicket(sampleTickets[0], { isAdmin: false, staffId: 'staff-1', permissions: restrictedStaff }), false);
    assert.equal(canStaffAccessTicket(sampleTickets[1], { isAdmin: false, staffId: 'staff-1', permissions: restrictedStaff }), true);

    assert.equal(canUserSubmitRating(sampleTickets[0], 'u1', false).allowed, false);
    assert.equal(canUserSubmitRating(sampleTickets[2], 'u2', false).allowed, false);
    assert.equal(canUserSubmitRating(sampleTickets[2], 'u1', true).allowed, false);
    assert.equal(canUserSubmitRating(sampleTickets[2], 'u1', false).allowed, true);
  });
});
