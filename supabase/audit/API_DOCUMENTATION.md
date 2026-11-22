# WONDERMC — API Documentation

## Conventions

- JSON request/response bodies.
- Protected endpoints require `Authorization: Bearer <token>` (the signed session token).
- Errors: `{ "error": "message" }` with an appropriate HTTP status.
- All writes go through the backend using the Supabase service-role key; responses
  are only sent after the database operation completes.

## Public endpoints (no auth)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health + dependency status (Supabase reachability) |
| GET | `/api/payments/gateway-config` | Public gateway config (no secrets) |
| GET | `/api/store-categories` | Store categories |
| GET | `/api/theme-settings` | Theme settings |
| GET | `/api/click-animations` | Click animations |
| GET | `/api/gamemode-visuals` | Gamemode visuals |
| GET | `/api/store/items` | Store products |
| GET | `/api/store/coupons` | Store promo coupons |
| GET | `/api/store/leaderboard` | Top supporters |
| GET | `/api/store/staff` | Store staff |
| GET | `/api/store/updates` | Server updates/news |
| GET | `/api/store/vote-links` | Vote sites |
| GET | `/api/store/rules` | Rules categories |
| GET | `/api/store/connection-guide` | Connection guide |
| GET | `/api/store/sale-config` | Sale config |
| GET | `/api/store/config` | Store configuration |
| GET | `/api/donations/overview` | Public donation overview |
| POST | `/api/donations/submit` | Submit a donation request |
| POST | `/api/payments/razorpay/webhook` | Razorpay webhook (signature-verified) |
| POST | `/api/payments/manual-upi` | Manual UPI checkout (guest allowed) |

## Auth endpoints

| Method | Path | Description | Rate limited |
|--------|------|-------------|--------------|
| POST | `/api/support/auth/user-session` | Issue customer session token | yes |
| POST | `/api/admin/auth/owner-login` | Owner login | yes |
| POST | `/api/admin/auth/subadmin-login` | Sub-admin login | yes |
| POST | `/api/support/auth/staff-login` | Staff login | yes |

## Support endpoints (session token required)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/support/stream` | SSE realtime stream |
| GET | `/api/support/tickets` | List tickets for session |
| GET | `/api/support/tickets/:id` | Ticket bundle (messages/attachments/history) |
| POST | `/api/support/tickets` | Create ticket |
| POST | `/api/support/tickets/:id/messages` | Post message |
| POST | `/api/support/tickets/:id/read` | Mark read |
| PATCH | `/api/support/tickets/:id` | Staff update (staff session) |
| DELETE | `/api/support/tickets/:id` | Staff delete (staff session) |
| POST | `/api/support/tickets/:id/rating` | Submit rating |
| GET | `/api/support/ratings` | List ratings |
| GET | `/api/support/notifications` | List notifications |
| POST | `/api/support/notifications/mark-read` | Mark notifications read |
| GET/POST/DELETE | `/api/support/staff-members` | Manage support staff (staff session) |
| GET/POST | `/api/support/discord-config` | Discord webhook config (staff/admin) |

## Wallet & payment endpoints (user session token required)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/wallet/me` | Wallet + transactions + recharges + payments |
| GET | `/api/wallet/stream` | SSE wallet stream |
| POST | `/api/wallet/recharge/initiate` | Initiate a recharge |
| POST | `/api/wallet/recharge/verify` | Verify + credit recharge (signature verified, idempotent) |
| POST | `/api/wallet/recharge/fail` | Mark recharge failed |
| POST | `/api/wallet/recharge/manual-upi` | Manual UPI recharge proof |
| POST | `/api/wallet/coupons/redeem` | Redeem wallet coupon |
| GET | `/api/wallet/coupons/my-redemptions` | My coupon redemptions |
| POST | `/api/payments/gateway/sandbox-authorize` | Test-mode payment authorization |
| POST | `/api/payments/checkout/wallet` | Pay fully with wallet |
| POST | `/api/payments/checkout/initiate` | Initiate online/combined checkout |
| POST | `/api/payments/checkout/verify` | Verify + complete checkout |
| POST | `/api/payments/checkout/fail` | Mark checkout failed |
| GET | `/api/orders` | My orders (staff: all with permission) |

## Admin endpoints (permission-guarded)

Each route below requires the listed server-side permission. Owner/admin pass all.

| Method | Path | Permission |
|--------|------|------------|
| GET/PUT | `/api/admin/orders/:id` etc. | `orders` |
| GET/POST/PATCH/DELETE | `/api/admin/wallets...` | `wallet` |
| GET/PATCH/POST | `/api/admin/payments...` | `payment_management` |
| GET/POST | `/api/admin/gateway-settings` | `payment_management` (write: owner/admin) |
| GET/POST/PATCH/DELETE | `/api/admin/coupons...` | `coupon_management` |
| GET/POST/DELETE | `/api/admin/donations...` | `donations` |
| PUT/POST | `/api/admin/theme-settings` | `themes` |
| PUT/POST | `/api/admin/click-animations` | `click_animations` |
| PUT/POST | `/api/admin/floating-emojis` | `click_animations` |
| PUT/POST | `/api/admin/gamemode-visuals` | `categories` |
| PUT | `/api/admin/store-categories/sync` | `categories` |
| GET/POST | `/api/admin/gateway-config` | `payment_management` (write: owner/admin) |
| GET/POST/DELETE | `/api/admin/auth/subadmins` | owner/admin only |
| GET/POST | `/api/store/activity-logs` | `activity_log` |
| PUT | `/api/store/items/sync` | `products` |
| PUT | `/api/store/staff/sync` | `staff` |
| PUT | `/api/store/leaderboard/sync` | `supporters` |
| PUT | `/api/store/updates/sync` | `updates` |
| POST/DELETE | `/api/store/vote-links` | `vote` |
| POST/DELETE | `/api/store/rules` | `rules` |
| PUT | `/api/store/connection-guide` | `guide` |
| PUT | `/api/store/sale-config` | `discounts` |
| PUT | `/api/store/config` | `settings` |
| POST | `/api/store/coupons` | `discounts` |

Notes:
- Sync endpoints refuse empty lists to prevent an empty browser cache from
  erasing Supabase data.
- Gateway secret endpoints never return the Razorpay key secret or webhook
  secret (only booleans/previews).
