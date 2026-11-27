import express, { Request, Response, NextFunction } from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { supportDb, SessionTokenPayload, RealtimeSupportEvent } from "./server/supportDb";
import {
  getPublicDiscordConfig,
  updateDiscordSecretConfig,
  dispatchNewTicketDiscordNotification,
  dispatchTicketUpdateDiscordNotification,
  sendTestSupportWebhook,
} from "./server/supportDiscord";
import { walletDb, RealtimeWalletEvent } from "./server/walletDb";
import {
  authorizeSandboxGatewayPayment,
  getPublicGatewayConfig,
  updateGatewayConfig,
} from "./server/paymentGateway";
import { siteDb } from "./server/siteDb";
import { donationDb } from "./server/donationDb";
import { verifyFirebaseIdToken } from "./server/firebase";

const app = express();
const PORT = 3000;

interface RawBodyRequest extends Request {
  rawBody?: string;
}

app.use(
  express.json({
    limit: "15mb",
    verify: (req, _res, buf) => {
      (req as RawBodyRequest).rawBody = buf.toString("utf-8");
    },
  })
);

interface AuthenticatedRequest extends Request {
  supportSession?: SessionTokenPayload;
}

function getAppOrigin(req: Request): string {
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const host = req.headers["x-forwarded-host"] || req.get("host") || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

function extractToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  const qToken = req.query.token;
  if (typeof qToken === "string" && qToken.trim()) {
    return qToken.trim();
  }
  return undefined;
}

function requireSupportSession(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const token = extractToken(req);
  const verified = supportDb.verifySessionToken(token);
  if (!verified) {
    res.status(401).json({ error: "Unauthorized: valid support session token required." });
    return;
  }
  req.supportSession = verified;
  next();
}

function requireStaffOrAdminSession(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const token = extractToken(req);
  const verified = supportDb.verifySessionToken(token);
  if (!verified || verified.kind !== "staff") {
    res.status(403).json({ error: "Forbidden: staff or admin portal authentication required." });
    return;
  }
  req.supportSession = verified;
  next();
}

function requireAdminModule(
  modulePerm:
    | "wallet"
    | "payment_management"
    | "orders"
    | "coupon_management"
    | "donations"
    | "categories"
    | "themes"
    | "click_animations"
    | "settings"
) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const token = extractToken(req);
    const verified = token ? supportDb.verifySessionToken(token) : null;
    if (!verified || verified.kind !== "staff") {
      res.status(403).json({ error: "Forbidden: administrator authentication required." });
      return;
    }
    const allowed =
      verified.isAdmin ||
      (Array.isArray(verified.subPermissions) &&
        (verified.subPermissions.includes(modulePerm) ||
          (modulePerm === "coupon_management" && verified.subPermissions.includes("wallet")) ||
          (modulePerm === "click_animations" && verified.subPermissions.includes("themes")) ||
          (modulePerm === "themes" && verified.subPermissions.includes("click_animations")) ||
          (modulePerm === "categories" && verified.subPermissions.includes("settings"))));
    if (!allowed) {
      res.status(403).json({
        error: `Forbidden: you do not have permission to access ${modulePerm}.`,
      });
      return;
    }
    req.supportSession = verified;
    next();
  };
}

function canAdminModule(
  session: SessionTokenPayload,
  modulePerm: "wallet" | "payment_management" | "orders" | "coupon_management" | "donations"
) {
  return (
    session.kind === "staff" &&
    (session.isAdmin ||
      (Array.isArray(session.subPermissions) &&
        (session.subPermissions.includes(modulePerm) ||
          (modulePerm === "coupon_management" && session.subPermissions.includes("wallet")))))
  );
}

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, mode: "hybrid-support-db" });
});

// Per-IP staff login throttle. Firebase user authentication has its own provider-side protections.
interface StaffLoginAttempt {
  count: number;
  windowStartedAt: number;
  blockedUntil: number;
}
const staffLoginAttempts = new Map<string, StaffLoginAttempt>();
const STAFF_LOGIN_WINDOW_MS = 60_000;
const STAFF_LOGIN_MAX_ATTEMPTS = 8;
const STAFF_LOGIN_BLOCK_MS = 15 * 60_000;

function rateLimitStaffLogin(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  let entry = staffLoginAttempts.get(ip);

  if (!entry || now - entry.windowStartedAt > STAFF_LOGIN_WINDOW_MS) {
    entry = { count: 0, windowStartedAt: now, blockedUntil: 0 };
    staffLoginAttempts.set(ip, entry);
  }

  if (entry.blockedUntil > now) {
    res.setHeader('Retry-After', String(Math.ceil((entry.blockedUntil - now) / 1000)));
    res.status(429).json({ error: 'Too many login attempts. Try again later.' });
    return;
  }

  entry.count += 1;
  if (entry.count > STAFF_LOGIN_MAX_ATTEMPTS) {
    entry.blockedUntil = now + STAFF_LOGIN_BLOCK_MS;
    res.setHeader('Retry-After', String(Math.ceil(STAFF_LOGIN_BLOCK_MS / 1000)));
    res.status(429).json({ error: 'Too many login attempts. Try again later.' });
    return;
  }

  // Bound memory if the endpoint is hit from many distinct addresses.
  if (staffLoginAttempts.size > 10_000) {
    for (const [key, value] of staffLoginAttempts) {
      if (value.blockedUntil < now && now - value.windowStartedAt > STAFF_LOGIN_WINDOW_MS * 2) {
        staffLoginAttempts.delete(key);
      }
    }
  }

  next();
}

// ==================== SUPPORT AUTHENTICATION ====================
app.post("/api/support/auth/user-session", async (req, res) => {
  const idToken = typeof req.body?.idToken === 'string' ? req.body.idToken.trim() : '';
  if (!idToken || idToken.length > 12_000) {
    res.status(401).json({ error: 'A valid Firebase sign-in token is required.' });
    return;
  }

  const firebaseUser = await verifyFirebaseIdToken(idToken);
  if (!firebaseUser || !firebaseUser.uid || firebaseUser.email_verified !== true) {
    res.status(401).json({ error: 'Firebase authentication is invalid or the email is not verified.' });
    return;
  }

  const cleanUid = firebaseUser.uid.slice(0, 128);
  const cleanEmail = typeof firebaseUser.email === 'string' ? firebaseUser.email.trim().slice(0, 254) : '';
  const cleanName =
    (typeof firebaseUser.name === 'string' && firebaseUser.name.trim()) ||
    (cleanEmail ? cleanEmail.split('@')[0] : 'Player');

  const token = supportDb.signSessionToken({
    kind: "user",
    uid: cleanUid,
    email: cleanEmail,
    name: cleanName.slice(0, 80),
    isAdmin: false,
    isOwner: false,
  });
  res.json({ token, uid: cleanUid, name: cleanName, email: cleanEmail });
});

app.post("/api/support/auth/staff-login", rateLimitStaffLogin, async (req, res) => {
  try {
    const { passkey } = req.body || {};
    const result = await supportDb.authenticateStaffOrAdmin(passkey);
    if (!result) {
      res.status(401).json({ error: "Invalid staff or admin passkey." });
      return;
    }
    res.json(result);
  } catch {
    res.status(500).json({ error: "Staff authentication could not be completed." });
  }
});

// ==================== REAL-TIME SSE STREAM ====================
app.get("/api/support/stream", requireSupportSession, (req: AuthenticatedRequest, res: Response) => {
  const session = req.supportSession!;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  res.write(`event: connected\ndata: ${JSON.stringify({ ok: true, kind: session.kind })}\n\n`);

  const onEvent = (ev: RealtimeSupportEvent) => {
    // Enforce strict event isolation so user SSE streams never leak other users' events
    if (session.kind === "user" && ev.ticketOwnerId && ev.ticketOwnerId !== session.uid) {
      return;
    }
    res.write(`event: support\ndata: ${JSON.stringify(ev)}\n\n`);
  };

  supportDb.events.on("support_event", onEvent);
  const heartbeat = setInterval(() => {
    res.write(`: ping ${Date.now()}\n\n`);
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    supportDb.events.off("support_event", onEvent);
  });
});

// ==================== TICKET CRUD & CONVERSATIONS ====================
app.get("/api/support/tickets", requireSupportSession, (req: AuthenticatedRequest, res: Response) => {
  const tickets = supportDb.listTicketsForSession(req.supportSession!);
  res.json({ tickets });
});

app.get("/api/support/tickets/:ticketId", requireSupportSession, (req: AuthenticatedRequest, res: Response) => {
  const result = supportDb.getTicketBundle(req.params.ticketId, req.supportSession!);
  if ('error' in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json(result.bundle);
});

app.post("/api/support/tickets", requireSupportSession, async (req: AuthenticatedRequest, res: Response) => {
  const session = req.supportSession!;
  const { subject, category, priority, description, ign, attachments } = req.body || {};
  const result = supportDb.createTicket(session, {
    subject,
    category,
    priority,
    description,
    ign,
    attachments,
  });
  if ('error' in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  // Dispatch Discord notification asynchronously from backend (secret webhook URL stays on backend)
  dispatchNewTicketDiscordNotification(result.ticket, getAppOrigin(req)).catch((err) => {
    console.warn("[Support Discord New Ticket]", err);
  });

  res.status(201).json({ ticket: result.ticket, attachments: result.attachments });
});

app.post(
  "/api/support/tickets/:ticketId/messages",
  requireSupportSession,
  (req: AuthenticatedRequest, res: Response) => {
    const { message, isInternal, attachments, nextStatus } = req.body || {};
    const result = supportDb.postMessage(req.params.ticketId, req.supportSession!, {
      message,
      isInternal,
      attachments,
      nextStatus,
    });
    if ('error' in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.status(201).json({
      message: result.message,
      ticket: result.ticket,
      attachments: result.attachments,
    });
  }
);

app.post(
  "/api/support/tickets/:ticketId/read",
  requireSupportSession,
  (req: AuthenticatedRequest, res: Response) => {
    const updated = supportDb.markTicketRead(req.params.ticketId, req.supportSession!);
    if (!updated) {
      res.status(404).json({ error: "Ticket not found or access denied." });
      return;
    }
    res.json({ ticket: updated });
  }
);

app.patch(
  "/api/support/tickets/:ticketId",
  requireStaffOrAdminSession,
  (req: AuthenticatedRequest, res: Response) => {
    const { status, priority, assignedStaffId } = req.body || {};
    const result = supportDb.updateTicketByStaff(req.params.ticketId, req.supportSession!, {
      status,
      priority,
      assignedStaffId,
    });
    if ('error' in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    if (result.importantUpdateSummary) {
      dispatchTicketUpdateDiscordNotification(
        result.ticket,
        result.importantUpdateSummary,
        getAppOrigin(req)
      ).catch((err) => {
        console.warn("[Support Discord Update]", err);
      });
    }

    res.json({ ticket: result.ticket });
  }
);

app.delete(
  "/api/support/tickets/:ticketId",
  requireStaffOrAdminSession,
  (req: AuthenticatedRequest, res: Response) => {
    const result = supportDb.deleteTicket(req.params.ticketId, req.supportSession!);
    if ('error' in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ ok: true });
  }
);

// ==================== RATINGS ====================
app.post(
  "/api/support/tickets/:ticketId/rating",
  requireSupportSession,
  (req: AuthenticatedRequest, res: Response) => {
    const { stars, feedback } = req.body || {};
    const result = supportDb.submitRating(req.params.ticketId, req.supportSession!, Number(stars), feedback);
    if ('error' in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.status(201).json({ rating: result.rating });
  }
);

app.get("/api/support/ratings", requireSupportSession, (req: AuthenticatedRequest, res: Response) => {
  const ratings = supportDb.listRatings(req.supportSession!);
  res.json({ ratings });
});

// ==================== NOTIFICATIONS ====================
app.get("/api/support/notifications", requireSupportSession, (req: AuthenticatedRequest, res: Response) => {
  const notifications = supportDb.listNotifications(req.supportSession!);
  res.json({ notifications });
});

app.post(
  "/api/support/notifications/mark-read",
  requireSupportSession,
  (req: AuthenticatedRequest, res: Response) => {
    const { ids } = req.body || {};
    supportDb.markNotificationsRead(req.supportSession!, ids);
    res.json({ ok: true });
  }
);

// ==================== STAFF PERMISSIONS MANAGEMENT ====================
app.get(
  "/api/support/staff-members",
  requireStaffOrAdminSession,
  (req: AuthenticatedRequest, res: Response) => {
    if (!req.supportSession?.isAdmin) {
      res.status(403).json({ error: 'Only the owner/admin can view staff account management.' });
      return;
    }
    const staffMembers = supportDb.listStaffMembers();
    res.json({ staffMembers });
  }
);

app.post(
  "/api/support/staff-members",
  requireStaffOrAdminSession,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await supportDb.upsertStaffMember(req.supportSession!, req.body || {});
      if ('error' in result) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json({ member: result.member });
    } catch {
      res.status(500).json({ error: 'Staff account could not be saved.' });
    }
  }
);

app.delete(
  "/api/support/staff-members/:staffId",
  requireStaffOrAdminSession,
  (req: AuthenticatedRequest, res: Response) => {
    const result = supportDb.deleteStaffMember(req.supportSession!, req.params.staffId);
    if ('error' in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ ok: true });
  }
);

// ==================== DISCORD WEBHOOK CONFIG (BACKEND SECRET ONLY) ====================
app.get(
  "/api/support/discord-config",
  requireStaffOrAdminSession,
  (_req: AuthenticatedRequest, res: Response) => {
    res.json({ config: getPublicDiscordConfig() });
  }
);

app.post(
  "/api/support/discord-config",
  requireStaffOrAdminSession,
  (req: AuthenticatedRequest, res: Response) => {
    if (!req.supportSession!.isAdmin) {
      res.status(403).json({ error: "Only Admins can update Discord webhook settings." });
      return;
    }
    const result = updateDiscordSecretConfig(req.body || {});
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ config: result.publicConfig });
  }
);

app.post(
  "/api/support/discord-config/test",
  requireStaffOrAdminSession,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.supportSession!.isAdmin) {
      res.status(403).json({ error: "Only Admins can test Discord webhook settings." });
      return;
    }
    const { webhookUrl } = req.body || {};
    const result = await sendTestSupportWebhook(webhookUrl);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ ok: true });
  }
);

// ==================== WALLET & PAYMENT STREAM (SSE) ====================
app.get("/api/wallet/stream", requireSupportSession, (req: AuthenticatedRequest, res: Response) => {
  const session = req.supportSession!;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  res.write(`event: connected\ndata: ${JSON.stringify({ ok: true, kind: session.kind })}\n\n`);

  const onEvent = (ev: RealtimeWalletEvent) => {
    if (session.kind === "user" && ev.userId && ev.userId !== session.uid) {
      return;
    }
    res.write(`event: wallet\ndata: ${JSON.stringify(ev)}\n\n`);
  };

  walletDb.events.on("wallet_event", onEvent);
  const heartbeat = setInterval(() => {
    res.write(`: ping ${Date.now()}\n\n`);
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    walletDb.events.off("wallet_event", onEvent);
  });
});

// ==================== PUBLIC GATEWAY CONFIG ====================
app.get("/api/payments/gateway-config", (_req, res) => {
  res.json({ config: getPublicGatewayConfig() });
});

// ==================== USER WALLET & RECHARGE ====================
app.get("/api/wallet/me", requireSupportSession, (req: AuthenticatedRequest, res: Response) => {
  const session = req.supportSession!;
  if (session.kind !== "user") {
    res.status(400).json({ error: "User session required for personal wallet lookup." });
    return;
  }
  const bundle = walletDb.getUserBundle(session);
  res.json(bundle);
});

// ==================== WALLET COUPONS USER CLAIM ====================
app.post("/api/wallet/coupons/redeem", requireSupportSession, (req: AuthenticatedRequest, res: Response) => {
  const session = req.supportSession!;
  if (session.kind !== "user") {
    res.status(403).json({ error: "Please log in to your player account to claim wallet coupons." });
    return;
  }
  const { code } = req.body || {};
  try {
    const result = walletDb.redeemWalletCoupon(
      { uid: session.uid, name: session.name, email: session.email },
      code
    );
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to redeem coupon." });
  }
});

app.get("/api/wallet/coupons/my-redemptions", requireSupportSession, (req: AuthenticatedRequest, res: Response) => {
  const session = req.supportSession!;
  if (session.kind !== "user") {
    res.status(403).json({ error: "User session required." });
    return;
  }
  const redemptions = walletDb.listWalletCouponRedemptions(session.uid);
  res.json({ redemptions });
});

app.post("/api/wallet/recharge/initiate", requireSupportSession, async (req: AuthenticatedRequest, res: Response) => {
  const session = req.supportSession!;
  if (session.kind !== "user") {
    res.status(403).json({ error: "Sign in as a player account to recharge wallet." });
    return;
  }
  const { amount, paymentMethod } = req.body || {};
  const result = await walletDb.initiateRecharge(session, { amount: Number(amount), paymentMethod });
  if ("error" in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.status(201).json(result);
});

app.post("/api/wallet/recharge/verify", requireSupportSession, (req: AuthenticatedRequest, res: Response) => {
  const session = req.supportSession!;
  const { rechargeId, gatewayOrderId, gatewayPaymentId, signature, challengeToken, paymentMethod } = req.body || {};
  const result = walletDb.verifyAndCreditRecharge(session, {
    rechargeId,
    gatewayOrderId,
    gatewayPaymentId,
    signature,
    challengeToken,
    paymentMethod,
  });
  if ("error" in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json(result);
});

app.post("/api/wallet/recharge/fail", requireSupportSession, (req: AuthenticatedRequest, res: Response) => {
  const session = req.supportSession!;
  const { rechargeId, reason, cancelled } = req.body || {};
  const result = walletDb.failRecharge(session, { rechargeId, reason, cancelled });
  if ("error" in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json(result);
});

app.post("/api/wallet/recharge/manual-upi", requireSupportSession, (req: AuthenticatedRequest, res: Response) => {
  const session = req.supportSession!;
  if (session.kind !== "user") {
    res.status(403).json({ error: "Sign in as a player account to submit wallet recharge proof." });
    return;
  }
  const { amount, utr, screenshotUrl, ign, orderNumber } = req.body || {};
  const result = walletDb.recordManualUpiRecharge(session, {
    amount: Number(amount),
    utr,
    screenshotUrl,
    ign,
    orderNumber,
  });
  if ("error" in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.status(201).json(result);
});

// Built-in Test Sandbox Authorization (server-signed HMAC challenge flow)
app.post("/api/payments/gateway/sandbox-authorize", requireSupportSession, (req: AuthenticatedRequest, res: Response) => {
  const session = req.supportSession!;
  const { gatewayOrderId, amountInr, challengeToken, method } = req.body || {};
  const authResult = authorizeSandboxGatewayPayment({
    gatewayOrderId,
    amountInr: Number(amountInr),
    userId: session.uid,
    challengeToken,
    method: method || "upi",
  });
  if ("error" in authResult) {
    res.status(400).json({ error: authResult.error });
    return;
  }
  res.json(authResult);
});

// ==================== STORE CHECKOUT & COMBINED PAYMENT ====================
app.post("/api/payments/checkout/wallet", requireSupportSession, (req: AuthenticatedRequest, res: Response) => {
  const session = req.supportSession!;
  if (session.kind !== "user") {
    res.status(403).json({ error: "Player account login is required for wallet checkout." });
    return;
  }
  const { totalAmount, items, ign, edition, orderNumber } = req.body || {};
  const result = walletDb.purchaseWithFullWallet(session, {
    totalAmount: Number(totalAmount),
    items,
    ign,
    edition,
    orderNumber,
  });
  if ("error" in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.status(201).json(result);
});

app.post("/api/payments/checkout/initiate", requireSupportSession, async (req: AuthenticatedRequest, res: Response) => {
  const session = req.supportSession!;
  if (session.kind !== "user") {
    res.status(403).json({ error: "Player account login is required for online checkout." });
    return;
  }
  const { mode, totalAmount, items, ign, edition, paymentMethod, orderNumber } = req.body || {};
  const cleanMode = mode === "combined" ? "combined" : "direct_online";
  const result = await walletDb.initiateGatewayCheckout(session, {
    mode: cleanMode,
    totalAmount: Number(totalAmount),
    items,
    ign,
    edition,
    paymentMethod,
    orderNumber,
  });
  if ("error" in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.status(201).json(result);
});

app.post("/api/payments/checkout/verify", requireSupportSession, (req: AuthenticatedRequest, res: Response) => {
  const session = req.supportSession!;
  const { paymentId, gatewayOrderId, gatewayPaymentId, signature, challengeToken, paymentMethod } = req.body || {};
  const result = walletDb.verifyAndCompleteGatewayCheckout(session, {
    paymentId,
    gatewayOrderId,
    gatewayPaymentId,
    signature,
    challengeToken,
    paymentMethod,
  });
  if ("error" in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json(result);
});

app.post("/api/payments/checkout/fail", requireSupportSession, (req: AuthenticatedRequest, res: Response) => {
  const session = req.supportSession!;
  const { paymentId, reason, cancelled } = req.body || {};
  const result = walletDb.failGatewayCheckout(session, { paymentId, reason, cancelled });
  if ("error" in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json(result);
});

app.post("/api/payments/manual-upi", (req, res) => {
  const token = extractToken(req);
  const verified = token ? supportDb.verifySessionToken(token) : null;
  const userSession = verified && verified.kind === "user" ? verified : null;
  const { mode, totalAmount, items, ign, edition, orderNumber, utr, screenshotUrl } = req.body || {};
  const cleanMode = mode === "combined" ? "combined" : "direct_online";
  const result = walletDb.recordManualUpiCheckout(userSession, {
    mode: cleanMode,
    totalAmount: Number(totalAmount),
    items,
    ign,
    edition,
    orderNumber,
    utr,
    screenshotUrl,
  });
  if ("error" in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.status(201).json(result);
});

// ==================== ORDERS ENDPOINTS ====================
app.get("/api/orders", requireSupportSession, (req: AuthenticatedRequest, res: Response) => {
  const session = req.supportSession!;
  if (session.kind === "staff" && !canAdminModule(session, "orders") && !canAdminModule(session, "payment_management")) {
    res.status(403).json({ error: "Forbidden: orders access requires Purchase/Payment permission." });
    return;
  }
  const orders = walletDb.listOrdersForSession(session);
  res.json({ orders });
});

app.patch("/api/admin/orders/:orderId", requireAdminModule("orders"), (req: AuthenticatedRequest, res: Response) => {
  const { status } = req.body || {};
  if (!["pending", "completed", "failed", "refunded"].includes(status)) {
    res.status(400).json({ error: "Invalid order status." });
    return;
  }
  const updated = walletDb.updateOrderStatusByAdmin(req.params.orderId, status);
  if (!updated) {
    res.status(404).json({ error: "Order not found." });
    return;
  }
  res.json({ order: updated });
});

app.delete("/api/admin/orders/:orderId", requireAdminModule("orders"), (req: AuthenticatedRequest, res: Response) => {
  const removed = walletDb.deleteOrderByAdmin(req.params.orderId);
  if (!removed) {
    res.status(404).json({ error: "Order not found." });
    return;
  }
  res.json({ ok: true });
});

// ==================== ADMIN WALLET MANAGEMENT ====================
app.get("/api/admin/wallets", requireAdminModule("wallet"), (_req: AuthenticatedRequest, res: Response) => {
  res.json(walletDb.listAllWalletsForAdmin());
});

app.get("/api/admin/wallets/:userId", requireAdminModule("wallet"), (req: AuthenticatedRequest, res: Response) => {
  const detail = walletDb.getWalletDetailForAdmin(req.params.userId);
  if (!detail) {
    res.status(404).json({ error: "User wallet not found." });
    return;
  }
  res.json(detail);
});

app.post("/api/admin/wallets/adjust", requireAdminModule("wallet"), (req: AuthenticatedRequest, res: Response) => {
  const { userId, action, amount, reason, username, email } = req.body || {};
  if (!["admin_credit", "admin_debit", "promotional_credit"].includes(action)) {
    res.status(400).json({ error: "Invalid wallet adjustment action." });
    return;
  }
  const result = walletDb.adjustWalletByAdmin(req.supportSession!, {
    userId,
    action,
    amount: Number(amount),
    reason,
    username,
    email,
  });
  if ("error" in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json(result);
});

// ==================== ADMIN PAYMENT MANAGEMENT ====================
app.get("/api/admin/payments", requireAdminModule("payment_management"), (_req: AuthenticatedRequest, res: Response) => {
  res.json(walletDb.listAllPaymentsForAdmin());
});

app.get("/api/admin/payments/:paymentId", requireAdminModule("payment_management"), (req: AuthenticatedRequest, res: Response) => {
  const detail = walletDb.getPaymentDetailForAdmin(req.params.paymentId);
  if (!detail) {
    res.status(404).json({ error: "Payment record not found." });
    return;
  }
  res.json(detail);
});

app.patch("/api/admin/payments/:paymentId/status", requireAdminModule("payment_management"), (req: AuthenticatedRequest, res: Response) => {
  const { status, reason } = req.body || {};
  const result = walletDb.updatePaymentStatusByAdmin(req.params.paymentId, status, reason);
  if ("error" in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json(result);
});

app.post("/api/admin/payments/:paymentId/refund", requireAdminModule("payment_management"), async (req: AuthenticatedRequest, res: Response) => {
  const { reason } = req.body || {};
  const result = await walletDb.refundPaymentByAdmin(req.supportSession!, req.params.paymentId, reason);
  if ("error" in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json(result);
});

app.get("/api/admin/gateway-settings", requireAdminModule("payment_management"), (_req: AuthenticatedRequest, res: Response) => {
  res.json({ config: getPublicGatewayConfig() });
});

app.post("/api/admin/gateway-settings", requireAdminModule("payment_management"), (req: AuthenticatedRequest, res: Response) => {
  if (!req.supportSession!.isAdmin) {
    res.status(403).json({ error: "Only Main Owner Admins can modify gateway secret settings." });
    return;
  }
  const result = updateGatewayConfig(req.body || {});
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({ config: result.publicConfig });
});

// ==================== ADMIN COUPON MANAGEMENT ====================
app.get("/api/admin/coupons", requireAdminModule("coupon_management"), (_req: AuthenticatedRequest, res: Response) => {
  res.json({ coupons: walletDb.listWalletCoupons() });
});

app.post("/api/admin/coupons", requireAdminModule("coupon_management"), (req: AuthenticatedRequest, res: Response) => {
  try {
    const coupon = walletDb.createWalletCoupon(req.supportSession!, req.body || {});
    res.json({ coupon });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to create coupon." });
  }
});

app.patch("/api/admin/coupons/:couponId", requireAdminModule("coupon_management"), (req: AuthenticatedRequest, res: Response) => {
  try {
    const coupon = walletDb.updateWalletCoupon(req.supportSession!, req.params.couponId, req.body || {});
    res.json({ coupon });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to update coupon." });
  }
});

app.delete("/api/admin/coupons/:couponId", requireAdminModule("coupon_management"), (req: AuthenticatedRequest, res: Response) => {
  try {
    walletDb.deleteWalletCoupon(req.supportSession!, req.params.couponId);
    res.json({ success: true, deletedId: req.params.couponId });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to delete coupon." });
  }
});

app.get("/api/admin/coupons/redemptions", requireAdminModule("coupon_management"), (req: AuthenticatedRequest, res: Response) => {
  const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
  const redemptions = walletDb.listWalletCouponRedemptions(userId);
  res.json({ redemptions });
});

// ==================== STORE CATEGORIES & DONATION SYSTEM ====================

app.get("/api/store-categories", (_req: Request, res: Response) => {
  res.json({ categories: siteDb.getStoreCategories() });
});

app.put("/api/admin/store-categories/sync", requireAdminModule("categories"), (req: AuthenticatedRequest, res: Response) => {
  try {
    const list = req.body?.categories;
    const result = siteDb.syncStoreCategories(list);
    res.json({ categories: result.storeCategories });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to sync store categories." });
  }
});

// Public Donations Overview & Submission (No Auto Gateway — Manual Verification Only)
app.get("/api/donations/overview", (_req: Request, res: Response) => {
  res.json(donationDb.getPublicOverview());
});

app.post("/api/donations/submit", (req: Request, res: Response) => {
  const { username, edition, amount, utr, screenshotUrl, message } = req.body || {};
  try {
    const result = donationDb.submitDonationRequest({
      username,
      edition,
      amount: Number(amount),
      utr,
      screenshotUrl,
      message,
    });
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to submit donation request." });
  }
});

// Admin Donations, Leaderboard, Rewards & Settings
app.get("/api/admin/donations/overview", requireAdminModule("donations"), (_req: AuthenticatedRequest, res: Response) => {
  res.json(donationDb.getAdminOverview());
});

app.post("/api/admin/donations/requests/:id/approve", requireAdminModule("donations"), (req: AuthenticatedRequest, res: Response) => {
  try {
    const updated = donationDb.approveDonationRequest(
      req.params.id,
      req.body?.remarks,
      req.supportSession?.name
    );
    res.json({ request: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to approve donation." });
  }
});

app.post("/api/admin/donations/requests/:id/reject", requireAdminModule("donations"), (req: AuthenticatedRequest, res: Response) => {
  try {
    const updated = donationDb.rejectDonationRequest(
      req.params.id,
      req.body?.remarks,
      req.supportSession?.name
    );
    res.json({ request: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to reject donation." });
  }
});

app.post("/api/admin/donations/requests/:id/reward-status", requireAdminModule("donations"), (req: AuthenticatedRequest, res: Response) => {
  try {
    const updated = donationDb.updateDonationRewardStatus(
      req.params.id,
      req.body?.rewardStatus,
      req.supportSession?.name
    );
    res.json({ request: updated });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to update reward delivery status." });
  }
});

app.delete("/api/admin/donations/requests/:id", requireAdminModule("donations"), (req: AuthenticatedRequest, res: Response) => {
  const removed = donationDb.deleteDonationRequest(req.params.id, req.supportSession?.name);
  if (!removed) {
    res.status(404).json({ error: "Donation request not found." });
    return;
  }
  res.json({ success: true });
});

app.post("/api/admin/donations/leaderboard", requireAdminModule("donations"), (req: AuthenticatedRequest, res: Response) => {
  try {
    const entry = donationDb.saveManualLeaderboardEntry(req.body || {}, req.supportSession?.name);
    res.json({ entry });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to save leaderboard entry." });
  }
});

app.delete("/api/admin/donations/leaderboard/:id", requireAdminModule("donations"), (req: AuthenticatedRequest, res: Response) => {
  const removed = donationDb.deleteManualLeaderboardEntry(req.params.id, req.supportSession?.name);
  if (!removed) {
    res.status(404).json({ error: "Leaderboard entry not found." });
    return;
  }
  res.json({ success: true });
});

app.post("/api/admin/donations/leaderboard/reorder", requireAdminModule("donations"), (req: AuthenticatedRequest, res: Response) => {
  const { orderedIds } = req.body || {};
  if (!Array.isArray(orderedIds)) {
    res.status(400).json({ error: "orderedIds array is required." });
    return;
  }
  const leaderboard = donationDb.reorderManualLeaderboard(orderedIds, req.supportSession?.name);
  res.json({ leaderboard });
});

app.post("/api/admin/donations/rewards", requireAdminModule("donations"), (req: AuthenticatedRequest, res: Response) => {
  try {
    const reward = donationDb.saveRewardTier(req.body || {}, req.supportSession?.name);
    res.json({ reward });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to save reward tier." });
  }
});

app.delete("/api/admin/donations/rewards/:id", requireAdminModule("donations"), (req: AuthenticatedRequest, res: Response) => {
  const removed = donationDb.deleteRewardTier(req.params.id, req.supportSession?.name);
  if (!removed) {
    res.status(404).json({ error: "Reward tier not found." });
    return;
  }
  res.json({ success: true });
});

app.put("/api/admin/donations/settings", requireAdminModule("donations"), (req: AuthenticatedRequest, res: Response) => {
  try {
    const settings = donationDb.updateSettings(req.body || {}, req.supportSession?.name);
    res.json({ settings });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to update donation settings." });
  }
});

app.get("/api/theme-settings", (_req: Request, res: Response) => {
  res.json({ settings: siteDb.getThemeSettings() });
});

app.get("/api/admin/theme-settings", requireAdminModule("themes"), (_req: AuthenticatedRequest, res: Response) => {
  res.json({ settings: siteDb.getThemeSettings() });
});

const handleUpdateThemeSettings = (req: AuthenticatedRequest, res: Response) => {
  try {
    const settings = siteDb.updateThemeSettings(req.body || {});
    res.json({ settings });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to update theme settings." });
  }
};
app.put("/api/admin/theme-settings", requireAdminModule("themes"), handleUpdateThemeSettings);
app.post("/api/admin/theme-settings", requireAdminModule("themes"), handleUpdateThemeSettings);

app.get("/api/click-animations", (_req: Request, res: Response) => {
  res.json({ animations: siteDb.getClickAnimations() });
});

app.get("/api/admin/click-animations", requireAdminModule("click_animations"), (_req: AuthenticatedRequest, res: Response) => {
  res.json({ animations: siteDb.getClickAnimations() });
});

const handleUpdateClickAnimations = (req: AuthenticatedRequest, res: Response) => {
  try {
    const animations = siteDb.updateClickAnimations(req.body || {});
    res.json({ animations });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to update click animations." });
  }
};
app.put("/api/admin/click-animations", requireAdminModule("click_animations"), handleUpdateClickAnimations);
app.post("/api/admin/click-animations", requireAdminModule("click_animations"), handleUpdateClickAnimations);

const handleUpdateFloatingEmojis = (req: AuthenticatedRequest, res: Response) => {
  try {
    const settings = siteDb.updateFloatingEmojis(req.body || {});
    res.json({ settings });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to update floating emojis." });
  }
};
app.put("/api/admin/floating-emojis", requireAdminModule("click_animations"), handleUpdateFloatingEmojis);
app.post("/api/admin/floating-emojis", requireAdminModule("click_animations"), handleUpdateFloatingEmojis);

app.get("/api/gamemode-visuals", (_req: Request, res: Response) => {
  res.json({ visuals: siteDb.getGamemodeVisuals() });
});

const handleUpdateGamemodeVisuals = (req: AuthenticatedRequest, res: Response) => {
  try {
    const visuals = siteDb.updateGamemodeVisuals(req.body || {});
    res.json({ visuals });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to update gamemode visuals." });
  }
};
app.put("/api/admin/gamemode-visuals", requireAdminModule("categories"), handleUpdateGamemodeVisuals);
app.post("/api/admin/gamemode-visuals", requireAdminModule("categories"), handleUpdateGamemodeVisuals);

async function startServer() {
  // Run credential migration and validate the support database before accepting traffic.
  // A corrupt database must stop startup rather than being silently replaced.
  supportDb.read();

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT} (Hybrid Support Ticket DB + Storefront)`);
  });
}

startServer();
