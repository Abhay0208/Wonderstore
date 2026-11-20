export interface Gamemode {
  id: string;
  name: string;
  active: boolean;
  display_order: number;
}

export type StoreThemeId = 'default' | 'winter' | 'christmas' | 'newyear2027' | 'ramadan';
export type CategoryThemeOption = StoreThemeId | 'auto';

export interface ThemeSettingItem {
  id: StoreThemeId;
  enabled: boolean;
  isDefault?: boolean;
  startDate?: string;
  endDate?: string;
  bannerUrl?: string;
  floatingEmojisEnabled?: boolean;
  floatingEmojis?: string[];
  floatingEmojiDensity?: 'low' | 'normal' | 'high';
  floatingEmojiSpeed?: 'slow' | 'normal' | 'fast';
}

export interface StoreCategory {
  id: string;
  name: string;
  game_mode: string;
  description: string;
  image_url: string;
  icon?: string;
  enabled?: boolean;
  display_order: number;
  theme?: CategoryThemeOption;
}

export interface StoreItem {
  id: string;
  title: string;
  category: string;
  price: number;
  description: string;
  image_url: string;
  display_order?: number;
  discount_percent?: number;
}

export interface CartLine {
  id: string;
  name: string;
  price: number;
  image: string;
  qty: number;
  originalPrice?: number;
  discountPercent?: number;
}

export interface TopBuyer {
  id: string;
  username: string;
  total_spent: number;
  rank?: number;
}

export type StaffRole =
  | 'Owner'
  | 'Co-Owner'
  | 'Manager'
  | 'Senior Admin'
  | 'Admin'
  | 'Junior Admin'
  | 'Developer'
  | 'Senior Moderator'
  | 'Moderator'
  | 'Junior Moderator'
  | 'Helper'
  | 'Staff';

export interface StaffMember {
  id: string;
  name: string;
  role: StaffRole;
  avatar_url?: string;
  description?: string;
  discord_id?: string;
  discord_username?: string;
  discord_url?: string;
}

export interface VoteLink {
  id: string;
  name: string;
  host: string;
  url: string;
}

export interface Coupon {
  id?: string;
  code: string;
  category?: 'normal' | 'private'; // 'normal' = Publicly shown on website, 'private' = Secret code
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  expiryDate?: string;
  usageLimit?: number;
  usedCount?: number;
  enabled?: boolean;
  createdAt?: string;
  percent?: number;
}

export interface StoreSaleConfig {
  pill: string;
  highlight: string;
  text: string;
  percent: number;
  enabled: boolean;
}

export type SupportTicketCategory =
  | 'Technical Support'
  | 'Payment & Billing'
  | 'Minecraft Server Support'
  | 'Account Issues'
  | 'Bug Report'
  | 'Other';

export type SupportTicketPriority = 'low' | 'normal' | 'high' | 'urgent';

export type SupportTicketStatus =
  | 'open'
  | 'in_progress'
  | 'waiting_for_user'
  | 'answered'
  | 'resolved'
  | 'closed';

export type TicketSenderRole = 'user' | 'staff' | 'admin' | 'system';

export interface SupportTicket {
  id: string;
  ticketNumber: string;
  userId: string;
  username: string;
  userEmail: string;
  ign?: string;
  contact?: string;
  discordContact?: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  subject: string;
  description: string;
  /** @deprecated legacy alias kept optional for UI compatibility; prefer description */
  message?: string;
  screenshotUrl?: string;
  status: SupportTicketStatus;
  assignedStaffId?: string;
  assignedStaffName?: string;
  assignedStaffRole?: string;
  createdAt: string;
  updatedAt: string;
  lastReplyAt?: string;
  lastReplyByRole?: TicketSenderRole;
  unreadByUser?: number;
  unreadByStaff?: number;
  attachmentsCount?: number;
  ratingSubmitted?: boolean;
  /** Latest non-internal public summary if any; internal notes NEVER included for users */
  adminNote?: string;
  staffNotes?: string;
}

export interface SupportMessage {
  id: string;
  ticketId: string;
  ticketOwnerId: string;
  senderId: string;
  senderName: string;
  senderRole: TicketSenderRole;
  senderStaffTitle?: string;
  message: string;
  isInternal: boolean;
  attachmentIds?: string[];
  createdAt: string;
}

export interface SupportAttachment {
  id: string;
  ticketId: string;
  ticketOwnerId: string;
  messageId?: string;
  uploaderId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
  createdAt: string;
}

export interface SupportStaffAssignment {
  id: string;
  ticketId: string;
  staffId: string;
  staffName: string;
  staffRole: string;
  assignedBy: string;
  assignedAt: string;
  active: boolean;
}

export type SupportNotificationType =
  | 'new_ticket'
  | 'staff_reply'
  | 'user_reply'
  | 'status_changed'
  | 'resolved'
  | 'closed'
  | 'assigned';

export interface SupportNotification {
  id: string;
  recipientType: 'user' | 'staff' | 'admin';
  recipientId: string;
  ticketId: string;
  ticketNumber: string;
  type: SupportNotificationType;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export interface SupportRating {
  id: string;
  ticketId: string;
  ticketNumber: string;
  userId: string;
  username: string;
  stars: 1 | 2 | 3 | 4 | 5;
  feedback?: string;
  createdAt: string;
}

export interface SupportStaffPermission {
  id: string;
  name: string;
  roleTitle: string;
  passkey?: string;
  email?: string;
  active: boolean;
  canViewAllTickets: boolean;
  canReply: boolean;
  canAssign: boolean;
  canChangeStatus: boolean;
  canAddInternalNotes: boolean;
  canDeleteTickets: boolean;
  updatedAt: string;
}

export interface TicketHistoryEntry {
  id: string;
  ticketId: string;
  actorName: string;
  actorRole: TicketSenderRole;
  action: string;
  details: string;
  createdAt: string;
}

export interface DiscordSupportConfigPublic {
  hasWebhook: boolean;
  webhookPreview: string;
  enabled: boolean;
  botName: string;
  avatarUrl: string;
  pingRole: string;
  notifyOnNewTicket: boolean;
  notifyOnImportantUpdate: boolean;
}

export interface SupportTicketDetailBundle {
  ticket: SupportTicket;
  messages: SupportMessage[];
  attachments: SupportAttachment[];
  assignments: SupportStaffAssignment[];
  rating: SupportRating | null;
  history: TicketHistoryEntry[];
}

export interface Order {
  id: string;
  orderNumber: string;
  ign: string;
  userId: string;
  username?: string;
  email?: string;
  items: CartLine[];
  totalAmount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  paymentMethod?: string;
  paymentGateway?: string;
  paymentType?: PaymentType;
  paymentId?: string;
  walletUsed?: number;
  onlinePaid?: number;
  utr?: string;
  createdAt: string;
  screenshotUrl?: string;
  edition?: string;
}

export type UpdateTag = 'Announcement' | 'Update' | 'Event' | 'Maintenance' | 'Patch Notes';

export interface ServerUpdate {
  id: string;
  title: string;
  content: string;
  imageUrl?: string;
  imageUrls?: string[];
  author: string;
  tag: UpdateTag;
  pinned?: boolean;
  createdAt: string; // ISO string
}

export type AdminTabPermission =
  | 'dashboard'
  | 'users'
  | 'staff'
  | 'supporters'
  | 'products'
  | 'categories'
  | 'themes'
  | 'click_animations'
  | 'discounts'
  | 'tickets'
  | 'updates'
  | 'vote'
  | 'payment'
  | 'wallet'
  | 'payment_management'
  | 'coupon_management'
  | 'passwords'
  | 'settings'
  | 'activity_log'
  | 'guide'
  | 'rules'
  | 'orders'
  | 'donations';

export interface ActivityLog {
  id: string;
  action: string;
  adminName: string;
  details: string;
  timestamp: string;
  type?: 'product' | 'coupon' | 'staff' | 'settings' | 'ticket' | 'sale' | 'wallet' | 'payment' | 'wallet_coupon' | 'other';
}

export interface SubAdminKey {
  id: string;
  name: string;
  password: string;
  permissions: AdminTabPermission[];
  createdAt: string;
}

export interface ActiveAdminSession {
  isOwner: boolean;
  name: string;
  permissions: AdminTabPermission[];
}

export interface ConnectionGuide {
  javaTitle: string;
  javaDescription: string;
  javaSteps: string[];
  bedrockTitle: string;
  bedrockDescription: string;
  bedrockSteps: string[];
}

export interface RuleItem {
  id: string;
  title: string;
  description: string;
}

export interface RuleCategory {
  id: string;
  name: string;
  icon: 'shield' | 'zap' | 'chat' | 'alert';
  rules: RuleItem[];
}

// ==================== WALLET & PAYMENT MANAGEMENT TYPES ====================

export type WalletTransactionType =
  | 'wallet_recharge'
  | 'product_purchase'
  | 'refund'
  | 'admin_credit'
  | 'admin_debit'
  | 'promotional_credit'
  | 'COUPON_REWARD'
  | 'coupon_reward';

export type WalletCouponType = 'single_use' | 'multi_use' | 'user_limited';
export type WalletCouponStatus = 'active' | 'disabled';

export interface WalletCoupon {
  id: string;
  code: string;
  rewardAmount: number;
  couponType: WalletCouponType;
  totalLimit?: number | null;
  perUserLimit?: number;
  redeemedCount: number;
  startDate?: string;
  expiryDate?: string;
  status: WalletCouponStatus;
  description?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WalletCouponRedemption {
  id: string;
  couponId: string;
  couponCode: string;
  userId: string;
  username: string;
  userEmail: string;
  walletId?: string;
  walletTransactionId: string;
  rewardAmount: number;
  previousBalance: number;
  newBalance: number;
  status: 'successful' | 'failed';
  errorMessage?: string;
  createdAt: string;
}

export type WalletTransactionStatus =
  | 'pending'
  | 'processing'
  | 'successful'
  | 'failed'
  | 'cancelled'
  | 'refunded';

export interface UserWallet {
  userId: string;
  username: string;
  email: string;
  balance: number;
  totalCreditsAdded: number;
  totalCreditsSpent: number;
  totalRefunds: number;
  totalPromotionalCredits: number;
  createdAt: string;
  updatedAt: string;
}

export interface WalletTransaction {
  id: string;
  transactionRef: string;
  userId: string;
  type: WalletTransactionType;
  amount: number;
  previousBalance: number;
  updatedBalance: number;
  description: string;
  relatedOrderId?: string;
  paymentId?: string;
  status: WalletTransactionStatus;
  adminId?: string;
  adminName?: string;
  reason?: string;
  createdAt: string;
}

export interface WalletRecharge {
  id: string;
  rechargeRef: string;
  userId: string;
  username: string;
  email: string;
  amount: number;
  credits: number;
  paymentMethod: string;
  paymentGateway: string;
  gatewayOrderId?: string;
  gatewayPaymentId?: string;
  paymentId?: string;
  status: WalletTransactionStatus;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
}

export type PaymentType =
  | 'wallet_recharge'
  | 'direct_product'
  | 'wallet_product'
  | 'combined'
  | 'refund';

export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'successful'
  | 'failed'
  | 'cancelled'
  | 'refunded'
  | 'partially_refunded';

export type GatewayPaymentMethod = 'upi';

export type CheckoutPaymentMode = 'direct_online' | 'full_wallet' | 'combined';

export interface PaymentRecord {
  id: string;
  transactionId: string;
  orderId?: string;
  userId: string;
  username: string;
  email: string;
  productName?: string;
  amount: number;
  walletAmount?: number;
  onlineAmount?: number;
  onlineTransactionId?: string;
  paymentMethod: string;
  paymentGateway: string;
  paymentType: PaymentType;
  status: PaymentStatus;
  gatewayOrderId?: string;
  gatewayReference?: string;
  verifiedByBackend?: boolean;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentRefund {
  id: string;
  refundRef: string;
  paymentId: string;
  orderId?: string;
  userId: string;
  totalRefundAmount: number;
  walletRefundAmount: number;
  onlineRefundAmount: number;
  gatewayRefundId?: string;
  walletTransactionId?: string;
  reason: string;
  adminId: string;
  adminName: string;
  status: 'successful' | 'failed';
  createdAt: string;
}

export interface PaymentDashboardStats {
  totalPayments: number;
  successfulPayments: number;
  pendingPayments: number;
  failedPayments: number;
  refundedPayments: number;
  totalPaymentAmount: number;
  totalWalletRecharges: number;
  totalDirectPayments: number;
  totalCombinedPayments: number;
}

export interface WalletOverviewStats {
  totalWallets: number;
  totalOutstandingBalance: number;
  totalCreditsAdded: number;
  totalCreditsSpent: number;
  totalRefunds: number;
  totalPromotionalCredits: number;
}

export interface PaymentGatewayPublicConfig {
  razorpayEnabled: boolean;
  razorpayMode: 'test' | 'live';
  razorpayConfiguredLive: boolean;
  keyIdPreview: string;
  razorpayPublicKeyId: string;
  hasKeySecret: boolean;
  webhookSecretSet: boolean;
  webhookUrlPath: string;
  upiQrEnabled: boolean;
  supportedMethods: GatewayPaymentMethod[];
  connectionStatus: 'connected_live' | 'connected_test_sandbox' | 'disabled';
  updatedAt: string;
}

export interface GatewayOrderChallenge {
  gateway: 'razorpay';
  mode: 'test' | 'live';
  isExternalRazorpay: boolean;
  keyId: string;
  gatewayOrderId: string;
  amountInr: number;
  amountPaise: number;
  currency: 'INR';
  supportedMethods: GatewayPaymentMethod[];
  challengeToken?: string;
}

// ==================== DONATOR SYSTEM TYPES ====================

export type DonationEdition = 'java' | 'bedrock';
export type DonationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type DonationRewardDeliveryStatus = 'NONE' | 'PENDING' | 'DELIVERED';
export type DonationRewardCategory = 'Rank' | 'Coins' | 'Keys' | 'Kits' | 'Cosmetics' | 'Other';
export type DonatorLeaderboardPeriod = 'all_time' | 'monthly' | 'both';

export interface DonationRequest {
  id: string;
  referenceNumber: string;
  username: string;
  edition: DonationEdition;
  amount: number;
  utr: string;
  screenshotUrl: string;
  message?: string;
  status: DonationStatus;
  adminRemarks?: string;
  rewardId?: string;
  rewardName?: string;
  rewardCategory?: DonationRewardCategory;
  rewardStatus: DonationRewardDeliveryStatus;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface DonationRewardTier {
  id: string;
  minAmount: number;
  name: string;
  description: string;
  category: DonationRewardCategory;
  badgeLabel?: string;
  enabled: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ManualDonatorLeaderboardEntry {
  id: string;
  username: string;
  edition: DonationEdition;
  amount: number;
  badge: string;
  avatarUrl?: string;
  period: DonatorLeaderboardPeriod;
  position?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PublicDonatorLeaderboardRow {
  id: string;
  rank: number;
  username: string;
  edition: DonationEdition;
  amount: number;
  badge: string;
  avatarUrl?: string;
  source: 'manual' | 'approved_donation' | 'combined';
  position?: number;
}

export interface DonationSettings {
  enabled: boolean;
  leaderboardEnabled: boolean;
  rewardsEnabled: boolean;
  upiId: string;
  upiPayeeName: string;
  qrMode: 'dynamic' | 'custom';
  customQrUrl: string;
  instructions: string;
  minAmount: number;
  thankYouMessage: string;
  rewardsBannerMessage: string;
  updatedAt: string;
}

export interface DonationAuditLog {
  id: string;
  action: string;
  adminName: string;
  targetId?: string;
  details: string;
  timestamp: string;
}

export interface DonationDashboardStats {
  totalRequests: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  totalApprovedAmount: number;
  totalUniqueDonors: number;
  pendingRewardsCount: number;
  deliveredRewardsCount: number;
}

export type GamemodeIconType = 'default' | 'image' | 'emoji';

export interface GamemodeVisualSettings {
  lifestealBgUrl: string;
  practiceBgUrl: string;
  lifestealIconType: GamemodeIconType;
  lifestealIconValue: string;
  practiceIconType: GamemodeIconType;
  practiceIconValue: string;
}

