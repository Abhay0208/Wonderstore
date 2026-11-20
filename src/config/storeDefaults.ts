import {
  StoreCategory,
  StoreItem,
  TopBuyer,
  StaffMember,
  ServerUpdate,
  SubAdminKey,
  Coupon,
  ActivityLog,
  VoteLink,
  ConnectionGuide,
  RuleCategory,
  StoreSaleConfig,
} from '../types';

export function formatINR(amount: number): string {
  const safeAmount = Number.isFinite(amount) ? Math.round(amount) : 0;
  return `₹${safeAmount.toLocaleString('en-IN')}`;
}

export const STORE_CONFIG: {
  brand: string;
  brandUpper: string;
  storeName: string;
  tagline: string;
  serverTagline: string;
  showServerTagline: boolean;
  announcements: string[];
  showAnnouncements: boolean;
  announcementSpeed: 'normal' | 'slow' | 'fast';
  description: string;
  serverIp: string;
  serverName: string;
  website: string;
  discordUrl: string;
  upiId: string;
  instagramUrl: string;
  youtubeUrl: string;
  copyright: string;
  sale: StoreSaleConfig;
} = {
  brand: 'WonderMC',
  brandUpper: 'WONDERMC',
  storeName: 'WonderMC Store',
  tagline: 'Best Indian Minecraft Network',
  serverTagline: 'PLAY FAIR, STAY RESPECTFUL. ENJOY THE SERVER',
  showServerTagline: true,
  announcements: [
    '❄️ Happy Winter Season from WonderMC! • Use Code WONDER20 for 20% OFF • play.wondermc.fun',
    '🌨️ Winter Frost Season Live on WonderMC Lifesteal • play.wondermc.fun',
    '🎁 Festive Rewards! Winter Ranks & Frost Crate Keys Available Now • play.wondermc.fun',
    "🔥 WonderMC Minecraft Network • India's #1 Lifesteal Server • play.wondermc.fun",
  ],
  showAnnouncements: true,
  announcementSpeed: 'normal',
  description: 'Buy ranks, perks, coins and crate keys for the WonderMC Minecraft server.',
  serverIp: 'play.wondermc.fun',
  serverName: 'Lifesteal',
  website: 'play.wondermc.fun',
  discordUrl: 'https://discord.gg/ThS4XSJ9bC',
  upiId: 'farhanastro@fam',
  instagramUrl: 'https://www.instagram.com/wondermc',
  youtubeUrl: 'https://www.youtube.com/@wondermc',
  copyright: '© 2026 WonderMC Network. All Rights Reserved.',
  sale: {
    pill: 'WINTER SALE',
    highlight: 'UP TO 25% OFF',
    text: 'Winter Season Ranks & Crate Keys Now Live!',
    percent: 20,
    enabled: false,
  },
};

export const RECENT_PURCHASES_TICKER: string[] = [
  '❄️ Happy Winter Season from WonderMC! • Use Code WONDER20 for 20% OFF • play.wondermc.fun',
  '🌨️ Winter Frost Season Live on WonderMC Lifesteal • play.wondermc.fun',
  '🎁 Festive Rewards! Winter Ranks & Frost Crate Keys Available Now • play.wondermc.fun',
  "🔥 WonderMC Minecraft Network • India's #1 Lifesteal Server • play.wondermc.fun",
];

export const INITIAL_CATEGORIES: StoreCategory[] = [
  {
    id: 'cat-ranks',
    name: 'Ranks',
    game_mode: 'Lifesteal',
    description: 'Unlock permanent perks, colored chat tags, extra homes, and priority queue access.',
    image_url: '/store/ranks.png',
    icon: '👑',
    enabled: true,
    display_order: 0,
  },
  {
    id: 'cat-keys',
    name: 'Crate Keys',
    game_mode: 'Lifesteal',
    description: 'Open mystery crates at spawn for rare enchanted gear, hearts, and seasonal loot.',
    image_url: '/store/keys.png',
    icon: '🗝️',
    enabled: true,
    display_order: 1,
  },
  {
    id: 'cat-kits',
    name: 'Kits',
    game_mode: 'Lifesteal',
    description: 'Dominate Lifesteal PvP with combat kits, totems, and netherite supplies.',
    image_url: '/store/kits.png',
    icon: '⚔️',
    enabled: true,
    display_order: 2,
  },
  {
    id: 'cat-coins',
    name: 'Coins',
    game_mode: 'Lifesteal',
    description: 'Top up in-game coins to trade with players and unlock cosmetic bundles.',
    image_url: '/store/coins.png',
    icon: '🪙',
    enabled: true,
    display_order: 3,
  },
  {
    id: 'cat-practice-ranks',
    name: 'Practice Ranks',
    game_mode: 'Practice',
    description: 'Stand out in Practice PvP with custom prefixes, extra duels, and arena perks.',
    image_url: '/store/ranks.png',
    icon: '🛡️',
    enabled: true,
    display_order: 4,
  },
  {
    id: 'cat-practice-bundles',
    name: 'Practice Bundles',
    game_mode: 'Practice',
    description: 'Tournament passes, unban tokens, and ranked season cosmetic packs.',
    image_url: '/store/others.png',
    icon: '🔥',
    enabled: true,
    display_order: 5,
  },
];

export const INITIAL_ITEMS: StoreItem[] = [
  {
    id: 'item-overlord-rank',
    title: 'Overlord Rank',
    category: 'Ranks',
    price: 499,
    discount_percent: 20,
    description:
      'Lifetime Overlord rank on Lifesteal with /feed, /craft, 10 set homes, exclusive [OVERLORD] prefix, and priority server queue.',
    image_url: '/store/ranks.png',
    display_order: 0,
  },
  {
    id: 'item-emperor-rank',
    title: 'Emperor Rank',
    category: 'Ranks',
    price: 999,
    discount_percent: 25,
    description:
      'Top-tier Lifesteal rank featuring /fly in lobby, /ec, /fix all, 20 set homes, weekly kit claims, and glowing Emperor chat tag.',
    image_url: '/store/ranks.png',
    display_order: 1,
  },
  {
    id: 'item-frost-keys-5',
    title: '5x Frost Crate Keys',
    category: 'Crate Keys',
    price: 249,
    description:
      'Receive 5 Frost Crate Keys on Lifesteal to roll for maxed custom enchants, extra hearts, and seasonal cosmetics.',
    image_url: '/store/golden-key.png',
    display_order: 2,
  },
  {
    id: 'item-warlord-kit',
    title: 'Warlord PvP Kit',
    category: 'Kits',
    price: 349,
    description:
      'Claimable combat kit featuring Protection IV Netherite armor, Sharpness V sword, golden apples, and totems.',
    image_url: '/store/kits.png',
    display_order: 3,
  },
  {
    id: 'item-coins-5000',
    title: '5,000 Wonder Coins',
    category: 'Coins',
    price: 299,
    description:
      'Instant delivery of 5,000 Wonder Coins to spend in the /coinshop on Lifesteal tags, boosters, and specials.',
    image_url: '/store/coins.png',
    display_order: 4,
  },
  {
    id: 'item-practice-champion',
    title: 'Champion Practice Rank',
    category: 'Practice Ranks',
    price: 399,
    discount_percent: 20,
    description:
      'Unlimited ranked queue matches, custom duel arena selection, party hosting perks, and [CHAMPION] tag on Practice.',
    image_url: '/store/ranks.png',
    display_order: 5,
  },
  {
    id: 'item-practice-duel-bundle',
    title: 'Arena Duelist Bundle',
    category: 'Practice Bundles',
    price: 299,
    description:
      'Includes custom kill effects, 2x ELO boost tokens, and tournament entry ticket on WonderMC Practice.',
    image_url: '/store/others.png',
    display_order: 6,
  },
];

export const INITIAL_LEADERBOARD: TopBuyer[] = [
  { id: 'tb-1', username: 'ShadowNinja99', total_spent: 14999, rank: 1 },
  { id: 'tb-2', username: 'PixelGod_YT', total_spent: 9999, rank: 2 },
  { id: 'tb-3', username: 'Vortex_PvP', total_spent: 7499, rank: 3 },
  { id: 'tb-4', username: 'FrostyQueen', total_spent: 4999, rank: 4 },
  { id: 'tb-5', username: 'BlazeStriker', total_spent: 2999, rank: 5 },
];

export const INITIAL_STAFF: StaffMember[] = [
  {
    id: 'staff-1',
    name: 'Danish',
    role: 'Owner',
    description: 'Founder & Network Lead overseeing WonderMC infrastructure, economy, and community.',
    discord_username: 'danish.wondermc',
  },
  {
    id: 'staff-2',
    name: 'AryanDev',
    role: 'Developer',
    description: 'Core plugin & web developer maintaining Lifesteal mechanics and store automation.',
    discord_username: 'aryandev',
  },
  {
    id: 'staff-3',
    name: 'ZoroMC',
    role: 'Admin',
    description: 'Head of moderation, event management, and player support.',
    discord_username: 'zoromc',
  },
  {
    id: 'staff-4',
    name: 'KaitoPvP',
    role: 'Moderator',
    description: 'Fair-play enforcement, screensharing, and Practice tournament staff.',
    discord_username: 'kaitopvp',
  },
];

export const INITIAL_COUPONS: Coupon[] = [
  {
    id: 'coupon-wonder20',
    code: 'WONDER20',
    category: 'normal',
    discountType: 'percentage',
    discountValue: 20,
    percent: 20,
    enabled: true,
    usedCount: 0,
  },
  {
    id: 'coupon-vip10',
    code: 'VIP10',
    category: 'normal',
    discountType: 'percentage',
    discountValue: 10,
    percent: 10,
    enabled: true,
    usedCount: 0,
  },
];

export const VALID_COUPONS: Record<string, number> = {
  WONDER20: 20,
  VIP10: 10,
};

export const INITIAL_UPDATES: ServerUpdate[] = [
  {
    id: 'upd-1',
    title: 'Winter Frost Season & Store Revamp',
    content:
      'Welcome to the Winter Frost season on WonderMC! Explore updated Lifesteal spawns, Practice ranked queues, and use code WONDER20 for 20% off any rank or crate key.',
    author: 'WonderMC Team',
    tag: 'Update',
    pinned: true,
    createdAt: '2026-11-01T12:00:00.000Z',
  },
  {
    id: 'upd-2',
    title: 'Instant Wallet Credit & UPI QR Checkout',
    content:
      'Top up your WonderMC Wallet via WonderPay UPI QR or check out directly using your wallet credits with full order history tracking.',
    author: 'WonderMC Team',
    tag: 'Announcement',
    pinned: false,
    createdAt: '2026-10-20T12:00:00.000Z',
  },
];

export const INITIAL_SUB_ADMIN_KEYS: SubAdminKey[] = [];

export const INITIAL_ACTIVITY_LOGS: ActivityLog[] = [];

export const INITIAL_VOTE_LINKS: VoteLink[] = [
  {
    id: 'vote-1',
    name: 'MinecraftServers.org',
    host: 'minecraftservers.org',
    url: 'https://minecraftservers.org',
  },
  {
    id: 'vote-2',
    name: 'TopG Server List',
    host: 'topg.org',
    url: 'https://topg.org',
  },
  {
    id: 'vote-3',
    name: 'Minecraft-MP',
    host: 'minecraft-mp.com',
    url: 'https://minecraft-mp.com',
  },
];

export const INITIAL_CONNECTION_GUIDE: ConnectionGuide = {
  javaTitle: 'Java Edition',
  javaDescription: 'For PC and Laptop players',
  javaSteps: [
    'Open Launcher (Premium or Cracked Client)',
    'Launch game and click "Multiplayer" on menu',
    'Click "Add Server" at the bottom right',
    'Select the "Server Address" textbox',
    'Type the Server Address: play.wondermc.fun',
    'Click Done, select the server and click "Join Server"',
  ],
  bedrockTitle: 'Bedrock Edition',
  bedrockDescription: 'For MCPE, Mobile, Console & Win 10',
  bedrockSteps: [
    'Launch Minecraft and click "Play" on the main screen',
    'Select the "Servers" tab on the top menu',
    'Scroll down to the bottom and click "Add Server"',
    'Type the Server Name as: WonderMC',
    'Type Server Address: play.wondermc.fun',
    'Enter the Port number as: 19132',
    'Click "Play" or "Save" to join the Server instantly!',
  ],
};

export const INITIAL_RULES_CATEGORIES: RuleCategory[] = [
  {
    id: 'rules-gameplay',
    name: 'Fair Play & Gameplay',
    icon: 'shield',
    rules: [
      {
        id: 'r-1',
        title: 'No Cheating or Hacked Clients',
        description: 'KillAura, X-Ray, Fly, Autoclickers, and unfair macro modifications are strictly forbidden.',
      },
      {
        id: 'r-2',
        title: 'No Bug or Dupe Exploiting',
        description: 'Report server bugs via Support Tickets instead of abusing them for unfair gain.',
      },
    ],
  },
  {
    id: 'rules-chat',
    name: 'Community & Chat Conduct',
    icon: 'chat',
    rules: [
      {
        id: 'r-3',
        title: 'Respect All Players & Staff',
        description: 'Harassment, hate speech, doxxing threats, and severe toxicity will result in mutes or bans.',
      },
      {
        id: 'r-4',
        title: 'No Spam or Advertising',
        description: 'Avoid flooding chat or promoting external Minecraft servers or Discord links.',
      },
    ],
  },
  {
    id: 'rules-payments',
    name: 'Store & Chargebacks',
    icon: 'alert',
    rules: [
      {
        id: 'r-5',
        title: 'Verify Your IGN Before Purchase',
        description: 'Double-check Java/Bedrock edition and username before completing UPI or Wallet checkout.',
      },
    ],
  },
];
