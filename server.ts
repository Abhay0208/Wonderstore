import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import crypto from "crypto";
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
import { getSupabaseAdmin } from "./server/supabaseAdmin";
import {
  verifySessionToken,
  extractToken,
  requireSupportSession,
  requireStaffSession,
  requirePermission,
  requireOwnerOrAdmin,
  hasPermission,
  handleOwnerLogin,
  handleSubAdminLogin,
  handleStaffLogin,
  upsertSubAdmin,
  listSubAdmins,
  deleteSubAdmin,
  ALL_ADMIN_PERMISSIONS,
  type AdminTabPermission,
} from "./server/middleware/auth";

const app = express();
const PORT = Number(process.env.PORT || 3000);

// Render stability: never crash silently on async errors. Log safely (without
// echoing secrets) and keep the process alive where possible.
process.on("unhandledRejection", (reason: any) => {
  console.error("[UnhandledRejection]", reason?.message || reason);
});
process.on("uncaughtException", (err: any) => {
  console.error("[UncaughtException]", err?.message || err);
});

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

// Global error handler: never leak stack traces or secrets to the client.
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[Server Error]", err?.message || err);
  res.status(500).json({ error: "Internal server error." });
});

interface AuthenticatedRequest extends Request {
  supportSession?: SessionTokenPayload;
}

function getAppOrigin(req: Request): string {
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const host = req.headers["x-forwarded-host"] || req.get("host") || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

// ---------------------------------------------------------------------------
// Rate limiter for login endpoints (simple in-memory, per IP)
// ---------------------------------------------------------------------------
interface RateEntry { count: number; first: number; blockedUntil: number }
const loginAttempts = new Map<string, RateEntry>();
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 60 * 1000;
const LOGIN_BLOCK_MS = 15 * 60 * 1000;

function loginRateLimit(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || req.connection?.remoteAddress || "unknown";
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry) {
    loginAttempts.set(ip, { count: 1, first: now, blockedUntil: 0 });
    return next();
  }
  if (now < entry.blockedUntil) {
    res.status(429).json({ error: "Too many login attempts. Please try again later." });
    return;
  }
  if (now - entry.first > LOGIN_WINDOW_MS) {
    entry.count = 1;
    entry.first = now;
    entry.blockedUntil = 0;
    return next();
  }
  entry.count += 1;
  if (entry.count > LOGIN_MAX_ATTEMPTS) {
    entry.blockedUntil = now + LOGIN_BLOCK_MS;
    res.status(429).json({ error: "Too many login attempts. Please try again later." });
    return;
  }
  next();
}

// ---------------------------------------------------------------------------
// Authentication routes (backend-verified only)
// ---------------------------------------------------------------------------

/** Owner login — verified against ADMIN_SECURITY_KEY env var only. */
app.post("/api/admin/auth/owner-login", loginRateLimit, (req, res) => {
  void handleOwnerLogin(req as any, res);
});

/** Sub-admin login — verified against Supabase subadmin_keys password hash. */
app.post("/api/admin/auth/subadmin-login", loginRateLimit, (req, res) => {
  void handleSubAdminLogin(req as any, res);
});

/** Staff login — verified against Supabase support_staff_permissions passkey hash. */
app.post("/api/support/auth/staff-login", loginRateLimit, (req, res) => {
  void handleStaffLogin(req as any, res);
});

/** Sub-admin account management (owner/admin only). */
app.get("/api/admin/auth/subadmins", requireOwnerOrAdmin, async (req: AuthenticatedRequest, res) => {
  const list = await listSubAdmins(req.supportSession);
  res.json({ subadmins: list });
});
app.post("/api/admin/auth/subadmins", requireOwnerOrAdmin, async (req: AuthenticatedRequest, res) => {
  const token = extractToken(req);
  const verified = token ? verifySessionToken(token) : null;
  if (!verified) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }
  const result = await upsertSubAdmin(verified, req.body || {});
  if ("status" in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({ subadmin: result.record });
});
app.delete("/api/admin/auth/subadmins/:id", requireOwnerOrAdmin, async (req: AuthenticatedRequest, res) => {
  const token = extractToken(req);
  const verified = token ? verifySessionToken(token) : null;
  if (!verified) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }
  const result = await deleteSubAdmin(verified, req.params.id);
  if ("status" in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({ ok: true });
});

// Health check — verifies meaningful dependencies (Supabase reachable).
app.get("/api/health", async (_req, res) => {
  let supabaseOk = false;
  let supabaseDetail = "";
  try {
    const admin = (await import("./server/supabaseAdmin")).getSupabaseAdmin();
    if (admin) {
      const { error } = await admin.from("store_config").select("id").limit(1);
      supabaseOk = !error;
      supabaseDetail = error ? error.message : "reachable";
    } else {
      supabaseDetail = "not configured";
    }
  } catch (e: any) {
    supabaseDetail = e?.message || String(e);
  }
  res.json({
    ok: supabaseOk,
    mode: "supabase-backend",
    port: PORT,
    dependencies: { supabase: supabaseOk ? "ok" : "error" },
    supabaseDetail,
  });
});

// ==================== SUPPORT AUTHENTICATION ====================
app.post("/api/support/auth/user-session", (req, res) => {
  const { uid, email, displayName } = req.body || {};
  if (!uid || typeof uid !== "string" || !uid.trim()) {
    res.status(400).json({ error: "Valid user UID is required." });
    return;
  }
  const cleanUid = uid.trim().slice(0, 128);
  const cleanEmail = typeof email === "string" ? email.trim().slice(0, 254) : "";
  const cleanName =
    (typeof displayName === "string" && displayName.trim()) ||
    (cleanEmail ? cleanEmail.split("@")[0] : "Player");

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

app.post("/api/support/auth/staff-login", loginRateLimit, (req, res) => {
  void handleStaffLogin(req as any, res);
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
  requireStaffSession,
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
  requireStaffSession,
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
  requireStaffSession,
  (req: AuthenticatedRequest, res: Response) => {
    const staffMembers = supportDb.listStaffMembers(req.supportSession!.isAdmin);
    res.json({ staffMembers });
  }
);

app.post(
  "/api/support/staff-members",
  requireStaffSession,
  (req: AuthenticatedRequest, res: Response) => {
    const result = supportDb.upsertStaffMember(req.supportSession!, req.body || {});
    if ('error' in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ member: result.member });
  }
);

app.delete(
  "/api/support/staff-members/:staffId",
  requireStaffSession,
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
  requireStaffSession,
  (_req: AuthenticatedRequest, res: Response) => {
    res.json({ config: getPublicDiscordConfig() });
  }
);

app.post(
  "/api/support/discord-config",
  requireStaffSession,
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
  requireStaffSession,
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

app.post("/api/payments/razorpay/webhook", (req: RawBodyRequest, res: Response) => {
  const sig = req.headers["x-razorpay-signature"];
  const signatureHeader = Array.isArray(sig) ? sig[0] : sig;
  const rawBody = req.rawBody || JSON.stringify(req.body || {});
  const result = walletDb.handleRazorpayWebhook(rawBody, signatureHeader, req.body);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({ ok: true });
});

// ==================== ORDERS ENDPOINTS ====================
app.get("/api/orders", requireSupportSession, (req: AuthenticatedRequest, res: Response) => {
  const session = req.supportSession!;
  const isStaff = session.kind === "staff";
  const canOrders = hasPermission(session, "orders") || hasPermission(session, "payment_management");
  if (isStaff && !canOrders) {
    res.status(403).json({ error: "Forbidden: orders access requires Purchase/Payment permission." });
    return;
  }
  const orders = walletDb.listOrdersForSession(session);
  res.json({ orders });
});

app.patch("/api/admin/orders/:orderId", requirePermission("orders"), (req: AuthenticatedRequest, res: Response) => {
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

app.delete("/api/admin/orders/:orderId", requirePermission("orders"), (req: AuthenticatedRequest, res: Response) => {
  const removed = walletDb.deleteOrderByAdmin(req.params.orderId);
  if (!removed) {
    res.status(404).json({ error: "Order not found." });
    return;
  }
  res.json({ ok: true });
});

// ==================== ADMIN WALLET MANAGEMENT ====================
app.get("/api/admin/wallets", requirePermission("wallet"), (_req: AuthenticatedRequest, res: Response) => {
  res.json(walletDb.listAllWalletsForAdmin());
});

app.get("/api/admin/wallets/:userId", requirePermission("wallet"), (req: AuthenticatedRequest, res: Response) => {
  const detail = walletDb.getWalletDetailForAdmin(req.params.userId);
  if (!detail) {
    res.status(404).json({ error: "User wallet not found." });
    return;
  }
  res.json(detail);
});

app.post("/api/admin/wallets/adjust", requirePermission("wallet"), (req: AuthenticatedRequest, res: Response) => {
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
app.get("/api/admin/payments", requirePermission("payment_management"), (_req: AuthenticatedRequest, res: Response) => {
  res.json(walletDb.listAllPaymentsForAdmin());
});

app.get("/api/admin/payments/:paymentId", requirePermission("payment_management"), (req: AuthenticatedRequest, res: Response) => {
  const detail = walletDb.getPaymentDetailForAdmin(req.params.paymentId);
  if (!detail) {
    res.status(404).json({ error: "Payment record not found." });
    return;
  }
  res.json(detail);
});

app.patch("/api/admin/payments/:paymentId/status", requirePermission("payment_management"), (req: AuthenticatedRequest, res: Response) => {
  const { status, reason } = req.body || {};
  const result = walletDb.updatePaymentStatusByAdmin(req.params.paymentId, status, reason);
  if ("error" in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json(result);
});

app.post("/api/admin/payments/:paymentId/refund", requirePermission("payment_management"), async (req: AuthenticatedRequest, res: Response) => {
  const { reason } = req.body || {};
  const result = await walletDb.refundPaymentByAdmin(req.supportSession!, req.params.paymentId, reason);
  if ("error" in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json(result);
});

app.get("/api/admin/gateway-settings", requirePermission("payment_management"), (_req: AuthenticatedRequest, res: Response) => {
  res.json({ config: getPublicGatewayConfig() });
});

app.post("/api/admin/gateway-settings", requirePermission("payment_management"), (req: AuthenticatedRequest, res: Response) => {
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
app.get("/api/admin/coupons", requirePermission("coupon_management"), (_req: AuthenticatedRequest, res: Response) => {
  res.json({ coupons: walletDb.listWalletCoupons() });
});

app.post("/api/admin/coupons", requirePermission("coupon_management"), (req: AuthenticatedRequest, res: Response) => {
  try {
    const coupon = walletDb.createWalletCoupon(req.supportSession!, req.body || {});
    res.json({ coupon });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to create coupon." });
  }
});

app.patch("/api/admin/coupons/:couponId", requirePermission("coupon_management"), (req: AuthenticatedRequest, res: Response) => {
  try {
    const coupon = walletDb.updateWalletCoupon(req.supportSession!, req.params.couponId, req.body || {});
    res.json({ coupon });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to update coupon." });
  }
});

app.delete("/api/admin/coupons/:couponId", requirePermission("coupon_management"), (req: AuthenticatedRequest, res: Response) => {
  try {
    walletDb.deleteWalletCoupon(req.supportSession!, req.params.couponId);
    res.json({ success: true, deletedId: req.params.couponId });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to delete coupon." });
  }
});

app.get("/api/admin/coupons/redemptions", requirePermission("coupon_management"), (req: AuthenticatedRequest, res: Response) => {
  const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
  const redemptions = walletDb.listWalletCouponRedemptions(userId);
  res.json({ redemptions });
});

// ==================== STORE CATEGORIES & DONATION SYSTEM ====================

app.get("/api/store-categories", (_req: Request, res: Response) => {
  res.json({ categories: siteDb.getStoreCategories() });
});

app.put("/api/admin/store-categories/sync", requirePermission("categories"), (req: AuthenticatedRequest, res: Response) => {
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
app.get("/api/admin/donations/overview", requirePermission("donations"), (_req: AuthenticatedRequest, res: Response) => {
  res.json(donationDb.getAdminOverview());
});

app.post("/api/admin/donations/requests/:id/approve", requirePermission("donations"), (req: AuthenticatedRequest, res: Response) => {
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

app.post("/api/admin/donations/requests/:id/reject", requirePermission("donations"), (req: AuthenticatedRequest, res: Response) => {
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

app.post("/api/admin/donations/requests/:id/reward-status", requirePermission("donations"), (req: AuthenticatedRequest, res: Response) => {
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

app.delete("/api/admin/donations/requests/:id", requirePermission("donations"), (req: AuthenticatedRequest, res: Response) => {
  const removed = donationDb.deleteDonationRequest(req.params.id, req.supportSession?.name);
  if (!removed) {
    res.status(404).json({ error: "Donation request not found." });
    return;
  }
  res.json({ success: true });
});

app.post("/api/admin/donations/leaderboard", requirePermission("donations"), (req: AuthenticatedRequest, res: Response) => {
  try {
    const entry = donationDb.saveManualLeaderboardEntry(req.body || {}, req.supportSession?.name);
    res.json({ entry });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to save leaderboard entry." });
  }
});

app.delete("/api/admin/donations/leaderboard/:id", requirePermission("donations"), (req: AuthenticatedRequest, res: Response) => {
  const removed = donationDb.deleteManualLeaderboardEntry(req.params.id, req.supportSession?.name);
  if (!removed) {
    res.status(404).json({ error: "Leaderboard entry not found." });
    return;
  }
  res.json({ success: true });
});

app.post("/api/admin/donations/leaderboard/reorder", requirePermission("donations"), (req: AuthenticatedRequest, res: Response) => {
  const { orderedIds } = req.body || {};
  if (!Array.isArray(orderedIds)) {
    res.status(400).json({ error: "orderedIds array is required." });
    return;
  }
  const leaderboard = donationDb.reorderManualLeaderboard(orderedIds, req.supportSession?.name);
  res.json({ leaderboard });
});

app.post("/api/admin/donations/rewards", requirePermission("donations"), (req: AuthenticatedRequest, res: Response) => {
  try {
    const reward = donationDb.saveRewardTier(req.body || {}, req.supportSession?.name);
    res.json({ reward });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to save reward tier." });
  }
});

app.delete("/api/admin/donations/rewards/:id", requirePermission("donations"), (req: AuthenticatedRequest, res: Response) => {
  const removed = donationDb.deleteRewardTier(req.params.id, req.supportSession?.name);
  if (!removed) {
    res.status(404).json({ error: "Reward tier not found." });
    return;
  }
  res.json({ success: true });
});

app.put("/api/admin/donations/settings", requirePermission("donations"), (req: AuthenticatedRequest, res: Response) => {
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

app.get("/api/admin/theme-settings", requirePermission("themes"), (_req: AuthenticatedRequest, res: Response) => {
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
app.put("/api/admin/theme-settings", requirePermission("themes"), handleUpdateThemeSettings);
app.post("/api/admin/theme-settings", requirePermission("themes"), handleUpdateThemeSettings);

app.get("/api/click-animations", (_req: Request, res: Response) => {
  res.json({ animations: siteDb.getClickAnimations() });
});

app.get("/api/admin/click-animations", requirePermission("click_animations"), (_req: AuthenticatedRequest, res: Response) => {
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
app.put("/api/admin/click-animations", requirePermission("click_animations"), handleUpdateClickAnimations);
app.post("/api/admin/click-animations", requirePermission("click_animations"), handleUpdateClickAnimations);

const handleUpdateFloatingEmojis = (req: AuthenticatedRequest, res: Response) => {
  try {
    const settings = siteDb.updateFloatingEmojis(req.body || {});
    res.json({ settings });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to update floating emojis." });
  }
};
app.put("/api/admin/floating-emojis", requirePermission("click_animations"), handleUpdateFloatingEmojis);
app.post("/api/admin/floating-emojis", requirePermission("click_animations"), handleUpdateFloatingEmojis);

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
app.put("/api/admin/gamemode-visuals", requirePermission("categories"), handleUpdateGamemodeVisuals);
app.post("/api/admin/gamemode-visuals", requirePermission("categories"), handleUpdateGamemodeVisuals);

// ============================================================================
// SHARED STORE DATA — Supabase-backed CRUD
// All writes use the service-role client (trusted backend) and are awaited.
// Application authorization is enforced via requirePermission before any
// protected record is touched.
// ============================================================================

async function adminClient() {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Supabase is not configured on the backend.");
  return admin;
}

// ---- Store Config ----
app.get("/api/store/config", async (_req, res) => {
  try {
    const admin = await adminClient();
    const { data, error } = await admin.from("store_config").select("*").limit(1);
    if (error) throw error;
    res.json({ config: (data || [])[0] || null });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to read store config." });
  }
});

app.put("/api/store/config", requirePermission("settings"), async (req: AuthenticatedRequest, res) => {
  try {
    const admin = await adminClient();
    const patch = { ...(req.body || {}), updated_at: new Date().toISOString() };
    const { data, error } = await admin.from("store_config").upsert({ id: "default", ...patch }, { onConflict: "id" });
    if (error) throw error;
    res.json({ config: ((data as any[] | null) ?? [])[0] ?? null });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to update store config." });
  }
});

// Generic full-list sync helper: replaces a table's contents, but NEVER when
// the incoming list is empty (prevents empty browser storage from wiping data).
async function syncList(
  table: string,
  rows: any[],
  toDb: (row: any) => any
): Promise<{ ok: boolean; error?: string }> {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, error: "Refusing to sync an empty list (would erase existing data)." };
  }
  const admin = await adminClient();
  const mapped = rows.map(toDb);
  // Authoritative full-list sync: insert/upsert the incoming set first, then
  // remove rows that are no longer present. Upsert-first reduces the window in
  // which data is absent.
  const { error } = await admin.from(table).upsert(mapped, { onConflict: "id" });
  if (error) return { ok: false, error: error.message };
  const keepIds = mapped.map((r) => r.id).filter(Boolean);
  if (keepIds.length) {
    const { error: delError } = await admin.from(table).delete().not("id", "in", `(${keepIds.map((i) => `"${String(i).replace(/"/g, "")}"`).join(",")})`);
    if (delError) return { ok: false, error: delError.message };
  }
  return { ok: true };
}

app.put("/api/store/items/sync", requirePermission("products"), async (req: AuthenticatedRequest, res) => {
  try {
    const result = await syncList("store_items", req.body?.items || [], (i) => ({
      id: i.id,
      title: i.title,
      category: i.category,
      price: Number(i.price) || 0,
      description: i.description,
      image_url: i.image_url,
      display_order: i.display_order ?? 0,
      discount_percent: i.discount_percent ?? 0,
    }));
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to sync items." });
  }
});

app.put("/api/store/staff/sync", requirePermission("staff"), async (req: AuthenticatedRequest, res) => {
  try {
    const result = await syncList("staff_members", req.body?.staff || [], (s) => ({
      id: s.id, name: s.name, role: s.role, avatar_url: s.avatar_url,
      description: s.description, discord_id: s.discord_id,
      discord_username: s.discord_username, discord_url: s.discord_url,
    }));
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to sync staff." });
  }
});

app.put("/api/store/leaderboard/sync", requirePermission("supporters"), async (req: AuthenticatedRequest, res) => {
  try {
    const result = await syncList("leaderboard", req.body?.leaderboard || [], (l) => ({
      id: l.id, username: l.username, total_spent: Number(l.total_spent) || 0,
      rank: l.rank ?? null, updated_at: new Date().toISOString(),
    }));
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to sync leaderboard." });
  }
});

app.put("/api/store/updates/sync", requirePermission("updates"), async (req: AuthenticatedRequest, res) => {
  try {
    const result = await syncList("server_updates", req.body?.updates || [], (u) => ({
      id: u.id, title: u.title, content: u.content, image_url: u.imageUrl,
      image_urls: u.imageUrls ?? [], author: u.author, tag: u.tag,
      pinned: u.pinned ?? false, created_at: u.createdAt ?? new Date().toISOString(),
    }));
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to sync updates." });
  }
});

// ---- Store Items (Products) ----
app.get("/api/store/items", async (_req, res) => {
  try {
    const admin = await adminClient();
    const { data, error } = await admin.from("store_items").select("*").order("display_order", { ascending: true });
    if (error) throw error;
    res.json({ items: data || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to read store items." });
  }
});

app.post("/api/store/items", requirePermission("products"), async (req: AuthenticatedRequest, res) => {
  try {
    const admin = await adminClient();
    const item = { ...(req.body || {}), created_at: new Date().toISOString() };
    const { data, error } = await admin.from("store_items").insert(item).select();
    if (error) throw error;
    res.status(201).json({ item: ((data as any[] | null) ?? [])[0] ?? null });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to create store item." });
  }
});

app.put("/api/store/items/:id", requirePermission("products"), async (req: AuthenticatedRequest, res) => {
  try {
    const admin = await adminClient();
    const { data, error } = await admin.from("store_items").update(req.body || {}).eq("id", req.params.id).select();
    if (error) throw error;
    if (!data || data.length === 0) return res.status(404).json({ error: "Item not found." });
    res.json({ item: data[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to update store item." });
  }
});

app.delete("/api/store/items/:id", requirePermission("products"), async (req: AuthenticatedRequest, res) => {
  try {
    const admin = await adminClient();
    const { error } = await admin.from("store_items").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to delete store item." });
  }
});

// ---- Store Coupons (public-facing promo coupons) ----
app.get("/api/store/coupons", async (_req, res) => {
  try {
    const admin = await adminClient();
    const { data, error } = await admin.from("coupons").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ coupons: data || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to read coupons." });
  }
});

app.post("/api/store/coupons", requirePermission("discounts"), async (req: AuthenticatedRequest, res) => {
  try {
    const admin = await adminClient();
    const coupon = { ...(req.body || {}), created_at: new Date().toISOString() };
    const { data, error } = await admin.from("coupons").insert(coupon).select();
    if (error) throw error;
    res.status(201).json({ coupon: ((data as any[] | null) ?? [])[0] ?? null });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to create coupon." });
  }
});

app.delete("/api/store/coupons/:code", requirePermission("discounts"), async (req: AuthenticatedRequest, res) => {
  try {
    const admin = await adminClient();
    const { error } = await admin.from("coupons").delete().eq("code", req.params.code);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to delete coupon." });
  }
});

// ---- Leaderboard ----
app.get("/api/store/leaderboard", async (_req, res) => {
  try {
    const admin = await adminClient();
    const { data, error } = await admin.from("leaderboard").select("*").order("total_spent", { ascending: false });
    if (error) throw error;
    res.json({ leaderboard: data || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to read leaderboard." });
  }
});

app.post("/api/store/leaderboard", requirePermission("supporters"), async (req: AuthenticatedRequest, res) => {
  try {
    const admin = await adminClient();
    const entry = { ...(req.body || {}), updated_at: new Date().toISOString() };
    const { data, error } = await admin.from("leaderboard").upsert(entry, { onConflict: "id" });
    if (error) throw error;
    res.json({ entry: ((data as any[] | null) ?? [])[0] ?? null });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to save leaderboard entry." });
  }
});

app.delete("/api/store/leaderboard/:id", requirePermission("supporters"), async (req: AuthenticatedRequest, res) => {
  try {
    const admin = await adminClient();
    const { error } = await admin.from("leaderboard").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to delete leaderboard entry." });
  }
});

// ---- Store Staff ----
app.get("/api/store/staff", async (_req, res) => {
  try {
    const admin = await adminClient();
    const { data, error } = await admin.from("staff_members").select("*").order("created_at", { ascending: true });
    if (error) throw error;
    res.json({ staff: data || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to read store staff." });
  }
});

app.post("/api/store/staff", requirePermission("staff"), async (req: AuthenticatedRequest, res) => {
  try {
    const admin = await adminClient();
    const staff = { ...(req.body || {}), created_at: new Date().toISOString() };
    const { data, error } = await admin.from("staff_members").upsert(staff, { onConflict: "id" });
    if (error) throw error;
    res.json({ staff: ((data as any[] | null) ?? [])[0] ?? null });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to save store staff." });
  }
});

app.delete("/api/store/staff/:id", requirePermission("staff"), async (req: AuthenticatedRequest, res) => {
  try {
    const admin = await adminClient();
    const { error } = await admin.from("staff_members").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to delete store staff." });
  }
});

// ---- Activity Logs ----
app.get("/api/store/activity-logs", requirePermission("activity_log"), async (_req, res) => {
  try {
    const admin = await adminClient();
    const { data, error } = await admin.from("activity_logs").select("*").order("timestamp", { ascending: false }).limit(200);
    if (error) throw error;
    res.json({ logs: data || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to read activity logs." });
  }
});

app.post("/api/store/activity-logs", requirePermission("activity_log"), async (req: AuthenticatedRequest, res) => {
  try {
    const admin = await adminClient();
    const log = {
      id: `log-${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
      action: (req.body || {}).action,
      admin_name: (req.body || {}).adminName || "Admin",
      details: (req.body || {}).details,
      timestamp: new Date().toISOString(),
      type: (req.body || {}).type,
    };
    const { error } = await admin.from("activity_logs").insert(log);
    if (error) throw error;
    res.status(201).json({ log });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to write activity log." });
  }
});

// ---- Server Updates ----
app.get("/api/store/updates", async (_req, res) => {
  try {
    const admin = await adminClient();
    const { data, error } = await admin.from("server_updates").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ updates: data || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to read updates." });
  }
});

app.post("/api/store/updates", requirePermission("updates"), async (req: AuthenticatedRequest, res) => {
  try {
    const admin = await adminClient();
    const update = { ...(req.body || {}), created_at: new Date().toISOString() };
    const { data, error } = await admin.from("server_updates").upsert(update, { onConflict: "id" });
    if (error) throw error;
    res.json({ update: ((data as any[] | null) ?? [])[0] ?? null });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to save update." });
  }
});

app.delete("/api/store/updates/:id", requirePermission("updates"), async (req: AuthenticatedRequest, res) => {
  try {
    const admin = await adminClient();
    const { error } = await admin.from("server_updates").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to delete update." });
  }
});

// ---- Vote Links ----
app.get("/api/store/vote-links", async (_req, res) => {
  try {
    const admin = await adminClient();
    const { data, error } = await admin.from("vote_links").select("*").order("display_order", { ascending: true });
    if (error) throw error;
    res.json({ voteLinks: data || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to read vote links." });
  }
});

app.post("/api/store/vote-links", requirePermission("vote"), async (req: AuthenticatedRequest, res) => {
  try {
    const admin = await adminClient();
    const link = { ...(req.body || {}), created_at: new Date().toISOString() };
    const { data, error } = await admin.from("vote_links").upsert(link, { onConflict: "id" });
    if (error) throw error;
    res.json({ link: ((data as any[] | null) ?? [])[0] ?? null });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to save vote link." });
  }
});

app.delete("/api/store/vote-links/:id", requirePermission("vote"), async (req: AuthenticatedRequest, res) => {
  try {
    const admin = await adminClient();
    const { error } = await admin.from("vote_links").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to delete vote link." });
  }
});

// ---- Rules ----
app.get("/api/store/rules", async (_req, res) => {
  try {
    const admin = await adminClient();
    const { data, error } = await admin.from("rules_categories").select("*").order("display_order", { ascending: true });
    if (error) throw error;
    res.json({ rules: data || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to read rules." });
  }
});

app.post("/api/store/rules", requirePermission("rules"), async (req: AuthenticatedRequest, res) => {
  try {
    const admin = await adminClient();
    const rule = { ...(req.body || {}), created_at: new Date().toISOString() };
    const { data, error } = await admin.from("rules_categories").upsert(rule, { onConflict: "id" });
    if (error) throw error;
    res.json({ rule: ((data as any[] | null) ?? [])[0] ?? null });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to save rules." });
  }
});

app.delete("/api/store/rules/:id", requirePermission("rules"), async (req: AuthenticatedRequest, res) => {
  try {
    const admin = await adminClient();
    const { error } = await admin.from("rules_categories").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to delete rules." });
  }
});

// ---- Connection Guide ----
app.get("/api/store/connection-guide", async (_req, res) => {
  try {
    const admin = await adminClient();
    const { data, error } = await admin.from("connection_guide").select("*").limit(1);
    if (error) throw error;
    res.json({ guide: (data || [])[0] || null });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to read connection guide." });
  }
});

app.put("/api/store/connection-guide", requirePermission("guide"), async (req: AuthenticatedRequest, res) => {
  try {
    const admin = await adminClient();
    const patch = { ...(req.body || {}), id: "default", updated_at: new Date().toISOString() };
    const { data, error } = await admin.from("connection_guide").upsert(patch, { onConflict: "id" });
    if (error) throw error;
    res.json({ guide: ((data as any[] | null) ?? [])[0] ?? null });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to update connection guide." });
  }
});

// ---- Sale Config ----
app.get("/api/store/sale-config", async (_req, res) => {
  try {
    const admin = await adminClient();
    const { data, error } = await admin.from("sale_config").select("*").limit(1);
    if (error) throw error;
    res.json({ saleConfig: (data || [])[0] || null });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to read sale config." });
  }
});

app.put("/api/store/sale-config", requirePermission("discounts"), async (req: AuthenticatedRequest, res) => {
  try {
    const admin = await adminClient();
    const patch = { ...(req.body || {}), id: "default", updated_at: new Date().toISOString() };
    const { data, error } = await admin.from("sale_config").upsert(patch, { onConflict: "id" });
    if (error) throw error;
    res.json({ saleConfig: ((data as any[] | null) ?? [])[0] ?? null });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to update sale config." });
  }
});

// ---- Payment Gateway Config (protected — owner/admin only for writes) ----
app.get("/api/admin/gateway-config", requirePermission("payment_management"), async (_req, res) => {
  try {
    const admin = await adminClient();
    const { data, error } = await admin.from("payment_gateway_config").select("*").limit(1);
    if (error) throw error;
    const row = (data || [])[0] || null;
    // Return only public-safe fields; never return the key secret.
    const publicRow = row
      ? {
          id: row.id,
          razorpay_enabled: row.razorpay_enabled,
          razorpay_mode: row.razorpay_mode,
          razorpay_key_id: row.razorpay_key_id,
          webhook_secret_set: Boolean(row.webhook_secret),
          upi_qr_enabled: row.upi_qr_enabled,
          updated_at: row.updated_at,
        }
      : null;
    res.json({ config: publicRow });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to read gateway config." });
  }
});

app.post("/api/admin/gateway-config", requireOwnerOrAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const admin = await adminClient();
    const patch = { ...(req.body || {}), id: "default", updated_at: new Date().toISOString() };
    const { data, error } = await admin.from("payment_gateway_config").upsert(patch, { onConflict: "id" });
    if (error) throw error;
    const row = ((data as any[] | null) ?? [])[0] ?? null;
    const publicRow = row
      ? {
          id: row.id,
          razorpay_enabled: row.razorpay_enabled,
          razorpay_mode: row.razorpay_mode,
          razorpay_key_id: row.razorpay_key_id,
          webhook_secret_set: Boolean(row.webhook_secret),
          upi_qr_enabled: row.upi_qr_enabled,
          updated_at: row.updated_at,
        }
      : null;
    res.json({ config: publicRow });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to update gateway config." });
  }
});

async function startServer() {
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

  // Load all shared data from Supabase into the in-memory caches before
  // accepting requests, so every instance serves the same central data and
  // data survives restarts / Render redeployments.
  try {
    await Promise.all([
      supportDb.readAsync(),
      walletDb.readAsync(),
      siteDb.hydrateFromSupabase(),
      donationDb.hydrateFromSupabase(),
    ]);
    console.log("[startup] Supabase caches hydrated for support, wallet, site and donation data");
  } catch (err: any) {
    console.warn("[startup] Supabase cache hydration failed; will fall back to local JSON:", err?.message || String(err));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT} (Supabase-backed storefront)`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
