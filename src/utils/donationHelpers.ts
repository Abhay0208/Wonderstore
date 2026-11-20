import type {
  DonationDashboardStats,
  DonationEdition,
  DonationRequest,
  DonationRewardTier,
  DonationSettings,
  ManualDonatorLeaderboardEntry,
  PublicDonatorLeaderboardRow,
} from '../types';

export const MAX_DONATION_IMAGE_BYTES = 3 * 1024 * 1024; // 3MB limit
export const ALLOWED_DONATION_IMAGE_MIME = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
] as const;

export const DONATION_BADGE_PRESETS = [
  'Mythic Donor',
  'Royal Patron',
  'Diamond Supporter',
  'Gold Benefactor',
  'Emerald Ally',
  'Supporter',
] as const;

export function formatDonationIgn(username: string, edition: DonationEdition): string {
  const clean = (username || '').trim().replace(/\s+/g, '');
  if (!clean) return '';
  if (edition === 'bedrock') {
    const bare = clean.replace(/^\.+/, '');
    return bare ? `.${bare}` : '';
  }
  return clean.replace(/^\.+/, '');
}

export function normalizeDonorKey(username: string, edition?: DonationEdition): string {
  const bare = (username || '').trim().replace(/^\.+/, '').toLowerCase();
  const ed = edition || ((username || '').trim().startsWith('.') ? 'bedrock' : 'java');
  return `${ed}:${bare}`;
}

export function validateImagePayload(
  imageDataUrl: string | undefined | null,
  options: { required?: boolean; label?: string } = {}
): { valid: boolean; cleaned: string; error?: string } {
  const label = options.label || 'Image';
  const raw = (imageDataUrl || '').trim();
  if (!raw) {
    if (options.required) {
      return { valid: false, cleaned: '', error: `${label} is required.` };
    }
    return { valid: true, cleaned: '' };
  }

  if (raw.startsWith('data:')) {
    const match = raw.match(/^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) {
      return {
        valid: false,
        cleaned: '',
        error: `${label} must be a valid base64 PNG, JPG, or WEBP image.`,
      };
    }
    const mime = match[1].toLowerCase();
    if (!ALLOWED_DONATION_IMAGE_MIME.includes(mime as (typeof ALLOWED_DONATION_IMAGE_MIME)[number])) {
      return {
        valid: false,
        cleaned: '',
        error: `${label} format "${mime}" is not supported. Please upload PNG, JPG, or WEBP.`,
      };
    }
    const base64Body = match[2];
    const padding = base64Body.endsWith('==') ? 2 : base64Body.endsWith('=') ? 1 : 0;
    const approxBytes = Math.floor((base64Body.length * 3) / 4) - padding;
    if (approxBytes <= 0 || approxBytes > MAX_DONATION_IMAGE_BYTES) {
      return {
        valid: false,
        cleaned: '',
        error: `${label} size exceeds the 3 MB limit. Please upload a smaller screenshot.`,
      };
    }
    return { valid: true, cleaned: raw };
  }

  if (/^https?:\/\/\S+$/i.test(raw) || raw.startsWith('/')) {
    return { valid: true, cleaned: raw };
  }

  return {
    valid: false,
    cleaned: '',
    error: `${label} must be an uploaded PNG/JPG/WEBP image.`,
  };
}

export function normalizeUtr(raw: string): string {
  return (raw || '').trim().toUpperCase().replace(/\s+/g, '');
}

export interface DonationSubmitInput {
  username: string;
  edition: DonationEdition;
  amount: number;
  utr: string;
  screenshotUrl: string;
  message?: string;
}

export function validateDonationSubmission(
  input: DonationSubmitInput,
  settings: DonationSettings,
  existingDonations: DonationRequest[]
): {
  valid: boolean;
  error?: string;
  normalized?: {
    username: string;
    edition: DonationEdition;
    amount: number;
    utr: string;
    screenshotUrl: string;
    message: string;
  };
} {
  if (!settings.enabled) {
    return {
      valid: false,
      error: 'Donations are currently paused by the administrator.',
    };
  }

  const edition: DonationEdition = input.edition === 'bedrock' ? 'bedrock' : 'java';
  const formattedIgn = formatDonationIgn(input.username || '', edition);
  const bareIgn = formattedIgn.replace(/^\.+/, '');
  if (bareIgn.length < 2 || bareIgn.length > 24 || !/^[A-Za-z0-9_.-]+$/.test(bareIgn)) {
    return {
      valid: false,
      error: 'Please enter a valid Minecraft username (2–24 characters, letters, numbers, or _).',
    };
  }

  const numericAmount = Math.round(Number(input.amount) * 100) / 100;
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return {
      valid: false,
      error: 'Please enter a valid donation amount greater than ₹0.',
    };
  }

  const minAmt = Number(settings.minAmount || 0);
  if (minAmt > 0 && numericAmount < minAmt) {
    return {
      valid: false,
      error: `Minimum donation amount is ₹${minAmt}.`,
    };
  }

  const cleanUtr = normalizeUtr(input.utr);
  if (cleanUtr.length < 6 || cleanUtr.length > 64 || !/^[A-Z0-9._/-]+$/.test(cleanUtr)) {
    return {
      valid: false,
      error: 'Please enter a valid UPI Transaction ID / UTR (6–64 alphanumeric characters).',
    };
  }

  const duplicateUtr = existingDonations.find(
    (d) => d.status !== 'REJECTED' && normalizeUtr(d.utr) === cleanUtr
  );
  if (duplicateUtr) {
    return {
      valid: false,
      error: `UPI Transaction ID "${cleanUtr}" has already been submitted (${duplicateUtr.referenceNumber}). Duplicate transactions are not allowed.`,
    };
  }

  const imgCheck = validateImagePayload(input.screenshotUrl, {
    required: true,
    label: 'Payment screenshot',
  });
  if (!imgCheck.valid) {
    return { valid: false, error: imgCheck.error };
  }

  const cleanMessage = (input.message || '').trim().slice(0, 500);

  return {
    valid: true,
    normalized: {
      username: formattedIgn,
      edition,
      amount: numericAmount,
      utr: cleanUtr,
      screenshotUrl: imgCheck.cleaned,
      message: cleanMessage,
    },
  };
}

export function matchRewardTierForAmount(
  amount: number,
  rewards: DonationRewardTier[]
): DonationRewardTier | null {
  const numericAmount = Number(amount) || 0;
  if (numericAmount <= 0 || !Array.isArray(rewards)) return null;
  const eligible = rewards
    .filter((r) => r.enabled !== false && numericAmount >= Number(r.minAmount || 0))
    .sort((a, b) => {
      if (b.minAmount !== a.minAmount) return b.minAmount - a.minAmount;
      return (a.displayOrder ?? 0) - (b.displayOrder ?? 0);
    });
  return eligible[0] || null;
}

export function buildDonatorLeaderboard(
  donations: DonationRequest[],
  manualEntries: ManualDonatorLeaderboardEntry[],
  rewards: DonationRewardTier[],
  period: 'all_time' | 'monthly',
  now: Date = new Date()
): PublicDonatorLeaderboardRow[] {
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();

  // Only APPROVED donations count toward the public leaderboard!
  const eligibleApproved = (donations || []).filter((d) => {
    if (d.status !== 'APPROVED') return false;
    if (period === 'all_time') return true;
    const refDate = new Date(d.reviewedAt || d.createdAt);
    if (Number.isNaN(refDate.getTime())) return false;
    return refDate.getUTCFullYear() === currentYear && refDate.getUTCMonth() === currentMonth;
  });

  const combinedMap = new Map<
    string,
    {
      id: string;
      username: string;
      edition: DonationEdition;
      amount: number;
      badge: string;
      avatarUrl?: string;
      hasManual: boolean;
      hasApproved: boolean;
      position?: number;
    }
  >();

  // 1. Seed manual entries for this period
  for (const entry of manualEntries || []) {
    const entryPeriod = entry.period || 'both';
    if (entryPeriod !== 'both' && entryPeriod !== period) continue;
    const key = normalizeDonorKey(entry.username, entry.edition);
    const existing = combinedMap.get(key);
    if (existing) {
      existing.amount = Math.round((existing.amount + Number(entry.amount || 0)) * 100) / 100;
      if (entry.badge) existing.badge = entry.badge;
      if (entry.avatarUrl) existing.avatarUrl = entry.avatarUrl;
      if (typeof entry.position === 'number') existing.position = entry.position;
    } else {
      combinedMap.set(key, {
        id: entry.id,
        username: entry.username,
        edition: entry.edition || 'java',
        amount: Math.round(Number(entry.amount || 0) * 100) / 100,
        badge: entry.badge || 'Supporter',
        avatarUrl: entry.avatarUrl || '',
        hasManual: true,
        hasApproved: false,
        position: typeof entry.position === 'number' ? entry.position : undefined,
      });
    }
  }

  // 2. Accumulate APPROVED donations automatically
  for (const d of eligibleApproved) {
    const key = normalizeDonorKey(d.username, d.edition);
    const existing = combinedMap.get(key);
    const matchedTier = matchRewardTierForAmount(d.amount, rewards);
    const fallbackBadge = matchedTier?.badgeLabel || matchedTier?.name || 'Verified Donator';

    if (existing) {
      existing.amount = Math.round((existing.amount + Number(d.amount || 0)) * 100) / 100;
      existing.hasApproved = true;
      if (!existing.badge) existing.badge = fallbackBadge;
    } else {
      combinedMap.set(key, {
        id: `auto-${key}`,
        username: d.username,
        edition: d.edition,
        amount: Math.round(Number(d.amount || 0) * 100) / 100,
        badge: fallbackBadge,
        avatarUrl: '',
        hasManual: false,
        hasApproved: true,
      });
    }
  }

  // Compute aggregate total to infer badge for accumulated approved donors if needed
  const rows = Array.from(combinedMap.values()).map((item) => {
    let badge = item.badge;
    if (!item.hasManual && item.hasApproved) {
      const totalTier = matchRewardTierForAmount(item.amount, rewards);
      if (totalTier?.badgeLabel) {
        badge = totalTier.badgeLabel;
      } else if (totalTier?.name) {
        badge = totalTier.name;
      }
    }
    return {
      id: item.id,
      rank: 0,
      username: item.username,
      edition: item.edition,
      amount: item.amount,
      badge,
      avatarUrl: item.avatarUrl || undefined,
      source:
        item.hasManual && item.hasApproved
          ? ('combined' as const)
          : item.hasManual
          ? ('manual' as const)
          : ('approved_donation' as const),
      position: item.position,
    };
  });

  // Sort: explicit manual positions first (ascending), otherwise amount descending
  rows.sort((a, b) => {
    const aHasPos = typeof a.position === 'number' && a.position > 0;
    const bHasPos = typeof b.position === 'number' && b.position > 0;
    if (aHasPos && bHasPos && a.position !== b.position) {
      return a.position! - b.position!;
    }
    if (aHasPos && !bHasPos) return -1;
    if (!aHasPos && bHasPos) return 1;
    if (b.amount !== a.amount) return b.amount - a.amount;
    return a.username.localeCompare(b.username);
  });

  return rows.map((row, idx) => ({
    ...row,
    rank: idx + 1,
  }));
}

export function computeDonationDashboardStats(
  donations: DonationRequest[],
  manualEntries: ManualDonatorLeaderboardEntry[]
): DonationDashboardStats {
  let pendingCount = 0;
  let approvedCount = 0;
  let rejectedCount = 0;
  let totalApprovedAmount = 0;
  let pendingRewardsCount = 0;
  let deliveredRewardsCount = 0;
  const uniqueDonorKeys = new Set<string>();

  for (const d of donations || []) {
    if (d.status === 'PENDING') pendingCount++;
    else if (d.status === 'APPROVED') {
      approvedCount++;
      totalApprovedAmount += Number(d.amount || 0);
      uniqueDonorKeys.add(normalizeDonorKey(d.username, d.edition));
      if (d.rewardStatus === 'PENDING') pendingRewardsCount++;
      else if (d.rewardStatus === 'DELIVERED') deliveredRewardsCount++;
    } else if (d.status === 'REJECTED') {
      rejectedCount++;
    }
  }

  for (const m of manualEntries || []) {
    uniqueDonorKeys.add(normalizeDonorKey(m.username, m.edition));
  }

  return {
    totalRequests: (donations || []).length,
    pendingCount,
    approvedCount,
    rejectedCount,
    totalApprovedAmount: Math.round(totalApprovedAmount * 100) / 100,
    totalUniqueDonors: uniqueDonorKeys.size,
    pendingRewardsCount,
    deliveredRewardsCount,
  };
}
