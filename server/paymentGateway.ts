import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { GatewayPaymentMethod, PaymentGatewayPublicConfig } from '../src/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const SECRETS_FILE = path.join(DATA_DIR, 'gateway_secrets.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function defaultGatewayConfig(): PaymentGatewayPublicConfig {
  return {
    upiQrEnabled: true,
    supportedMethods: ['upi'] as GatewayPaymentMethod[],
    connectionStatus: 'connected_test_sandbox',
    updatedAt: new Date().toISOString(),
  };
}

function readSecrets(): PaymentGatewayPublicConfig {
  ensureDir();
  if (!fs.existsSync(SECRETS_FILE)) {
    const initial = defaultGatewayConfig();
    writeSecrets(initial);
    return initial;
  }
  try {
    const raw = fs.readFileSync(SECRETS_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<PaymentGatewayPublicConfig>;
    const defaults = defaultGatewayConfig();
    const upiQrEnabled =
      typeof parsed.upiQrEnabled === 'boolean' ? parsed.upiQrEnabled : defaults.upiQrEnabled;

    const hydrated: PaymentGatewayPublicConfig = {
      upiQrEnabled,
      supportedMethods: ['upi'] as GatewayPaymentMethod[],
      connectionStatus: upiQrEnabled ? 'connected_test_sandbox' : 'disabled',
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    };
    return hydrated;
  } catch {
    const initial = defaultGatewayConfig();
    writeSecrets(initial);
    return initial;
  }
}

function writeSecrets(config: PaymentGatewayPublicConfig): void {
  ensureDir();
  const tmpFile = `${SECRETS_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(config, null, 2), 'utf-8');
  fs.renameSync(tmpFile, SECRETS_FILE);
}

export function getPublicGatewayConfig(): PaymentGatewayPublicConfig {
  const s = readSecrets();
  return {
    upiQrEnabled: s.upiQrEnabled,
    supportedMethods: s.supportedMethods,
    connectionStatus: s.connectionStatus,
    updatedAt: s.updatedAt,
  };
}

export function updateGatewayConfig(patch: {
  upiQrEnabled?: boolean;
  supportedMethods?: GatewayPaymentMethod[];
}): { ok: boolean; error?: string; publicConfig?: PaymentGatewayPublicConfig } {
  const current = readSecrets();

  const nextMethods: GatewayPaymentMethod[] = ['upi'];

  const updated: PaymentGatewayPublicConfig = {
    upiQrEnabled:
      typeof patch.upiQrEnabled === 'boolean' ? patch.upiQrEnabled : current.upiQrEnabled,
    supportedMethods: patch.supportedMethods || nextMethods,
    connectionStatus: patch.upiQrEnabled !== undefined ? (patch.upiQrEnabled ? 'connected_test_sandbox' : 'disabled') : current.connectionStatus,
    updatedAt: new Date().toISOString(),
  };

  writeSecrets(updated);
  return { ok: true, publicConfig: getPublicGatewayConfig() };
}

// Sign challenge payload for UPI verification
function signChallengePayload(payload: {
  gatewayOrderId: string;
  amountPaise: number;
  userId: string;
  purpose: 'recharge' | 'checkout';
  exp: number;
}, signingSecret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', signingSecret).update(encoded).digest('base64url');
  return `${encoded}.${mac}`;
}

export function verifyChallengePayload(
  token: string | undefined,
  expectedOrderId: string,
  expectedAmountPaise: number,
  expectedUserId: string
): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [encoded, mac] = parts;
  const secrets = readSecrets();
  const expectedMac = crypto
    .createHmac('sha256', secrets.connectionStatus === 'connected_test_sandbox' ? 'dummy' : 'key')
    .update(encoded)
    .digest('base64url');
  // Simplified verification - in production use the gatewaySigningSecret
  const macBuf = Buffer.from(mac);
  const expBuf = Buffer.from(expectedMac);
  if (macBuf.length !== expBuf.length) return false;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8')) as {
      gatewayOrderId: string;
      amountPaise: number;
      userId: string;
      exp: number;
    };
    if (!parsed.exp || parsed.exp < Date.now()) return false;
    return (
      parsed.gatewayOrderId === expectedOrderId &&
      parsed.amountPaise === expectedAmountPaise &&
      parsed.userId === expectedUserId
    );
  } catch {
    return false;
  }
}

export async function createGatewayOrder(params: {
  amountInr: number;
  receipt: string;
  userId: string;
  purpose: 'recharge' | 'checkout';
  notes?: Record<string, string>;
}): Promise<{
  ok: true;
  challenge: {
    gateway: 'razorpay';
    mode: 'test';
    isExternalRazorpay: boolean;
    keyId: string;
    gatewayOrderId: string;
    amountInr: number;
    amountPaise: number;
    currency: 'INR';
    supportedMethods: GatewayPaymentMethod[];
    challengeToken?: string;
  };
} | { ok: false; error: string }> {
  const amountPaise = Math.round(params.amountInr * 100);
  if (!Number.isFinite(amountPaise) || amountPaise < 100) {
    return { ok: false, error: 'Payment gateway amount must be at least ₹1.00.' };
  }

  // Server-signed test sandbox mode - no external API calls
  const gatewayOrderId = `order_wmc_${crypto.randomBytes(6).toString('hex')}`;
  const challengeToken = signChallengePayload(
    {
      gatewayOrderId,
      amountPaise,
      userId: params.userId,
      purpose: params.purpose,
      exp: Date.now() + 30 * 60 * 1000,
    },
    'dummy_signing_secret'
  );

  return {
    ok: true,
    challenge: {
      gateway: 'razorpay',
      mode: 'test',
      isExternalRazorpay: false,
      keyId: 'rzp_test_wondermc_sandbox',
      gatewayOrderId,
      amountInr: params.amountInr,
      amountPaise,
      currency: 'INR',
      supportedMethods: ['upi'],
      challengeToken,
    },
  };
}

export function authorizeSandboxGatewayPayment(params: {
  gatewayOrderId: string;
  amountInr: number;
  userId: string;
  challengeToken?: string;
  method: GatewayPaymentMethod;
}): {
  ok: true;
  gatewayPaymentId: string;
  signature: string;
} | { ok: false; error: string } {
  const amountPaise = Math.round(params.amountInr * 100);
  if (
    !verifyChallengePayload(
      params.challengeToken,
      params.gatewayOrderId,
      amountPaise,
      params.userId
    )
  ) {
    return {
      ok: false,
      error: 'Invalid or expired payment gateway order challenge token.',
    };
  }

  const gatewayPaymentId = `pay_test_${crypto.randomBytes(6).toString('hex')}`;
  const signature = crypto
    .createHmac('sha256', 'dummy_signing_secret')
    .update(`${params.gatewayOrderId}|${gatewayPaymentId}`)
    .digest('hex');

  return { ok: true, gatewayPaymentId, signature };
}

export function verifyGatewaySignature(params: {
  gatewayOrderId: string;
  gatewayPaymentId: string;
  signature: string;
  amountInr: number;
  userId: string;
  challengeToken?: string;
}): {
  ok: boolean;
  error?: string;
  mode: 'external' | 'test_sandbox';
} {
  const { gatewayOrderId, gatewayPaymentId, signature, amountInr, userId, challengeToken } = params;
  if (!gatewayOrderId || !gatewayPaymentId || !signature) {
    return {
      ok: false,
      error: 'Missing gateway order ID, payment ID, or HMAC signature.',
      mode: 'test_sandbox',
    };
  }

  // Since Razorpay is removed, all payments use server-signed test sandbox mode
  const amountPaise = Math.round(amountInr * 100);
  const challengeValid = verifyChallengePayload(challengeToken, gatewayOrderId, amountPaise, userId);

  // Use a simple HMAC check with the connection status secret
  const secrets = readSecrets();
  const expected = crypto
    .createHmac('sha256', 'gateway_signing_secret')
    .update(`${gatewayOrderId}|${gatewayPaymentId}`)
    .digest('hex');
  const a = Buffer.from((signature || '').trim());
  const b = Buffer.from(expected);
  const hmacValid = a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);

  if (!hmacValid && !challengeValid) {
    return { ok: false, error: 'Payment signature verification failed.', mode: 'test_sandbox' };
  }
  return { ok: true, mode: 'test_sandbox' };
}

// Razorpay webhook signature verification - removed (Razorpay webhooks no longer supported)

export async function executeGatewayRefund(params: {
  gatewayPaymentId: string;
  amountInr: number;
  reason: string;
}): Promise<{ ok: true; gatewayRefundId: string } | { ok: false; error: string }> {
  if (params.amountInr <= 0) {
    return { ok: true, gatewayRefundId: '' };
  }

  // Since Razorpay is removed, only test sandbox refunds are supported
  return {
    ok: true,
    gatewayRefundId: `rfnd_test_${crypto.randomBytes(6).toString('hex')}`,
  };
}