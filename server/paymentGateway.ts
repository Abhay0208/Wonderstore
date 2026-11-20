import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type {
  GatewayOrderChallenge,
  GatewayPaymentMethod,
  PaymentGatewayPublicConfig,
} from '../src/types';

interface StoredGatewaySecrets {
  razorpayEnabled: boolean;
  razorpayMode: 'test' | 'live';
  razorpayKeyId: string;
  razorpayKeySecret: string;
  razorpayWebhookSecret: string;
  gatewaySigningSecret: string;
  upiQrEnabled: boolean;
  supportedMethods: GatewayPaymentMethod[];
  updatedAt: string;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const SECRETS_FILE = path.join(DATA_DIR, 'gateway_secrets.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function isValidRazorpayKeyPair(keyId: string, keySecret: string): boolean {
  const cleanId = (keyId || '').trim();
  const cleanSecret = (keySecret || '').trim();
  return /^rzp_(test|live)_[A-Za-z0-9]{6,}$/.test(cleanId) && cleanSecret.length >= 6;
}

function defaultGatewaySecrets(): StoredGatewaySecrets {
  const rawKeyId = (process.env.RAZORPAY_KEY_ID || '').trim();
  const rawKeySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
  const validPair = isValidRazorpayKeyPair(rawKeyId, rawKeySecret);
  return {
    razorpayEnabled: true,
    razorpayMode: (process.env.RAZORPAY_MODE === 'live' ? 'live' : 'test'),
    razorpayKeyId: validPair ? rawKeyId : '',
    razorpayKeySecret: validPair ? rawKeySecret : '',
    razorpayWebhookSecret: (process.env.RAZORPAY_WEBHOOK_SECRET || '').trim(),
    gatewaySigningSecret:
      (process.env.GATEWAY_SIGNING_SECRET || '').trim() ||
      crypto.randomBytes(32).toString('hex'),
    upiQrEnabled: true,
    supportedMethods: ['upi'],
    updatedAt: new Date().toISOString(),
  };
}

function readSecrets(): StoredGatewaySecrets {
  ensureDir();
  if (!fs.existsSync(SECRETS_FILE)) {
    const initial = defaultGatewaySecrets();
    writeSecrets(initial);
    return initial;
  }
  try {
    const raw = fs.readFileSync(SECRETS_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<StoredGatewaySecrets>;
    const defaults = defaultGatewaySecrets();
    const rawKeyId =
      typeof parsed.razorpayKeyId === 'string' && parsed.razorpayKeyId.trim()
        ? parsed.razorpayKeyId.trim()
        : defaults.razorpayKeyId;
    const rawKeySecret =
      typeof parsed.razorpayKeySecret === 'string' && parsed.razorpayKeySecret.trim()
        ? parsed.razorpayKeySecret.trim()
        : defaults.razorpayKeySecret;
    const hasValidExternal = isValidRazorpayKeyPair(rawKeyId, rawKeySecret);

    const hydrated: StoredGatewaySecrets = {
      razorpayEnabled:
        typeof parsed.razorpayEnabled === 'boolean' ? parsed.razorpayEnabled : defaults.razorpayEnabled,
      razorpayMode: parsed.razorpayMode === 'live' ? 'live' : 'test',
      razorpayKeyId: hasValidExternal ? rawKeyId : '',
      razorpayKeySecret: hasValidExternal ? rawKeySecret : '',
      razorpayWebhookSecret:
        typeof parsed.razorpayWebhookSecret === 'string' && parsed.razorpayWebhookSecret.trim()
          ? parsed.razorpayWebhookSecret.trim()
          : defaults.razorpayWebhookSecret,
      gatewaySigningSecret:
        typeof parsed.gatewaySigningSecret === 'string' && parsed.gatewaySigningSecret.trim().length >= 16
          ? parsed.gatewaySigningSecret.trim()
          : defaults.gatewaySigningSecret,
      upiQrEnabled:
        typeof parsed.upiQrEnabled === 'boolean' ? parsed.upiQrEnabled : defaults.upiQrEnabled,
      supportedMethods: ['upi'],
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    };
    return hydrated;
  } catch {
    const initial = defaultGatewaySecrets();
    writeSecrets(initial);
    return initial;
  }
}

function writeSecrets(secrets: StoredGatewaySecrets): void {
  ensureDir();
  const tmpFile = `${SECRETS_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(secrets, null, 2), 'utf-8');
  fs.renameSync(tmpFile, SECRETS_FILE);
}

function maskPreview(value: string): string {
  if (!value) return 'Not configured';
  if (value.length <= 10) return `${value.slice(0, 4)}••••`;
  return `${value.slice(0, 8)}••••${value.slice(-4)}`;
}

export function getPublicGatewayConfig(): PaymentGatewayPublicConfig {
  const s = readSecrets();
  const hasExternalCreds = isValidRazorpayKeyPair(s.razorpayKeyId, s.razorpayKeySecret);
  const connectionStatus: PaymentGatewayPublicConfig['connectionStatus'] = !s.razorpayEnabled
    ? 'disabled'
    : hasExternalCreds && s.razorpayMode === 'live'
    ? 'connected_live'
    : 'connected_test_sandbox';

  return {
    razorpayEnabled: s.razorpayEnabled,
    razorpayMode: s.razorpayMode,
    razorpayConfiguredLive: hasExternalCreds,
    keyIdPreview: hasExternalCreds ? maskPreview(s.razorpayKeyId) : 'Server-Signed Test Mode',
    razorpayPublicKeyId: hasExternalCreds ? s.razorpayKeyId : 'rzp_test_wondermc_sandbox',
    hasKeySecret: hasExternalCreds && Boolean(s.razorpayKeySecret),
    webhookSecretSet: Boolean(s.razorpayWebhookSecret),
    webhookUrlPath: '/api/payments/razorpay/webhook',
    upiQrEnabled: s.upiQrEnabled,
    supportedMethods: ['upi'],
    connectionStatus,
    updatedAt: s.updatedAt,
  };
}

export function updateGatewayConfig(patch: {
  razorpayEnabled?: boolean;
  razorpayMode?: 'test' | 'live';
  razorpayKeyId?: string;
  razorpayKeySecret?: string;
  razorpayWebhookSecret?: string;
  clearExternalKeys?: boolean;
  upiQrEnabled?: boolean;
  supportedMethods?: GatewayPaymentMethod[];
}): { ok: boolean; error?: string; publicConfig?: PaymentGatewayPublicConfig } {
  const current = readSecrets();

  const nextMode = patch.razorpayMode === 'live' ? 'live' : patch.razorpayMode === 'test' ? 'test' : current.razorpayMode;
  let nextKeyId = current.razorpayKeyId;
  let nextKeySecret = current.razorpayKeySecret;
  let nextWebhookSecret = current.razorpayWebhookSecret;

  if (patch.clearExternalKeys) {
    nextKeyId = '';
    nextKeySecret = '';
    nextWebhookSecret = '';
  } else {
    if (typeof patch.razorpayKeyId === 'string' && patch.razorpayKeyId.trim()) {
      const candidateId = patch.razorpayKeyId.trim().slice(0, 128);
      if (!/^rzp_(test|live)_[A-Za-z0-9]{6,}$/.test(candidateId)) {
        return {
          ok: false,
          error: 'Invalid Razorpay Key ID format. Keys must start with rzp_test_ or rzp_live_.',
        };
      }
      nextKeyId = candidateId;
    }
    if (typeof patch.razorpayKeySecret === 'string' && patch.razorpayKeySecret.trim()) {
      const candidateSecret = patch.razorpayKeySecret.trim().slice(0, 256);
      if (candidateSecret.length < 6) {
        return {
          ok: false,
          error: 'Invalid Razorpay Key Secret length.',
        };
      }
      nextKeySecret = candidateSecret;
    }
    if (typeof patch.razorpayWebhookSecret === 'string' && patch.razorpayWebhookSecret.trim()) {
      nextWebhookSecret = patch.razorpayWebhookSecret.trim().slice(0, 256);
    }
  }

  if (nextMode === 'live' && !isValidRazorpayKeyPair(nextKeyId, nextKeySecret)) {
    return {
      ok: false,
      error: 'Live Mode requires valid Razorpay Key ID and Key Secret to be configured.',
    };
  }

  const nextMethods: GatewayPaymentMethod[] = ['upi'];

  const updated: StoredGatewaySecrets = {
    ...current,
    razorpayEnabled:
      typeof patch.razorpayEnabled === 'boolean' ? patch.razorpayEnabled : current.razorpayEnabled,
    razorpayMode: nextMode,
    razorpayKeyId: nextKeyId,
    razorpayKeySecret: nextKeySecret,
    razorpayWebhookSecret: nextWebhookSecret,
    upiQrEnabled:
      typeof patch.upiQrEnabled === 'boolean' ? patch.upiQrEnabled : current.upiQrEnabled,
    supportedMethods: nextMethods,
    updatedAt: new Date().toISOString(),
  };

  writeSecrets(updated);
  return { ok: true, publicConfig: getPublicGatewayConfig() };
}

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
    .createHmac('sha256', secrets.gatewaySigningSecret)
    .update(encoded)
    .digest('base64url');
  const macBuf = Buffer.from(mac);
  const expBuf = Buffer.from(expectedMac);
  if (macBuf.length !== expBuf.length || !crypto.timingSafeEqual(macBuf, expBuf)) {
    return false;
  }
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
}): Promise<{ ok: true; challenge: GatewayOrderChallenge } | { ok: false; error: string }> {
  const secrets = readSecrets();
  if (!secrets.razorpayEnabled) {
    return {
      ok: false,
      error: 'Online Payment Gateway is currently disabled by Administrator.',
    };
  }

  const amountPaise = Math.round(params.amountInr * 100);
  if (!Number.isFinite(amountPaise) || amountPaise < 100) {
    return { ok: false, error: 'Payment gateway amount must be at least ₹1.00.' };
  }

  // If valid external Razorpay API keys are configured, create a real Razorpay Order via REST API
  if (isValidRazorpayKeyPair(secrets.razorpayKeyId, secrets.razorpayKeySecret)) {
    try {
      const auth = Buffer.from(`${secrets.razorpayKeyId}:${secrets.razorpayKeySecret}`).toString('base64');
      const res = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: amountPaise,
          currency: 'INR',
          receipt: params.receipt.slice(0, 40),
          notes: params.notes || {},
        }),
      });
      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { error?: { description?: string } };
        if (secrets.razorpayMode === 'live' || res.status !== 401) {
          return {
            ok: false,
            error:
              errData?.error?.description ||
              `Razorpay order creation failed (${res.status}). Check Admin Gateway Settings.`,
          };
        }
        console.warn('[PaymentGateway] External test Razorpay keys returned 401; falling back to Server-Signed Test Sandbox.');
      } else {
        const data = (await res.json()) as { id: string };
        return {
          ok: true,
          challenge: {
            gateway: 'razorpay',
            mode: secrets.razorpayMode,
            isExternalRazorpay: true,
            keyId: secrets.razorpayKeyId,
            gatewayOrderId: data.id,
            amountInr: params.amountInr,
            amountPaise,
            currency: 'INR',
            supportedMethods: ['upi'],
          },
        };
      }
    } catch (err: any) {
      if (secrets.razorpayMode === 'live') {
        return {
          ok: false,
          error: err?.message || 'Network error while connecting to Razorpay Orders API.',
        };
      }
      console.warn('[PaymentGateway] Network error reaching Razorpay in test mode; using Server-Signed Test Sandbox.');
    }
  }

  // Server-Signed Test Mode (active out-of-the-box when external live keys aren't set)
  if (secrets.razorpayMode === 'live') {
    return {
      ok: false,
      error: 'Live Mode requires valid Razorpay API Key ID & Secret configured in Payment Management.',
    };
  }

  const gatewayOrderId = `order_wmc_${crypto.randomBytes(6).toString('hex')}`;
  const challengeToken = signChallengePayload(
    {
      gatewayOrderId,
      amountPaise,
      userId: params.userId,
      purpose: params.purpose,
      exp: Date.now() + 30 * 60 * 1000,
    },
    secrets.gatewaySigningSecret
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
}):
  | { ok: true; gatewayPaymentId: string; signature: string }
  | { ok: false; error: string } {
  const secrets = readSecrets();
  if (!secrets.razorpayEnabled) {
    return { ok: false, error: 'Payment gateway is currently disabled.' };
  }
  if (params.method !== 'upi') {
    return { ok: false, error: 'Only UPI payment method is enabled.' };
  }
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
    .createHmac('sha256', secrets.gatewaySigningSecret)
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
}): { ok: boolean; error?: string; mode: 'external' | 'test_sandbox' } {
  const { gatewayOrderId, gatewayPaymentId, signature, amountInr, userId, challengeToken } = params;
  if (!gatewayOrderId || !gatewayPaymentId || !signature) {
    return {
      ok: false,
      error: 'Missing gateway order ID, payment ID, or HMAC signature.',
      mode: 'test_sandbox',
    };
  }

  const secrets = readSecrets();

  // Case 1: External Razorpay API key signature check
  if (secrets.razorpayKeySecret && !gatewayOrderId.startsWith('order_wmc_')) {
    const expected = crypto
      .createHmac('sha256', secrets.razorpayKeySecret)
      .update(`${gatewayOrderId}|${gatewayPaymentId}`)
      .digest('hex');
    const a = Buffer.from(signature.trim());
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { ok: false, error: 'Invalid Razorpay payment signature.', mode: 'external' };
    }
    return { ok: true, mode: 'external' };
  }

  // Case 2: Server-Signed Test Sandbox HMAC verification
  const amountPaise = Math.round(amountInr * 100);
  const challengeValid = verifyChallengePayload(challengeToken, gatewayOrderId, amountPaise, userId);

  const expected = crypto
    .createHmac('sha256', secrets.gatewaySigningSecret)
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

export function verifyRazorpayWebhookSignature(rawBody: string, headerSignature?: string): boolean {
  const secrets = readSecrets();
  if (!secrets.razorpayWebhookSecret || !headerSignature) return false;
  const expected = crypto
    .createHmac('sha256', secrets.razorpayWebhookSecret)
    .update(rawBody)
    .digest('hex');
  const a = Buffer.from(headerSignature.trim());
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function executeGatewayRefund(params: {
  gatewayPaymentId: string;
  amountInr: number;
  reason: string;
}): Promise<{ ok: true; gatewayRefundId: string } | { ok: false; error: string }> {
  if (params.amountInr <= 0) {
    return { ok: true, gatewayRefundId: '' };
  }

  const secrets = readSecrets();

  // External Razorpay Refund API when live/external gateway payment ID is present
  if (
    secrets.razorpayKeyId &&
    secrets.razorpayKeySecret &&
    params.gatewayPaymentId &&
    !params.gatewayPaymentId.startsWith('pay_test_')
  ) {
    try {
      const auth = Buffer.from(`${secrets.razorpayKeyId}:${secrets.razorpayKeySecret}`).toString('base64');
      const res = await fetch(
        `https://api.razorpay.com/v1/payments/${encodeURIComponent(params.gatewayPaymentId)}/refund`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            amount: Math.round(params.amountInr * 100),
            notes: { reason: params.reason.slice(0, 120) },
          }),
        }
      );
      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { error?: { description?: string } };
        return {
          ok: false,
          error: errData?.error?.description || `Razorpay refund failed (${res.status})`,
        };
      }
      const data = (await res.json()) as { id: string };
      return { ok: true, gatewayRefundId: data.id };
    } catch (err: any) {
      return {
        ok: false,
        error: err?.message || 'Network error calling Razorpay refund API.',
      };
    }
  }

  // Test sandbox refund execution
  return {
    ok: true,
    gatewayRefundId: `rfnd_test_${crypto.randomBytes(6).toString('hex')}`,
  };
}
