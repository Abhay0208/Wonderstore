import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDonationIgn,
  validateImagePayload,
  validateDonationSubmission,
  matchRewardTierForAmount,
  buildDonatorLeaderboard,
  computeDonationDashboardStats,
} from '../src/utils/donationHelpers';
import type {
  DonationRequest,
  DonationRewardTier,
  DonationSettings,
  ManualDonatorLeaderboardEntry,
} from '../src/types';

const SAMPLE_PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';

const BASE_SETTINGS: DonationSettings = {
  enabled: true,
  leaderboardEnabled: true,
  rewardsEnabled: true,
  upiId: 'farhanastro@fam',
  upiPayeeName: 'WonderMC Network',
  qrMode: 'dynamic',
  customQrUrl: '',
  instructions: 'Pay via UPI and upload screenshot.',
  minAmount: 0,
  thankYouMessage:
    'Your donation has been submitted successfully. Please wait while our team verifies your payment.',
  rewardsBannerMessage:
    'Support WONDER MC and get exclusive rewards as a thank you for your contribution!',
  updatedAt: '2026-11-16T00:00:00.000Z',
};

const SAMPLE_REWARDS: DonationRewardTier[] = [
  {
    id: 'r1',
    minAmount: 99,
    name: 'Starter Donor Coins',
    description: '25k Coins + flair',
    category: 'Coins',
    badgeLabel: 'Emerald Supporter',
    enabled: true,
    displayOrder: 1,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  },
  {
    id: 'r2',
    minAmount: 500,
    name: 'Royal Donor Rank',
    description: 'Royal Rank + Crown cosmetic',
    category: 'Rank',
    badgeLabel: 'Royal Patron',
    enabled: true,
    displayOrder: 2,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  },
  {
    id: 'r3',
    minAmount: 1000,
    name: 'Disabled VIP Tier',
    description: 'Should not match when disabled',
    category: 'Cosmetics',
    badgeLabel: 'VIP Disabled',
    enabled: false,
    displayOrder: 3,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  },
];

test('Donation IGN formatting supports Java and Bedrock prefix', () => {
  assert.equal(formatDonationIgn('  .Steve_MC  ', 'java'), 'Steve_MC');
  assert.equal(formatDonationIgn('  AlexPE  ', 'bedrock'), '.AlexPE');
  assert.equal(formatDonationIgn('.AlreadyDot', 'bedrock'), '.AlreadyDot');
});

test('Donation image upload validates allowed MIME types and 3MB max size', () => {
  const ok = validateImagePayload(SAMPLE_PNG_1PX, { required: true, label: 'Screenshot' });
  assert.equal(ok.valid, true);

  const badMime = validateImagePayload('data:image/svg+xml;base64,PHN2Zy8+', {
    required: true,
    label: 'Screenshot',
  });
  assert.equal(badMime.valid, false);
  assert.match(badMime.error || '', /not supported/i);

  const hugeBase64 = 'A'.repeat(4_500_000);
  const tooLarge = validateImagePayload(`data:image/png;base64,${hugeBase64}`, {
    required: true,
    label: 'Screenshot',
  });
  assert.equal(tooLarge.valid, false);
  assert.match(tooLarge.error || '', /3 MB/i);
});

test('Custom any donation amount works without fixed plans and enforces optional minAmount', () => {
  const customSmall = validateDonationSubmission(
    {
      username: 'PlayerOne',
      edition: 'java',
      amount: 17,
      utr: 'UTR123456789',
      screenshotUrl: SAMPLE_PNG_1PX,
      message: 'Keep up the good work!',
    },
    BASE_SETTINGS,
    []
  );
  assert.equal(customSmall.valid, true);
  assert.equal(customSmall.normalized?.amount, 17);

  const enforcedMin = validateDonationSubmission(
    {
      username: 'PlayerOne',
      edition: 'java',
      amount: 50,
      utr: 'UTR987654321',
      screenshotUrl: SAMPLE_PNG_1PX,
    },
    { ...BASE_SETTINGS, minAmount: 100 },
    []
  );
  assert.equal(enforcedMin.valid, false);
  assert.match(enforcedMin.error || '', /Minimum donation amount is ₹100/);
});

test('Duplicate UTR is rejected unless previous attempt was REJECTED', () => {
  const existing: DonationRequest[] = [
    {
      id: 'don-1',
      referenceNumber: 'DON-0001',
      username: 'Hero1',
      edition: 'java',
      amount: 250,
      utr: 'UTR55667788',
      screenshotUrl: SAMPLE_PNG_1PX,
      message: '',
      status: 'PENDING',
      rewardStatus: 'PENDING',
      createdAt: '2026-11-16T01:00:00.000Z',
    },
    {
      id: 'don-2',
      referenceNumber: 'DON-0002',
      username: 'Hero2',
      edition: 'java',
      amount: 300,
      utr: 'UTRREJECT99',
      screenshotUrl: SAMPLE_PNG_1PX,
      message: '',
      status: 'REJECTED',
      rewardStatus: 'PENDING',
      createdAt: '2026-11-16T01:00:00.000Z',
    },
  ];

  const dup = validateDonationSubmission(
    {
      username: 'Hero3',
      edition: 'java',
      amount: 250,
      utr: 'utr55667788',
      screenshotUrl: SAMPLE_PNG_1PX,
    },
    BASE_SETTINGS,
    existing
  );
  assert.equal(dup.valid, false);
  assert.match(dup.error || '', /Duplicate transactions are not allowed/);

  const retryRejected = validateDonationSubmission(
    {
      username: 'Hero2',
      edition: 'java',
      amount: 300,
      utr: 'UTRREJECT99',
      screenshotUrl: SAMPLE_PNG_1PX,
    },
    BASE_SETTINGS,
    existing
  );
  assert.equal(retryRejected.valid, true);
});

test('Reward tier matching selects highest enabled tier <= amount', () => {
  assert.equal(matchRewardTierForAmount(50, SAMPLE_REWARDS), null);
  assert.equal(matchRewardTierForAmount(250, SAMPLE_REWARDS)?.id, 'r1');
  // r3 (1000) is disabled, so 1500 should match r2 (500)
  assert.equal(matchRewardTierForAmount(1500, SAMPLE_REWARDS)?.id, 'r2');
});

test('Leaderboard excludes PENDING/REJECTED requests, combines APPROVED + manual entries, and respects manual positions', () => {
  const now = new Date('2026-11-16T12:00:00.000Z');
  const donations: DonationRequest[] = [
    {
      id: 'd1',
      referenceNumber: 'DON-1',
      username: 'PendingPlayer',
      edition: 'java',
      amount: 9999,
      utr: 'PEND111111',
      screenshotUrl: SAMPLE_PNG_1PX,
      message: '',
      status: 'PENDING',
      rewardStatus: 'PENDING',
      createdAt: '2026-11-16T10:00:00.000Z',
    },
    {
      id: 'd2',
      referenceNumber: 'DON-2',
      username: 'ApprovedCurrent',
      edition: 'java',
      amount: 650,
      utr: 'APPR222222',
      screenshotUrl: SAMPLE_PNG_1PX,
      message: '',
      status: 'APPROVED',
      rewardStatus: 'PENDING',
      reviewedAt: '2026-11-16T11:00:00.000Z',
      createdAt: '2026-11-16T10:30:00.000Z',
    },
    {
      id: 'd3',
      referenceNumber: 'DON-3',
      username: 'ApprovedLastMonth',
      edition: 'java',
      amount: 1200,
      utr: 'APPR333333',
      screenshotUrl: SAMPLE_PNG_1PX,
      message: '',
      status: 'APPROVED',
      rewardStatus: 'DELIVERED',
      reviewedAt: '2026-10-10T11:00:00.000Z',
      createdAt: '2026-10-10T10:30:00.000Z',
    },
  ];

  const manualEntries: ManualDonatorLeaderboardEntry[] = [
    {
      id: 'm1',
      username: 'PinnedPatron',
      edition: 'java',
      amount: 400,
      badge: 'Mythic Donor',
      period: 'both',
      position: 1,
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
    },
  ];

  const allTime = buildDonatorLeaderboard(donations, manualEntries, SAMPLE_REWARDS, 'all_time', now);
  assert.equal(allTime.some((r) => r.username === 'PendingPlayer'), false);
  assert.equal(allTime[0].username, 'PinnedPatron', 'Explicit position #1 takes top rank');
  assert.equal(allTime[1].username, 'ApprovedLastMonth');
  assert.equal(allTime[2].username, 'ApprovedCurrent');
  assert.equal(allTime[2].badge, 'Royal Patron');

  const monthly = buildDonatorLeaderboard(donations, manualEntries, SAMPLE_REWARDS, 'monthly', now);
  assert.equal(monthly.some((r) => r.username === 'ApprovedLastMonth'), false);
  assert.equal(monthly.some((r) => r.username === 'ApprovedCurrent'), true);

  const stats = computeDonationDashboardStats(donations, manualEntries);
  assert.equal(stats.pendingCount, 1);
  assert.equal(stats.approvedCount, 2);
  assert.equal(stats.totalApprovedAmount, 1850);
  assert.equal(stats.pendingRewardsCount, 1);
  assert.equal(stats.deliveredRewardsCount, 1);
  assert.equal(stats.totalUniqueDonors, 3);
});
