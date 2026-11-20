import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  SupportTicket,
  SupportNotification,
  SupportRating,
  SupportStaffPermission,
  SupportTicketDetailBundle,
  DiscordSupportConfigPublic,
  SupportTicketPriority,
  SupportTicketStatus,
  SubAdminKey,
} from '../types';
import { useAuth } from './AuthContext';
import {
  supportService,
  StaffPortalAuthResponse,
  AttachmentUploadPayload,
  getStoredUserToken,
  setStoredUserToken,
  getStoredStaffSession,
  setStoredStaffSession,
} from '../services/supportService';

interface TicketContextType {
  // User-facing support state
  userToken: string | null;
  ensureUserToken: (forceRefresh?: boolean) => Promise<string>;
  invalidateUserToken: () => void;
  userTickets: SupportTicket[];
  userNotifications: SupportNotification[];
  unreadUserNotificationsCount: number;
  isLoadingUserTickets: boolean;
  refreshUserTickets: () => Promise<void>;
  openUserTicketBundle: (ticketId: string) => Promise<SupportTicketDetailBundle>;
  createTicket: (input: {
    subject: string;
    category: string;
    priority: SupportTicketPriority;
    description: string;
    ign?: string;
    attachments?: AttachmentUploadPayload[];
  }) => Promise<SupportTicket>;
  replyAsUser: (
    ticketId: string,
    input: { message: string; attachments?: AttachmentUploadPayload[] }
  ) => Promise<SupportTicketDetailBundle>;
  markUserTicketRead: (ticketId: string) => Promise<void>;
  markUserNotificationsRead: (ids?: string[]) => Promise<void>;
  submitTicketRating: (ticketId: string, stars: number, feedback?: string) => Promise<SupportRating>;

  // Staff & Admin portal state
  staffSession: StaffPortalAuthResponse | null;
  staffTickets: SupportTicket[];
  staffNotifications: SupportNotification[];
  unreadStaffNotificationsCount: number;
  staffMembers: SupportStaffPermission[];
  ratings: SupportRating[];
  discordConfig: DiscordSupportConfigPublic | null;
  isLoadingStaffTickets: boolean;
  loginStaffSession: (passkey: string, subAdminKeys?: SubAdminKey[]) => Promise<StaffPortalAuthResponse>;
  logoutStaffSession: () => void;
  refreshStaffData: () => Promise<void>;
  openStaffTicketBundle: (ticketId: string) => Promise<SupportTicketDetailBundle>;
  replyAsStaff: (
    ticketId: string,
    input: {
      message: string;
      isInternal?: boolean;
      attachments?: AttachmentUploadPayload[];
      nextStatus?: SupportTicketStatus;
    }
  ) => Promise<SupportTicketDetailBundle>;
  updateTicketByStaff: (
    ticketId: string,
    patch: { status?: SupportTicketStatus; priority?: SupportTicketPriority; assignedStaffId?: string | null }
  ) => Promise<SupportTicket>;
  deleteTicketByStaff: (ticketId: string) => Promise<void>;
  markStaffNotificationsRead: (ids?: string[]) => Promise<void>;
  upsertStaffMember: (
    member: Partial<SupportStaffPermission> & { name: string; roleTitle: string }
  ) => Promise<SupportStaffPermission>;
  deleteStaffMember: (staffId: string) => Promise<void>;
  saveDiscordConfig: (patch: {
    webhookUrl?: string;
    clearWebhook?: boolean;
    enabled?: boolean;
    botName?: string;
    avatarUrl?: string;
    pingRole?: string;
    notifyOnNewTicket?: boolean;
    notifyOnImportantUpdate?: boolean;
  }) => Promise<DiscordSupportConfigPublic>;
  testDiscordWebhook: (webhookUrl?: string) => Promise<void>;

  // Legacy convenience aliases so existing store helpers compile seamlessly
  tickets: SupportTicket[];
  openTicketsCount: number;
  updateTicketStatus: (id: string, status: SupportTicketStatus) => void;
  updateTicketPriority: (id: string, priority: SupportTicketPriority) => void;
  deleteTicket: (id: string) => void;
}

const TicketContext = createContext<TicketContextType | undefined>(undefined);

function parseTokenPayload(token: string | null): { uid?: string; exp?: number } | null {
  if (!token) return null;
  try {
    const body = token.split('.')[0];
    if (!body) return null;
    const base64 = body.replace(/-/g, '+').replace(/_/g, '/');
    const pad = base64.length % 4 === 0 ? base64 : base64 + '='.repeat(4 - (base64.length % 4));
    const parsed = JSON.parse(atob(pad)) as { uid?: string; exp?: number };
    if (!parsed.exp || parsed.exp <= Date.now() + 15000) return null;
    return parsed;
  } catch {
    return null;
  }
}

export const TicketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  // User state (only keep cached token if non-expired)
  const [userToken, setUserToken] = useState<string | null>(() => {
    const stored = getStoredUserToken();
    return parseTokenPayload(stored) ? stored : null;
  });
  const [userTickets, setUserTickets] = useState<SupportTicket[]>([]);
  const [userNotifications, setUserNotifications] = useState<SupportNotification[]>([]);
  const [isLoadingUserTickets, setIsLoadingUserTickets] = useState(false);
  const tokenRefreshPromiseRef = useRef<Promise<string> | null>(null);

  // Staff / Admin state
  const [staffSession, setStaffSession] = useState<StaffPortalAuthResponse | null>(() =>
    getStoredStaffSession()
  );
  const [staffTickets, setStaffTickets] = useState<SupportTicket[]>([]);
  const [staffNotifications, setStaffNotifications] = useState<SupportNotification[]>([]);
  const [staffMembers, setStaffMembers] = useState<SupportStaffPermission[]>([]);
  const [ratings, setRatings] = useState<SupportRating[]>([]);
  const [discordConfig, setDiscordConfig] = useState<DiscordSupportConfigPublic | null>(null);
  const [isLoadingStaffTickets, setIsLoadingStaffTickets] = useState(false);

  // Active ticket listener callback for real-time open chat threads
  const activeBundleListenersRef = useRef<Set<(ticketId?: string) => void>>(new Set());

  const invalidateUserToken = useCallback(() => {
    setStoredUserToken(null);
    setUserToken(null);
  }, []);

  const ensureUserToken = useCallback(async (forceRefresh = false): Promise<string> => {
    if (!user) throw new Error('Please log in to your account first.');
    if (!forceRefresh && userToken) {
      const parsed = parseTokenPayload(userToken);
      if (parsed && parsed.uid === user.uid) {
        return userToken;
      }
    }
    if (tokenRefreshPromiseRef.current) {
      return tokenRefreshPromiseRef.current;
    }
    const promise = supportService
      .issueUserSession({
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName,
      })
      .then((tk) => {
        setUserToken(tk);
        return tk;
      })
      .finally(() => {
        tokenRefreshPromiseRef.current = null;
      });
    tokenRefreshPromiseRef.current = promise;
    return promise;
  }, [user?.uid, user?.email, user?.displayName, userToken]);

  const refreshUserTickets = useCallback(async (overrideToken?: string) => {
    const tk = overrideToken || userToken;
    if (!tk) return;
    try {
      const [tList, nList] = await Promise.all([
        supportService.listTickets(tk),
        supportService.listNotifications(tk),
      ]);
      setUserTickets(tList);
      setUserNotifications(nList);
    } catch (err: any) {
      if ((err as any)?.status === 401 || String(err?.message || '').includes('401')) {
        setStoredUserToken(null);
        setUserToken(null);
        if (user) {
          void ensureUserToken(true).catch(() => undefined);
        }
      }
    }
  }, [userToken, user, ensureUserToken]);

  const refreshStaffData = useCallback(async (overrideSession?: StaffPortalAuthResponse | null) => {
    const sess = overrideSession ?? staffSession;
    if (!sess?.token) return;
    try {
      const [tList, nList, sMembers, rList, dConfig] = await Promise.all([
        supportService.listTickets(sess.token),
        supportService.listNotifications(sess.token),
        supportService.listStaffMembers(sess.token).catch(() => []),
        supportService.listRatings(sess.token).catch(() => []),
        supportService.getDiscordConfig(sess.token).catch(() => null),
      ]);
      setStaffTickets(tList);
      setStaffNotifications(nList);
      setStaffMembers(sMembers);
      setRatings(rList);
      if (dConfig) setDiscordConfig(dConfig);
    } catch (err: any) {
      if ((err as any)?.status === 401 || String(err?.message || '').includes('401') || String(err?.message || '').includes('403')) {
        setStoredStaffSession(null);
        setStaffSession(null);
      }
    }
  }, [staffSession]);

  // Automatically obtain & refresh user support token on login/logout
  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setStoredUserToken(null);
      setUserToken(null);
      setUserTickets([]);
      setUserNotifications([]);
      return;
    }

    // Clear mismatched user token immediately before issuing fresh session
    setUserToken((prev) => {
      const parsed = parseTokenPayload(prev);
      return parsed && parsed.uid === user.uid ? prev : null;
    });

    setIsLoadingUserTickets(true);
    supportService
      .issueUserSession({
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName,
      })
      .then((tk) => {
        if (cancelled) return;
        setUserToken(tk);
        return refreshUserTickets(tk);
      })
      .catch((err) => {
        console.warn('[Support User Session]', err);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingUserTickets(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.uid, user?.email, user?.displayName]);

  // Real-Time SSE + Reliable Polling Fallback for User Session
  useEffect(() => {
    if (!userToken || !user) return;
    const parsed = parseTokenPayload(userToken);
    if (!parsed || parsed.uid !== user.uid) return;
    const closeStream = supportService.openRealtimeStream(userToken, (ev) => {
      void refreshUserTickets(userToken);
      activeBundleListenersRef.current.forEach((fn) => fn(ev.ticketId));
    });
    const pollId = window.setInterval(() => {
      void refreshUserTickets(userToken);
    }, 6000);
    return () => {
      closeStream();
      window.clearInterval(pollId);
    };
  }, [userToken, user?.uid, refreshUserTickets]);

  // Real-Time SSE + Reliable Polling Fallback for Staff/Admin Session
  useEffect(() => {
    if (!staffSession?.token) return;
    void refreshStaffData(staffSession);
    const closeStream = supportService.openRealtimeStream(staffSession.token, (ev) => {
      void refreshStaffData(staffSession);
      activeBundleListenersRef.current.forEach((fn) => fn(ev.ticketId));
    });
    const pollId = window.setInterval(() => {
      void refreshStaffData(staffSession);
    }, 6000);
    return () => {
      closeStream();
      window.clearInterval(pollId);
    };
  }, [staffSession?.token, refreshStaffData]);

  const openUserTicketBundle = async (ticketId: string): Promise<SupportTicketDetailBundle> => {
    const tk = await ensureUserToken();
    const bundle = await supportService.getTicketBundle(tk, ticketId);
    await supportService.markTicketRead(tk, ticketId).catch(() => undefined);
    void refreshUserTickets(tk);
    return bundle;
  };

  const createTicket: TicketContextType['createTicket'] = async (input) => {
    const tk = await ensureUserToken();
    const { ticket } = await supportService.createTicket(tk, input);
    await refreshUserTickets(tk);
    if (staffSession?.token) void refreshStaffData(staffSession);
    return ticket;
  };

  const replyAsUser: TicketContextType['replyAsUser'] = async (ticketId, input) => {
    const tk = await ensureUserToken();
    await supportService.postMessage(tk, ticketId, { message: input.message, attachments: input.attachments, isInternal: false });
    await refreshUserTickets(tk);
    if (staffSession?.token) void refreshStaffData(staffSession);
    return supportService.getTicketBundle(tk, ticketId);
  };

  const markUserTicketRead = async (ticketId: string) => {
    if (!userToken) return;
    await supportService.markTicketRead(userToken, ticketId).catch(() => undefined);
    await refreshUserTickets(userToken);
  };

  const markUserNotificationsRead = async (ids?: string[]) => {
    if (!userToken) return;
    await supportService.markNotificationsRead(userToken, ids);
    await refreshUserTickets(userToken);
  };

  const submitTicketRating = async (ticketId: string, stars: number, feedback?: string) => {
    const tk = await ensureUserToken();
    const rating = await supportService.submitRating(tk, ticketId, stars, feedback);
    await refreshUserTickets(tk);
    if (staffSession?.token) void refreshStaffData(staffSession);
    return rating;
  };

  // Staff/Admin Operations
  const loginStaffSession = async (passkey: string, subAdminKeys?: SubAdminKey[]) => {
    setIsLoadingStaffTickets(true);
    try {
      const sess = await supportService.loginStaffPortal(passkey, subAdminKeys);
      setStaffSession(sess);
      await refreshStaffData(sess);
      return sess;
    } finally {
      setIsLoadingStaffTickets(false);
    }
  };

  const logoutStaffSession = () => {
    setStoredStaffSession(null);
    setStaffSession(null);
    setStaffTickets([]);
    setStaffNotifications([]);
    setStaffMembers([]);
    setRatings([]);
    setDiscordConfig(null);
  };

  const ensureStaffToken = (): string => {
    if (!staffSession?.token) throw new Error('Staff or Admin authentication required.');
    return staffSession.token;
  };

  const openStaffTicketBundle = async (ticketId: string): Promise<SupportTicketDetailBundle> => {
    const tk = ensureStaffToken();
    const bundle = await supportService.getTicketBundle(tk, ticketId);
    await supportService.markTicketRead(tk, ticketId).catch(() => undefined);
    void refreshStaffData(staffSession);
    return bundle;
  };

  const replyAsStaff: TicketContextType['replyAsStaff'] = async (ticketId, input) => {
    const tk = ensureStaffToken();
    await supportService.postMessage(tk, ticketId, input);
    await refreshStaffData(staffSession);
    if (userToken) void refreshUserTickets(userToken);
    return supportService.getTicketBundle(tk, ticketId);
  };

  const updateTicketByStaff: TicketContextType['updateTicketByStaff'] = async (ticketId, patch) => {
    const tk = ensureStaffToken();
    const updated = await supportService.updateTicketByStaff(tk, ticketId, patch);
    await refreshStaffData(staffSession);
    if (userToken) void refreshUserTickets(userToken);
    return updated;
  };

  const deleteTicketByStaff = async (ticketId: string) => {
    const tk = ensureStaffToken();
    await supportService.deleteTicketByStaff(tk, ticketId);
    await refreshStaffData(staffSession);
    if (userToken) void refreshUserTickets(userToken);
  };

  const markStaffNotificationsRead = async (ids?: string[]) => {
    const tk = ensureStaffToken();
    await supportService.markNotificationsRead(tk, ids);
    await refreshStaffData(staffSession);
  };

  const upsertStaffMember: TicketContextType['upsertStaffMember'] = async (member) => {
    const tk = ensureStaffToken();
    const saved = await supportService.upsertStaffMember(tk, member);
    await refreshStaffData(staffSession);
    return saved;
  };

  const deleteStaffMember = async (staffId: string) => {
    const tk = ensureStaffToken();
    await supportService.deleteStaffMember(tk, staffId);
    await refreshStaffData(staffSession);
  };

  const saveDiscordConfig: TicketContextType['saveDiscordConfig'] = async (patch) => {
    const tk = ensureStaffToken();
    const updated = await supportService.updateDiscordConfig(tk, patch);
    setDiscordConfig(updated);
    return updated;
  };

  const testDiscordWebhook = async (webhookUrl?: string) => {
    const tk = ensureStaffToken();
    await supportService.testDiscordWebhook(tk, webhookUrl);
  };

  // Expose live subscription hook via window event for open modal threads
  useEffect(() => {
    const fn = (ticketId?: string) => {
      window.dispatchEvent(new CustomEvent('wondermc:ticket-realtime', { detail: { ticketId } }));
    };
    activeBundleListenersRef.current.add(fn);
    return () => {
      activeBundleListenersRef.current.delete(fn);
    };
  }, []);

  const unreadUserNotificationsCount = userNotifications.filter((n) => !n.read).length;
  const unreadStaffNotificationsCount = staffNotifications.filter((n) => !n.read).length;
  const openTicketsCount = staffTickets.filter(
    (t) => t.status === 'open' || t.status === 'in_progress' || t.status === 'waiting_for_user'
  ).length;

  return (
    <TicketContext.Provider
      value={{
        userToken,
        ensureUserToken,
        invalidateUserToken,
        userTickets,
        userNotifications,
        unreadUserNotificationsCount,
        isLoadingUserTickets,
        refreshUserTickets,
        openUserTicketBundle,
        createTicket,
        replyAsUser,
        markUserTicketRead,
        markUserNotificationsRead,
        submitTicketRating,

        staffSession,
        staffTickets,
        staffNotifications,
        unreadStaffNotificationsCount,
        staffMembers,
        ratings,
        discordConfig,
        isLoadingStaffTickets,
        loginStaffSession,
        logoutStaffSession,
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

        // Legacy compatibility aliases
        tickets: userTickets,
        openTicketsCount,
        updateTicketStatus: (id, status) => {
          if (staffSession) void updateTicketByStaff(id, { status });
        },
        updateTicketPriority: (id, priority) => {
          if (staffSession) void updateTicketByStaff(id, { priority });
        },
        deleteTicket: (id) => {
          if (staffSession) void deleteTicketByStaff(id);
        },
      }}
    >
      {children}
    </TicketContext.Provider>
  );
};

export const useTickets = () => {
  const context = useContext(TicketContext);
  if (!context) {
    throw new Error('useTickets must be used within a TicketProvider');
  }
  return context;
};
