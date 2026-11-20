import fs from 'fs';
import path from 'path';
import type {
  DiscordSupportConfigPublic,
  SupportTicket,
} from '../src/types';

export interface DiscordSupportConfigSecret {
  webhookUrl: string;
  enabled: boolean;
  botName: string;
  avatarUrl: string;
  pingRole: string;
  notifyOnNewTicket: boolean;
  notifyOnImportantUpdate: boolean;
  updatedAt: string;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DISCORD_CONFIG_FILE = path.join(DATA_DIR, 'support_discord_config.json');

const DEFAULT_DISCORD_SECRET_CONFIG: DiscordSupportConfigSecret = {
  webhookUrl: process.env.DISCORD_SUPPORT_WEBHOOK_URL || '',
  enabled: true,
  botName: 'WonderMC Support Desk',
  avatarUrl: 'https://mc-heads.net/avatar/MHF_Chest/128',
  pingRole: '@here',
  notifyOnNewTicket: true,
  notifyOnImportantUpdate: true,
  updatedAt: new Date().toISOString(),
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function readDiscordSecretConfig(): DiscordSupportConfigSecret {
  ensureDataDir();
  try {
    if (!fs.existsSync(DISCORD_CONFIG_FILE)) {
      return { ...DEFAULT_DISCORD_SECRET_CONFIG };
    }
    const raw = fs.readFileSync(DISCORD_CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<DiscordSupportConfigSecret>;
    return {
      ...DEFAULT_DISCORD_SECRET_CONFIG,
      ...parsed,
    };
  } catch {
    return { ...DEFAULT_DISCORD_SECRET_CONFIG };
  }
}

export function writeDiscordSecretConfig(next: DiscordSupportConfigSecret): void {
  ensureDataDir();
  const tmpFile = `${DISCORD_CONFIG_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(next, null, 2), 'utf-8');
  fs.renameSync(tmpFile, DISCORD_CONFIG_FILE);
}

export function maskWebhookUrl(url: string): string {
  const trimmed = (url || '').trim();
  if (!trimmed) return '';
  try {
    const u = new URL(trimmed);
    const tail = trimmed.slice(-4);
    return `${u.origin}/api/webhooks/••••/••••${tail}`;
  } catch {
    return 'Configured (hidden)';
  }
}

export function isValidDiscordWebhookUrl(url: string): boolean {
  const clean = (url || '').trim();
  return (
    clean.startsWith('https://discord.com/api/webhooks/') ||
    clean.startsWith('https://discordapp.com/api/webhooks/') ||
    clean.startsWith('https://canary.discord.com/api/webhooks/') ||
    clean.startsWith('https://ptb.discord.com/api/webhooks/')
  );
}

export function getPublicDiscordConfig(): DiscordSupportConfigPublic {
  const secret = readDiscordSecretConfig();
  return {
    hasWebhook: Boolean(secret.webhookUrl && secret.webhookUrl.trim()),
    webhookPreview: maskWebhookUrl(secret.webhookUrl),
    enabled: secret.enabled,
    botName: secret.botName,
    avatarUrl: secret.avatarUrl,
    pingRole: secret.pingRole,
    notifyOnNewTicket: secret.notifyOnNewTicket,
    notifyOnImportantUpdate: secret.notifyOnImportantUpdate,
  };
}

export function updateDiscordSecretConfig(patch: {
  webhookUrl?: string;
  clearWebhook?: boolean;
  enabled?: boolean;
  botName?: string;
  avatarUrl?: string;
  pingRole?: string;
  notifyOnNewTicket?: boolean;
  notifyOnImportantUpdate?: boolean;
}): { ok: boolean; error?: string; publicConfig?: DiscordSupportConfigPublic } {
  const current = readDiscordSecretConfig();
  let nextUrl = current.webhookUrl;

  if (patch.clearWebhook) {
    nextUrl = '';
  } else if (typeof patch.webhookUrl === 'string' && patch.webhookUrl.trim()) {
    const cleanUrl = patch.webhookUrl.trim();
    if (!isValidDiscordWebhookUrl(cleanUrl)) {
      return {
        ok: false,
        error: 'Webhook URL must start with https://discord.com/api/webhooks/',
      };
    }
    nextUrl = cleanUrl;
  }

  const next: DiscordSupportConfigSecret = {
    webhookUrl: nextUrl,
    enabled: typeof patch.enabled === 'boolean' ? patch.enabled : current.enabled,
    botName: typeof patch.botName === 'string' && patch.botName.trim() ? patch.botName.trim().slice(0, 64) : current.botName,
    avatarUrl: typeof patch.avatarUrl === 'string' && patch.avatarUrl.trim() ? patch.avatarUrl.trim().slice(0, 500) : current.avatarUrl,
    pingRole: typeof patch.pingRole === 'string' ? patch.pingRole.trim().slice(0, 64) : current.pingRole,
    notifyOnNewTicket:
      typeof patch.notifyOnNewTicket === 'boolean' ? patch.notifyOnNewTicket : current.notifyOnNewTicket,
    notifyOnImportantUpdate:
      typeof patch.notifyOnImportantUpdate === 'boolean'
        ? patch.notifyOnImportantUpdate
        : current.notifyOnImportantUpdate,
    updatedAt: new Date().toISOString(),
  };

  writeDiscordSecretConfig(next);
  return { ok: true, publicConfig: getPublicDiscordConfig() };
}

async function sendWebhookPayload(
  webhookUrl: string,
  payload: Record<string, unknown>
): Promise<{ ok: boolean; error?: string }> {
  if (!webhookUrl || !isValidDiscordWebhookUrl(webhookUrl)) {
    return { ok: false, error: 'Discord webhook URL is not configured or invalid.' };
  }
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok && res.status !== 204) {
      const txt = await res.text().catch(() => '');
      return { ok: false, error: `Discord API ${res.status}: ${txt.slice(0, 120)}` };
    }
    return { ok: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Network error sending Discord webhook';
    return { ok: false, error: message };
  }
}

export async function dispatchNewTicketDiscordNotification(
  ticket: SupportTicket,
  appBaseUrl?: string
): Promise<{ ok: boolean; error?: string }> {
  const cfg = readDiscordSecretConfig();
  if (!cfg.enabled || !cfg.notifyOnNewTicket || !cfg.webhookUrl) {
    return { ok: false, error: 'Webhook disabled or not configured' };
  }

  const origin = (appBaseUrl || process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
  const adminTicketLink = `${origin}/?admin=tickets&ticket=${encodeURIComponent(ticket.ticketNumber)}`;
  const ping = cfg.pingRole ? `${cfg.pingRole} ` : '';
  const colorMap: Record<string, number> = {
    urgent: 0xf43f5e,
    high: 0xf59e0b,
    normal: 0x0ea5e9,
    low: 0x64748b,
  };

  const payload = {
    username: cfg.botName || 'WonderMC Support Desk',
    avatar_url: cfg.avatarUrl || 'https://mc-heads.net/avatar/MHF_Chest/128',
    content: `${ping}🎫 **New Support Ticket Created: ${ticket.ticketNumber}**`,
    embeds: [
      {
        title: `${ticket.ticketNumber} — ${ticket.subject}`,
        description: ticket.description.slice(0, 1000),
        color: colorMap[ticket.priority] ?? 0x0ea5e9,
        fields: [
          { name: 'Ticket ID', value: `\`${ticket.ticketNumber}\``, inline: true },
          {
            name: 'Username',
            value: ticket.ign ? `**${ticket.username}** (IGN: \`${ticket.ign}\`)` : `**${ticket.username}**`,
            inline: true,
          },
          { name: 'Category', value: `\`${ticket.category}\``, inline: true },
          { name: 'Priority', value: `**${ticket.priority.toUpperCase()}**`, inline: true },
          { name: 'Status', value: `\`${ticket.status.toUpperCase()}\``, inline: true },
          {
            name: 'Admin Panel Ticket Link',
            value: `[Open in Admin Panel](${adminTicketLink})`,
            inline: false,
          },
        ],
        footer: {
          text: 'WonderMC Support Ticket System • Real-Time Dispatch',
        },
        timestamp: new Date().toISOString(),
      },
    ],
  };

  return sendWebhookPayload(cfg.webhookUrl, payload);
}

export async function dispatchTicketUpdateDiscordNotification(
  ticket: SupportTicket,
  updateSummary: string,
  appBaseUrl?: string
): Promise<{ ok: boolean; error?: string }> {
  const cfg = readDiscordSecretConfig();
  if (!cfg.enabled || !cfg.notifyOnImportantUpdate || !cfg.webhookUrl) {
    return { ok: false, error: 'Update notifications disabled or not configured' };
  }

  const origin = (appBaseUrl || process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
  const adminTicketLink = `${origin}/?admin=tickets&ticket=${encodeURIComponent(ticket.ticketNumber)}`;

  const payload = {
    username: cfg.botName || 'WonderMC Support Desk',
    avatar_url: cfg.avatarUrl || 'https://mc-heads.net/avatar/MHF_Chest/128',
    embeds: [
      {
        title: `🔔 Ticket Update: ${ticket.ticketNumber} — ${ticket.subject}`,
        description: updateSummary,
        color: ticket.status === 'resolved' ? 0x10b981 : ticket.status === 'closed' ? 0x64748b : 0x6366f1,
        fields: [
          { name: 'Ticket ID', value: `\`${ticket.ticketNumber}\``, inline: true },
          { name: 'Username', value: `**${ticket.username}**`, inline: true },
          { name: 'Status', value: `\`${ticket.status.replace(/_/g, ' ').toUpperCase()}\``, inline: true },
          { name: 'Priority', value: `**${ticket.priority.toUpperCase()}**`, inline: true },
          {
            name: 'Assigned Staff',
            value: ticket.assignedStaffName ? `\`${ticket.assignedStaffName}\`` : '*Unassigned*',
            inline: true,
          },
          { name: 'Admin Panel Ticket Link', value: `[Manage Ticket](${adminTicketLink})`, inline: false },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  };

  return sendWebhookPayload(cfg.webhookUrl, payload);
}

export async function sendTestSupportWebhook(overrideUrl?: string): Promise<{ ok: boolean; error?: string }> {
  const cfg = readDiscordSecretConfig();
  const targetUrl = (overrideUrl && overrideUrl.trim()) || cfg.webhookUrl;
  if (!targetUrl) {
    return { ok: false, error: 'Please configure a Discord Webhook URL first.' };
  }
  return sendWebhookPayload(targetUrl, {
    username: cfg.botName || 'WonderMC Support Desk',
    avatar_url: cfg.avatarUrl || 'https://mc-heads.net/avatar/MHF_Chest/128',
    content: '✅ **WonderMC Support Ticket Discord Webhook Connected!**',
    embeds: [
      {
        title: 'Support Desk Webhook Verification',
        description: 'New support tickets and important status updates will be posted securely to this staff channel.',
        color: 0x10b981,
        timestamp: new Date().toISOString(),
      },
    ],
  });
}
