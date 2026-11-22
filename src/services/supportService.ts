import type {
  SupportTicket,
  SupportMessage,
  SupportAttachment,
  SupportNotification,
  SupportRating,
  SupportStaffPermission,
  SupportTicketDetailBundle,
  DiscordSupportConfigPublic,
  SupportTicketPriority,
  SupportTicketStatus,
  SubAdminKey,
} from '../types';

export interface StaffPortalAuthResponse {
  token: string;
  isAdmin: boolean;
  isOwner: boolean;
  staffId: string;
  name: string;
  roleTitle: string;
  permissions: SupportStaffPermission | null;
}

export interface AttachmentUploadPayload {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
}

const USER_TOKEN_KEY = 'wondermc_support_user_token';
const STAFF_TOKEN_KEY = 'wondermc_support_staff_token';
const STAFF_SESSION_KEY = 'wondermc_support_staff_session';

export function getStoredUserToken(): string | null {
  try {
    return sessionStorage.getItem(USER_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredUserToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(USER_TOKEN_KEY, token);
    else sessionStorage.removeItem(USER_TOKEN_KEY);
  } catch {
    // ignore
  }
}

export function getStoredStaffSession(): StaffPortalAuthResponse | null {
  try {
    const token = sessionStorage.getItem(STAFF_TOKEN_KEY);
    const raw = sessionStorage.getItem(STAFF_SESSION_KEY);
    if (!token || !raw) return null;
    return { ...(JSON.parse(raw) as StaffPortalAuthResponse), token };
  } catch {
    return null;
  }
}

export function setStoredStaffSession(session: StaffPortalAuthResponse | null) {
  try {
    if (session) {
      sessionStorage.setItem(STAFF_TOKEN_KEY, session.token);
      sessionStorage.setItem(STAFF_SESSION_KEY, JSON.stringify(session));
    } else {
      sessionStorage.removeItem(STAFF_TOKEN_KEY);
      sessionStorage.removeItem(STAFF_SESSION_KEY);
    }
  } catch {
    // ignore
  }
}

async function apiRequest<T>(
  url: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return data as T;
}

// Persistence is handled by the Express backend writing to Supabase.
// No direct client-side Firestore writes.

export const supportService = {
  async issueUserSession(user: { uid: string; email: string; displayName?: string | null }): Promise<string> {
    const res = await apiRequest<{ token: string }>('/api/support/auth/user-session', {
      method: 'POST',
      body: JSON.stringify({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || user.email?.split('@')[0] || 'Player',
      }),
    });
    setStoredUserToken(res.token);
    return res.token;
  },

  /** Owner credentials are verified exclusively on the backend. */
  async loginOwner(passkey: string): Promise<StaffPortalAuthResponse> {
    const res = await apiRequest<StaffPortalAuthResponse>('/api/admin/auth/owner-login', {
      method: 'POST',
      body: JSON.stringify({ passkey }),
    });
    setStoredStaffSession(res);
    return res;
  },

  /** Sub-admin credentials are verified against Supabase password hashes on the backend. */
  async loginSubAdmin(id: string, password: string): Promise<StaffPortalAuthResponse> {
    const res = await apiRequest<StaffPortalAuthResponse>('/api/admin/auth/subadmin-login', {
      method: 'POST',
      body: JSON.stringify({ id, password }),
    });
    setStoredStaffSession(res);
    return res;
  },

  /**
   * Staff credentials are verified against Supabase passkey hashes on the backend.
   * The frontend no longer sends sub-admin keys or any credential list to the server.
   */
  async loginStaffPortal(passkey: string): Promise<StaffPortalAuthResponse> {
    const res = await apiRequest<StaffPortalAuthResponse>('/api/support/auth/staff-login', {
      method: 'POST',
      body: JSON.stringify({ passkey }),
    });
    setStoredStaffSession(res);
    return res;
  },

  async listTickets(token: string): Promise<SupportTicket[]> {
    const res = await apiRequest<{ tickets: SupportTicket[] }>('/api/support/tickets', {}, token);
    return res.tickets || [];
  },

  async getTicketBundle(token: string, ticketId: string): Promise<SupportTicketDetailBundle> {
    return apiRequest<SupportTicketDetailBundle>(
      `/api/support/tickets/${encodeURIComponent(ticketId)}`,
      {},
      token
    );
  },

  async createTicket(
    token: string,
    input: {
      subject: string;
      category: string;
      priority: string;
      description: string;
      ign?: string;
      attachments?: AttachmentUploadPayload[];
    }
  ): Promise<{ ticket: SupportTicket; attachments: SupportAttachment[] }> {
    const res = await apiRequest<{ ticket: SupportTicket; attachments: SupportAttachment[] }>(
      '/api/support/tickets',
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
      token
    );

    // Persistence handled by backend → Supabase
    return res;
  },

  async postMessage(
    token: string,
    ticketId: string,
    input: {
      message: string;
      isInternal?: boolean;
      attachments?: AttachmentUploadPayload[];
      nextStatus?: SupportTicketStatus;
    }
  ): Promise<{ message: SupportMessage; ticket: SupportTicket; attachments: SupportAttachment[] }> {
    const res = await apiRequest<{
      message: SupportMessage;
      ticket: SupportTicket;
      attachments: SupportAttachment[];
    }>(
      `/api/support/tickets/${encodeURIComponent(ticketId)}/messages`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
      token
    );

    return res;
  },

  async markTicketRead(token: string, ticketId: string): Promise<SupportTicket> {
    const res = await apiRequest<{ ticket: SupportTicket }>(
      `/api/support/tickets/${encodeURIComponent(ticketId)}/read`,
      { method: 'POST', body: JSON.stringify({}) },
      token
    );
    return res.ticket;
  },

  async updateTicketByStaff(
    token: string,
    ticketId: string,
    patch: {
      status?: SupportTicketStatus;
      priority?: SupportTicketPriority;
      assignedStaffId?: string | null;
    }
  ): Promise<SupportTicket> {
    const res = await apiRequest<{ ticket: SupportTicket }>(
      `/api/support/tickets/${encodeURIComponent(ticketId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(patch),
      },
      token
    );
    return res.ticket;
  },

  async deleteTicketByStaff(token: string, ticketId: string): Promise<void> {
    await apiRequest<{ ok: boolean }>(
      `/api/support/tickets/${encodeURIComponent(ticketId)}`,
      { method: 'DELETE' },
      token
    );
  },

  async submitRating(
    token: string,
    ticketId: string,
    stars: number,
    feedback?: string
  ): Promise<SupportRating> {
    const res = await apiRequest<{ rating: SupportRating }>(
      `/api/support/tickets/${encodeURIComponent(ticketId)}/rating`,
      {
        method: 'POST',
        body: JSON.stringify({ stars, feedback }),
      },
      token
    );
    return res.rating;
  },

  async listRatings(token: string): Promise<SupportRating[]> {
    const res = await apiRequest<{ ratings: SupportRating[] }>('/api/support/ratings', {}, token);
    return res.ratings || [];
  },

  async listNotifications(token: string): Promise<SupportNotification[]> {
    const res = await apiRequest<{ notifications: SupportNotification[] }>(
      '/api/support/notifications',
      {},
      token
    );
    return res.notifications || [];
  },

  async markNotificationsRead(token: string, ids?: string[]): Promise<void> {
    await apiRequest<{ ok: boolean }>(
      '/api/support/notifications/mark-read',
      { method: 'POST', body: JSON.stringify({ ids }) },
      token
    );
  },

  async listStaffMembers(token: string): Promise<SupportStaffPermission[]> {
    const res = await apiRequest<{ staffMembers: SupportStaffPermission[] }>(
      '/api/support/staff-members',
      {},
      token
    );
    return res.staffMembers || [];
  },

  async upsertStaffMember(
    token: string,
    member: Partial<SupportStaffPermission> & { name: string; roleTitle: string }
  ): Promise<SupportStaffPermission> {
    const res = await apiRequest<{ member: SupportStaffPermission }>(
      '/api/support/staff-members',
      { method: 'POST', body: JSON.stringify(member) },
      token
    );
    return res.member;
  },

  async deleteStaffMember(token: string, staffId: string): Promise<void> {
    await apiRequest<{ ok: boolean }>(
      `/api/support/staff-members/${encodeURIComponent(staffId)}`,
      { method: 'DELETE' },
      token
    );
  },

  async getDiscordConfig(token: string): Promise<DiscordSupportConfigPublic> {
    const res = await apiRequest<{ config: DiscordSupportConfigPublic }>(
      '/api/support/discord-config',
      {},
      token
    );
    return res.config;
  },

  async updateDiscordConfig(
    token: string,
    patch: {
      webhookUrl?: string;
      clearWebhook?: boolean;
      enabled?: boolean;
      botName?: string;
      avatarUrl?: string;
      pingRole?: string;
      notifyOnNewTicket?: boolean;
      notifyOnImportantUpdate?: boolean;
    }
  ): Promise<DiscordSupportConfigPublic> {
    const res = await apiRequest<{ config: DiscordSupportConfigPublic }>(
      '/api/support/discord-config',
      { method: 'POST', body: JSON.stringify(patch) },
      token
    );
    return res.config;
  },

  async testDiscordWebhook(token: string, webhookUrl?: string): Promise<void> {
    await apiRequest<{ ok: boolean }>(
      '/api/support/discord-config/test',
      { method: 'POST', body: JSON.stringify({ webhookUrl }) },
      token
    );
  },

  openRealtimeStream(token: string, onEvent: (ev: { type: string; ticketId?: string }) => void): () => void {
    const url = `/api/support/stream?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    const handler = (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data);
        onEvent(parsed);
      } catch {
        // ignore
      }
    };
    const errorHandler = () => {
      if (es.readyState === EventSource.CLOSED) {
        es.close();
      }
    };
    es.addEventListener('support', handler as EventListener);
    es.addEventListener('error', errorHandler);
    return () => {
      es.removeEventListener('support', handler as EventListener);
      es.removeEventListener('error', errorHandler);
      es.close();
    };
  },
};

export function readFileAsAttachmentPayload(file: File): Promise<AttachmentUploadPayload> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        dataUrl: reader.result as string,
      });
    };
    reader.onerror = () => reject(new Error(`Failed to read file "${file.name}"`));
    reader.readAsDataURL(file);
  });
}
