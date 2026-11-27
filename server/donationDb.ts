import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
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
} from '../src/types';
import {
  buildDonatorLeaderboard,
  computeDonationDashboardStats,
  formatDonationIgn,
  matchRewardTierForAmount,
  validateDonationSubmission,
  validateImagePayload,
} from '../src/utils/donationHelpers';

export interface DonationsDbSchema {
  requests: DonationRequest[];
  manual_leaderboard: ManualDonatorLeaderboardEntry[];
  rewards: DonationRewardTier[];
  settings: DonationSettings;
  audit_logs: DonationAuditLog[];
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DONATIONS_DB_FILE = path.join(DATA_DIR, 'donations_db.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto
    .randomBytes(3)
    .toString('hex')
    .toUpperCase()}`;
}

export function createDefaultDonationSettings(): DonationSettings {
  return {
    enabled: true,
    leaderboardEnabled: true,
    rewardsEnabled: true,
    upiId: 'farhanastro@fam',
    upiPayeeName: 'WonderMC Network',
    qrMode: 'dynamic',
    customQrUrl: '',
    instructions:
      'Open any UPI app (Google Pay, PhonePe, Paytm, BHIM), scan the QR code or send directly to our UPI ID, enter your exact donation amount, complete the payment, then upload the payment screenshot and enter your 12-digit UTR below.',
    minAmount: 0,
    thankYouMessage:
      'Your donation has been submitted successfully. Please wait while our team verifies your payment.',
    rewardsBannerMessage:
      'Support WONDER MC and get exclusive rewards as a thank you for your contribution!',
    updatedAt: new Date().toISOString(),
  };
}

function createInitialDb(): DonationsDbSchema {
  const now = new Date().toISOString();

  const rewards: DonationRewardTier[] = [
    {
      id: 'rew-tier-1',
      minAmount: 99,
      name: 'Supporter Starter Kit & 25k Coins',
      description: 'Receive Supporter chat flair, 25,000 in-game coins, and 1x Weekly Donor Kit on Lifesteal.',
      category: 'Coins',
      badgeLabel: 'Emerald Supporter',
      enabled: true,
      displayOrder: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'rew-tier-2',
      minAmount: 299,
      name: 'Noble Donor Keys & Gold Prefix',
      description: 'Unlock 5x Seasonal Keys, [Donor] Gold Prefix across realms, and Priority Queue access.',
      category: 'Keys',
      badgeLabel: 'Gold Benefactor',
      enabled: true,
      displayOrder: 2,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'rew-tier-3',
      minAmount: 599,
      name: 'Royal Patron Rank & Particle Aura',
      description: 'Exclusive Royal Patron Rank, Crown cosmetic aura in lobbies, and custom /nick privileges.',
      category: 'Rank',
      badgeLabel: 'Royal Patron',
      enabled: true,
      displayOrder: 3,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'rew-tier-4',
      minAmount: 1199,
      name: 'Mythic Donor Crown & Network Cosmetics',
      description: 'Full Mythic Donor Rank, custom animated join message, all lobby pets & golden wings cosmetic.',
      category: 'Cosmetics',
      badgeLabel: 'Mythic Donor',
      enabled: true,
      displayOrder: 4,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const manual_leaderboard: ManualDonatorLeaderboardEntry[] = [
    {
      id: 'man-top-1',
      username: 'ItzAarav_OP',
      edition: 'java',
      amount: 2499,
      badge: 'Mythic Donor',
      period: 'both',
      position: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'man-top-2',
      username: 'ShadowSlayerIN',
      edition: 'java',
      amount: 1499,
      badge: 'Royal Patron',
      period: 'both',
      position: 2,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'man-top-3',
      username: '.BedrockKing99',
      edition: 'bedrock',
      amount: 899,
      badge: 'Diamond Supporter',
      period: 'both',
      position: 3,
      createdAt: now,
      updatedAt: now,
    },
  ];

  return {
    requests: [],
    manual_leaderboard,
    rewards,
    settings: createDefaultDonationSettings(),
    audit_logs: [],
  };
}

class DonationDatabase {
  private cache: DonationsDbSchema | null = null;

  private load(): DonationsDbSchema {
    if (this.cache) return this.cache;
    ensureDataDir();

    try {
      if (!fs.existsSync(DONATIONS_DB_FILE)) {
        const init = createInitialDb();
        this.save(init);
        return init;
      }
      const raw = fs.readFileSync(DONATIONS_DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<DonationsDbSchema>;
      const defaults = createDefaultDonationSettings();
      const hydrated: DonationsDbSchema = {
        requests: Array.isArray(parsed.requests) ? parsed.requests : [],
        manual_leaderboard: Array.isArray(parsed.manual_leaderboard) ? parsed.manual_leaderboard : [],
        rewards: Array.isArray(parsed.rewards) ? parsed.rewards : [],
        settings:
          parsed.settings && typeof parsed.settings === 'object'
            ? { ...defaults, ...parsed.settings }
            : defaults,
        audit_logs: Array.isArray(parsed.audit_logs) ? parsed.audit_logs : [],
      };
      this.cache = hydrated;
      return hydrated;
    } catch {
      const init = createInitialDb();
      this.save(init);
      return init;
    }
  }

  private save(data: DonationsDbSchema): void {
    ensureDataDir();
    this.cache = data;
    const tmp = `${DONATIONS_DB_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmp, DONATIONS_DB_FILE);
  }

  private recordAudit(
    db: DonationsDbSchema,
    adminName: string,
    action: string,
    targetId: string | undefined,
    details: string
  ) {
    db.audit_logs.unshift({
      id: genId('DON-AUD'),
      adminName: adminName || 'Admin',
      action,
      targetId,
      details,
      timestamp: new Date().toISOString(),
    });
    if (db.audit_logs.length > 500) {
      db.audit_logs = db.audit_logs.slice(0, 500);
    }
  }

  // ==================== PUBLIC ENDPOINTS ====================
  getPublicOverview(): {
    settings: DonationSettings;
    rewards: DonationRewardTier[];
    leaderboardAllTime: PublicDonatorLeaderboardRow[];
    leaderboardMonthly: PublicDonatorLeaderboardRow[];
  } {
    const db = this.load();
    const enabledRewards = [...db.rewards]
      .filter((r) => r.enabled !== false)
      .sort((a, b) => a.minAmount - b.minAmount || a.displayOrder - b.displayOrder);

    const leaderboardAllTime = db.settings.leaderboardEnabled
      ? buildDonatorLeaderboard(db.requests, db.manual_leaderboard, db.rewards, 'all_time')
      : [];
    const leaderboardMonthly = db.settings.leaderboardEnabled
      ? buildDonatorLeaderboard(db.requests, db.manual_leaderboard, db.rewards, 'monthly')
      : [];

    return {
      settings: db.settings,
      rewards: db.settings.rewardsEnabled ? enabledRewards : [],
      leaderboardAllTime,
      leaderboardMonthly,
    };
  }

  submitDonationRequest(input: {
    username: string;
    edition: DonationEdition;
    amount: number;
    utr: string;
    screenshotUrl: string;
    message?: string;
  }): { request: DonationRequest; message: string } {
    const db = this.load();
    const validation = validateDonationSubmission(input, db.settings, db.requests);
    if (!validation.valid || !validation.normalized) {
      throw new Error(validation.error || 'Invalid donation submission.');
    }

    const norm = validation.normalized;
    const now = new Date().toISOString();
    const matchedReward = db.settings.rewardsEnabled
      ? matchRewardTierForAmount(norm.amount, db.rewards)
      : null;

    const record: DonationRequest = {
      id: genId('DON'),
      referenceNumber: `DON-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${crypto
        .randomBytes(2)
        .toString('hex')
        .toUpperCase()}`,
      username: norm.username,
      edition: norm.edition,
      amount: norm.amount,
      utr: norm.utr,
      screenshotUrl: norm.screenshotUrl,
      message: norm.message || undefined,
      status: 'PENDING', // Strict: never auto-approved
      rewardId: matchedReward?.id,
      rewardName: matchedReward?.name,
      rewardCategory: matchedReward?.category,
      rewardStatus: matchedReward ? 'PENDING' : 'NONE',
      createdAt: now,
    };

    db.requests.unshift(record);
    this.save(db);

    return {
      request: record,
      message:
        db.settings.thankYouMessage ||
        'Your donation has been submitted successfully. Please wait while our team verifies your payment.',
    };
  }

  // ==================== ADMIN OVERVIEW & REQUESTS ====================
  getAdminOverview(): {
    requests: DonationRequest[];
    leaderboard: ManualDonatorLeaderboardEntry[];
    leaderboardAllTime: PublicDonatorLeaderboardRow[];
    leaderboardMonthly: PublicDonatorLeaderboardRow[];
    rewards: DonationRewardTier[];
    settings: DonationSettings;
    stats: DonationDashboardStats;
    auditLogs: DonationAuditLog[];
  } {
    const db = this.load();
    return {
      requests: db.requests,
      leaderboard: [...db.manual_leaderboard].sort((a, b) => {
        const aPos = a.position ?? 9999;
        const bPos = b.position ?? 9999;
        if (aPos !== bPos) return aPos - bPos;
        return b.amount - a.amount;
      }),
      leaderboardAllTime: buildDonatorLeaderboard(db.requests, db.manual_leaderboard, db.rewards, 'all_time'),
      leaderboardMonthly: buildDonatorLeaderboard(db.requests, db.manual_leaderboard, db.rewards, 'monthly'),
      rewards: [...db.rewards].sort((a, b) => a.minAmount - b.minAmount || a.displayOrder - b.displayOrder),
      settings: db.settings,
      stats: computeDonationDashboardStats(db.requests, db.manual_leaderboard),
      auditLogs: db.audit_logs.slice(0, 150),
    };
  }

  approveDonationRequest(
    requestId: string,
    remarks: string | undefined,
    adminName = 'Admin'
  ): DonationRequest {
    const db = this.load();
    const target = db.requests.find((r) => r.id === requestId);
    if (!target) throw new Error('Donation request not found.');

    const now = new Date().toISOString();
    target.status = 'APPROVED';
    target.adminRemarks = (remarks || '').trim() || undefined;
    target.reviewedAt = now;
    target.reviewedBy = adminName;

    this.recordAudit(
      db,
      adminName,
      'DONATION_APPROVED',
      target.id,
      `Approved ${target.referenceNumber} from ${target.username} (${target.edition}) for ₹${target.amount} [UTR: ${target.utr}]`
    );
    this.save(db);
    return target;
  }

  rejectDonationRequest(
    requestId: string,
    remarks: string | undefined,
    adminName = 'Admin'
  ): DonationRequest {
    const db = this.load();
    const target = db.requests.find((r) => r.id === requestId);
    if (!target) throw new Error('Donation request not found.');

    const now = new Date().toISOString();
    target.status = 'REJECTED';
    target.adminRemarks = (remarks || '').trim() || 'Payment verification failed.';
    target.reviewedAt = now;
    target.reviewedBy = adminName;

    this.recordAudit(
      db,
      adminName,
      'DONATION_REJECTED',
      target.id,
      `Rejected ${target.referenceNumber} from ${target.username} for ₹${target.amount}. Remarks: ${target.adminRemarks}`
    );
    this.save(db);
    return target;
  }

  updateDonationRewardStatus(
    requestId: string,
    rewardStatus: DonationRewardDeliveryStatus,
    adminName = 'Admin'
  ): DonationRequest {
    const db = this.load();
    const target = db.requests.find((r) => r.id === requestId);
    if (!target) throw new Error('Donation request not found.');
    if (!['NONE', 'PENDING', 'DELIVERED'].includes(rewardStatus)) {
      throw new Error('Invalid reward delivery status.');
    }
    target.rewardStatus = rewardStatus;
    this.recordAudit(
      db,
      adminName,
      'DONATION_REWARD_STATUS',
      target.id,
      `Marked reward status for ${target.referenceNumber} (${target.username}) as ${rewardStatus}`
    );
    this.save(db);
    return target;
  }

  deleteDonationRequest(requestId: string, adminName = 'Admin'): boolean {
    const db = this.load();
    const target = db.requests.find((r) => r.id === requestId);
    if (!target) return false;
    db.requests = db.requests.filter((r) => r.id !== requestId);
    this.recordAudit(
      db,
      adminName,
      'DONATION_DELETED',
      requestId,
      `Deleted donation record ${target.referenceNumber} (${target.username}, ₹${target.amount})`
    );
    this.save(db);
    return true;
  }

  // ==================== MANUAL LEADERBOARD MANAGEMENT ====================
  saveManualLeaderboardEntry(
    input: {
      id?: string;
      username: string;
      edition: DonationEdition;
      amount: number;
      badge?: string;
      avatarUrl?: string;
      period?: DonatorLeaderboardPeriod;
      position?: number;
    },
    adminName = 'Admin'
  ): ManualDonatorLeaderboardEntry {
    const db = this.load();
    const edition: DonationEdition = input.edition === 'bedrock' ? 'bedrock' : 'java';
    const cleanName = formatDonationIgn(input.username || '', edition);
    if (!cleanName || cleanName.replace(/^\.+/, '').length < 2) {
      throw new Error('Donor Minecraft username must be at least 2 characters.');
    }

    const amount = Math.round(Number(input.amount) * 100) / 100;
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error('Donation amount must be 0 or greater.');
    }

    const imgCheck = validateImagePayload(input.avatarUrl, {
      required: false,
      label: 'Donor profile image',
    });
    if (!imgCheck.valid) {
      throw new Error(imgCheck.error || 'Invalid donor profile image.');
    }

    const now = new Date().toISOString();
    const cleanBadge = (input.badge || 'Supporter').trim().slice(0, 40) || 'Supporter';
    const cleanPeriod: DonatorLeaderboardPeriod = ['all_time', 'monthly', 'both'].includes(
      String(input.period)
    )
      ? (input.period as DonatorLeaderboardPeriod)
      : 'both';
    const cleanPosition =
      typeof input.position === 'number' && Number.isFinite(input.position) && input.position > 0
        ? Math.floor(input.position)
        : undefined;

    if (input.id) {
      const idx = db.manual_leaderboard.findIndex((m) => m.id === input.id);
      if (idx >= 0) {
        const updated: ManualDonatorLeaderboardEntry = {
          ...db.manual_leaderboard[idx],
          username: cleanName,
          edition,
          amount,
          badge: cleanBadge,
          avatarUrl: imgCheck.cleaned || undefined,
          period: cleanPeriod,
          position: cleanPosition,
          updatedAt: now,
        };
        db.manual_leaderboard[idx] = updated;
        this.recordAudit(
          db,
          adminName,
          'LEADERBOARD_ENTRY_UPDATED',
          updated.id,
          `Updated manual donor ${updated.username} (₹${updated.amount}, ${updated.badge})`
        );
        this.save(db);
        return updated;
      }
    }

    const created: ManualDonatorLeaderboardEntry = {
      id: genId('DON-LB'),
      username: cleanName,
      edition,
      amount,
      badge: cleanBadge,
      avatarUrl: imgCheck.cleaned || undefined,
      period: cleanPeriod,
      position: cleanPosition ?? db.manual_leaderboard.length + 1,
      createdAt: now,
      updatedAt: now,
    };
    db.manual_leaderboard.push(created);
    this.recordAudit(
      db,
      adminName,
      'LEADERBOARD_ENTRY_CREATED',
      created.id,
      `Added manual donor ${created.username} (₹${created.amount}, ${created.badge})`
    );
    this.save(db);
    return created;
  }

  deleteManualLeaderboardEntry(entryId: string, adminName = 'Admin'): boolean {
    const db = this.load();
    const target = db.manual_leaderboard.find((m) => m.id === entryId);
    if (!target) return false;
    db.manual_leaderboard = db.manual_leaderboard.filter((m) => m.id !== entryId);
    this.recordAudit(
      db,
      adminName,
      'LEADERBOARD_ENTRY_DELETED',
      entryId,
      `Removed manual donor ${target.username} from leaderboard`
    );
    this.save(db);
    return true;
  }

  reorderManualLeaderboard(orderedIds: string[], adminName = 'Admin'): ManualDonatorLeaderboardEntry[] {
    const db = this.load();
    const posMap = new Map<string, number>();
    orderedIds.forEach((id, idx) => posMap.set(id, idx + 1));
    db.manual_leaderboard.forEach((m) => {
      if (posMap.has(m.id)) {
        m.position = posMap.get(m.id)!;
        m.updatedAt = new Date().toISOString();
      }
    });
    db.manual_leaderboard.sort((a, b) => (a.position ?? 9999) - (b.position ?? 9999));
    this.recordAudit(
      db,
      adminName,
      'LEADERBOARD_REORDERED',
      'leaderboard',
      `Reordered ${orderedIds.length} manual leaderboard entries`
    );
    this.save(db);
    return db.manual_leaderboard;
  }

  // ==================== REWARDS TIERS MANAGEMENT ====================
  saveRewardTier(
    input: Partial<DonationRewardTier> & { name: string; minAmount: number },
    adminName = 'Admin'
  ): DonationRewardTier {
    const db = this.load();
    const cleanName = (input.name || '').trim();
    if (!cleanName) throw new Error('Reward tier name is required.');

    const minAmount = Math.round(Number(input.minAmount) * 100) / 100;
    if (!Number.isFinite(minAmount) || minAmount < 0) {
      throw new Error('Minimum donation amount must be 0 or greater.');
    }

    const validCategories = ['Rank', 'Coins', 'Keys', 'Kits', 'Cosmetics', 'Other'];
    const category = validCategories.includes(String(input.category))
      ? (input.category as DonationRewardTier['category'])
      : 'Other';
    const now = new Date().toISOString();

    if (input.id) {
      const idx = db.rewards.findIndex((r) => r.id === input.id);
      if (idx >= 0) {
        const updated: DonationRewardTier = {
          ...db.rewards[idx],
          minAmount,
          name: cleanName,
          description: (input.description || '').trim(),
          category,
          badgeLabel: (input.badgeLabel || '').trim() || undefined,
          enabled: input.enabled !== false,
          displayOrder:
            typeof input.displayOrder === 'number'
              ? input.displayOrder
              : db.rewards[idx].displayOrder,
          updatedAt: now,
        };
        db.rewards[idx] = updated;
        this.recordAudit(
          db,
          adminName,
          'REWARD_TIER_UPDATED',
          updated.id,
          `Updated reward "${updated.name}" (₹${updated.minAmount}+, enabled=${updated.enabled})`
        );
        this.save(db);
        return updated;
      }
    }

    const created: DonationRewardTier = {
      id: genId('DON-REW'),
      minAmount,
      name: cleanName,
      description: (input.description || '').trim(),
      category,
      badgeLabel: (input.badgeLabel || '').trim() || undefined,
      enabled: input.enabled !== false,
      displayOrder: db.rewards.length + 1,
      createdAt: now,
      updatedAt: now,
    };
    db.rewards.push(created);
    this.recordAudit(
      db,
      adminName,
      'REWARD_TIER_CREATED',
      created.id,
      `Created reward "${created.name}" for ₹${created.minAmount}+ donations`
    );
    this.save(db);
    return created;
  }

  deleteRewardTier(rewardId: string, adminName = 'Admin'): boolean {
    const db = this.load();
    const target = db.rewards.find((r) => r.id === rewardId);
    if (!target) return false;
    db.rewards = db.rewards.filter((r) => r.id !== rewardId);
    this.recordAudit(
      db,
      adminName,
      'REWARD_TIER_DELETED',
      rewardId,
      `Deleted reward tier "${target.name}"`
    );
    this.save(db);
    return true;
  }

  // ==================== DONATION SETTINGS ====================
  updateSettings(
    partial: Partial<DonationSettings>,
    adminName = 'Admin'
  ): DonationSettings {
    const db = this.load();
    const current = db.settings;

    if (partial.customQrUrl !== undefined) {
      const qrCheck = validateImagePayload(partial.customQrUrl, {
        required: false,
        label: 'Custom QR Code image',
      });
      if (!qrCheck.valid) {
        throw new Error(qrCheck.error || 'Invalid QR Code image.');
      }
      partial.customQrUrl = qrCheck.cleaned;
    }

    const minAmount =
      partial.minAmount !== undefined
        ? Math.max(0, Math.round(Number(partial.minAmount || 0) * 100) / 100)
        : current.minAmount;

    if (partial.upiId !== undefined && !partial.upiId.trim()) {
      throw new Error('UPI ID cannot be empty.');
    }

    const updated: DonationSettings = {
      ...current,
      enabled: partial.enabled !== undefined ? Boolean(partial.enabled) : current.enabled,
      leaderboardEnabled:
        partial.leaderboardEnabled !== undefined
          ? Boolean(partial.leaderboardEnabled)
          : current.leaderboardEnabled,
      rewardsEnabled:
        partial.rewardsEnabled !== undefined
          ? Boolean(partial.rewardsEnabled)
          : current.rewardsEnabled,
      upiId: partial.upiId !== undefined ? partial.upiId.trim() : current.upiId,
      upiPayeeName:
        partial.upiPayeeName !== undefined
          ? partial.upiPayeeName.trim() || 'WonderMC Network'
          : current.upiPayeeName,
      qrMode: partial.qrMode === 'custom' ? 'custom' : partial.qrMode === 'dynamic' ? 'dynamic' : current.qrMode,
      customQrUrl:
        partial.customQrUrl !== undefined ? partial.customQrUrl : current.customQrUrl,
      instructions:
        partial.instructions !== undefined ? partial.instructions.trim() : current.instructions,
      minAmount,
      thankYouMessage:
        partial.thankYouMessage !== undefined
          ? partial.thankYouMessage.trim() || createDefaultDonationSettings().thankYouMessage
          : current.thankYouMessage,
      rewardsBannerMessage:
        partial.rewardsBannerMessage !== undefined
          ? partial.rewardsBannerMessage.trim() ||
            createDefaultDonationSettings().rewardsBannerMessage
          : current.rewardsBannerMessage,
      updatedAt: new Date().toISOString(),
    };

    db.settings = updated;
    this.recordAudit(
      db,
      adminName,
      'DONATION_SETTINGS_UPDATED',
      'settings',
      `Updated donation settings (enabled=${updated.enabled}, leaderboard=${updated.leaderboardEnabled}, rewards=${updated.rewardsEnabled}, min=₹${updated.minAmount}, upi=${updated.upiId})`
    );
    this.save(db);
    return updated;
  }
}

export const donationDb = new DonationDatabase();
