import type {
  DonationAuditLog,
  DonationDashboardStats,
  DonationEdition,
  DonationRequest,
  DonationRewardDeliveryStatus,
  DonationRewardTier,
  DonationSettings,
  DonatorLeaderboardPeriod,
  ManualDonatorLeaderboardEntry,
  PublicDonatorLeaderboardRow,
} from '../types';

export interface PublicDonationOverviewResponse {
  settings: DonationSettings;
  rewards: DonationRewardTier[];
  leaderboardAllTime: PublicDonatorLeaderboardRow[];
  leaderboardMonthly: PublicDonatorLeaderboardRow[];
}

export interface AdminDonationOverviewResponse {
  requests: DonationRequest[];
  leaderboard: ManualDonatorLeaderboardEntry[];
  leaderboardAllTime: PublicDonatorLeaderboardRow[];
  leaderboardMonthly: PublicDonatorLeaderboardRow[];
  rewards: DonationRewardTier[];
  settings: DonationSettings;
  stats: DonationDashboardStats;
  auditLogs: DonationAuditLog[];
}

function getAdminHeaders(tokenOverride?: string): Record<string, string> {
  const token =
    tokenOverride ||
    (typeof window !== 'undefined'
      ? sessionStorage.getItem('wondermc_admin_auth_token') ||
        sessionStorage.getItem('wondermc_staff_token') ||
        ''
      : '');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function parseJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const donationService = {
  async getPublicOverview(): Promise<PublicDonationOverviewResponse> {
    const res = await fetch('/api/donations/overview');
    return parseJson<PublicDonationOverviewResponse>(res);
  },

  async submitDonation(payload: {
    username: string;
    edition: DonationEdition;
    amount: number;
    utr: string;
    screenshotUrl: string;
    message?: string;
  }): Promise<{ request: DonationRequest; message: string }> {
    const res = await fetch('/api/donations/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return parseJson<{ request: DonationRequest; message: string }>(res);
  },

  // ==================== ADMIN ====================
  async getAdminOverview(token?: string): Promise<AdminDonationOverviewResponse> {
    const res = await fetch('/api/admin/donations/overview', {
      headers: getAdminHeaders(token),
    });
    return parseJson<AdminDonationOverviewResponse>(res);
  },

  async approveRequest(
    requestId: string,
    remarks?: string,
    token?: string
  ): Promise<{ request: DonationRequest }> {
    const res = await fetch(`/api/admin/donations/requests/${encodeURIComponent(requestId)}/approve`, {
      method: 'POST',
      headers: getAdminHeaders(token),
      body: JSON.stringify({ remarks }),
    });
    return parseJson<{ request: DonationRequest }>(res);
  },

  async rejectRequest(
    requestId: string,
    remarks?: string,
    token?: string
  ): Promise<{ request: DonationRequest }> {
    const res = await fetch(`/api/admin/donations/requests/${encodeURIComponent(requestId)}/reject`, {
      method: 'POST',
      headers: getAdminHeaders(token),
      body: JSON.stringify({ remarks }),
    });
    return parseJson<{ request: DonationRequest }>(res);
  },

  async updateRewardDeliveryStatus(
    requestId: string,
    rewardStatus: DonationRewardDeliveryStatus,
    token?: string
  ): Promise<{ request: DonationRequest }> {
    const res = await fetch(
      `/api/admin/donations/requests/${encodeURIComponent(requestId)}/reward-status`,
      {
        method: 'POST',
        headers: getAdminHeaders(token),
        body: JSON.stringify({ rewardStatus }),
      }
    );
    return parseJson<{ request: DonationRequest }>(res);
  },

  async deleteRequest(requestId: string, token?: string): Promise<{ success: boolean }> {
    const res = await fetch(`/api/admin/donations/requests/${encodeURIComponent(requestId)}`, {
      method: 'DELETE',
      headers: getAdminHeaders(token),
    });
    return parseJson<{ success: boolean }>(res);
  },

  async saveLeaderboardEntry(
    entry: {
      id?: string;
      username: string;
      edition: DonationEdition;
      amount: number;
      badge?: string;
      avatarUrl?: string;
      period?: DonatorLeaderboardPeriod;
      position?: number;
    },
    token?: string
  ): Promise<{ entry: ManualDonatorLeaderboardEntry }> {
    const res = await fetch('/api/admin/donations/leaderboard', {
      method: 'POST',
      headers: getAdminHeaders(token),
      body: JSON.stringify(entry),
    });
    return parseJson<{ entry: ManualDonatorLeaderboardEntry }>(res);
  },

  async deleteLeaderboardEntry(entryId: string, token?: string): Promise<{ success: boolean }> {
    const res = await fetch(`/api/admin/donations/leaderboard/${encodeURIComponent(entryId)}`, {
      method: 'DELETE',
      headers: getAdminHeaders(token),
    });
    return parseJson<{ success: boolean }>(res);
  },

  async reorderLeaderboard(
    orderedIds: string[],
    token?: string
  ): Promise<{ leaderboard: ManualDonatorLeaderboardEntry[] }> {
    const res = await fetch('/api/admin/donations/leaderboard/reorder', {
      method: 'POST',
      headers: getAdminHeaders(token),
      body: JSON.stringify({ orderedIds }),
    });
    return parseJson<{ leaderboard: ManualDonatorLeaderboardEntry[] }>(res);
  },

  async saveRewardTier(
    tier: Partial<DonationRewardTier> & { name: string; minAmount: number },
    token?: string
  ): Promise<{ reward: DonationRewardTier }> {
    const res = await fetch('/api/admin/donations/rewards', {
      method: 'POST',
      headers: getAdminHeaders(token),
      body: JSON.stringify(tier),
    });
    return parseJson<{ reward: DonationRewardTier }>(res);
  },

  async deleteRewardTier(rewardId: string, token?: string): Promise<{ success: boolean }> {
    const res = await fetch(`/api/admin/donations/rewards/${encodeURIComponent(rewardId)}`, {
      method: 'DELETE',
      headers: getAdminHeaders(token),
    });
    return parseJson<{ success: boolean }>(res);
  },

  async updateSettings(
    partial: Partial<DonationSettings>,
    token?: string
  ): Promise<{ settings: DonationSettings }> {
    const res = await fetch('/api/admin/donations/settings', {
      method: 'PUT',
      headers: getAdminHeaders(token),
      body: JSON.stringify(partial),
    });
    return parseJson<{ settings: DonationSettings }>(res);
  },
};
