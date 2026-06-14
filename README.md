# YT SMM Exchange

**YouTube subscriber exchange marketplace** — người dùng mua sub bằng VND (pay orders) hoặc kiếm xu bằng cách đi sub kênh khác rồi dùng xu để mua sub (cross-sub economy).

---

## Metadata

| Field | Value |
|---|---|
| **Project name** | yt-smm-exchange |
| **CF Account** | dngtiennguyen600@gmail.com |
| **CF Account ID** | `5428747acff6eee82f9d2fba7162ba22` |
| **Worker name** | `yt-smm-exchange-api` |
| **D1 DB name** | `yt-smm-exchange-db` |
| **KV namespace** | `RATE_KV` |
| **Pages project** | `yt-smm-exchange-frontend` |
| **Repo** | github.com/dungnthe130669/yt-smm-exchange |

---

## Architecture

```
CF Pages (Vite React SPA)  →  CF Worker (Hono API)
                                    ├── Better Auth (Google OAuth)
                                    ├── D1 SQLite (users, tasks, claims, wallets)
                                    ├── KV (IP rate limit counters, daily caps)
                                    └── YouTube Data API v3 (verify + delta poll)
```

## Stack

| Layer | Tech |
|---|---|
| API | Hono + Cloudflare Workers |
| DB | D1 SQLite |
| Rate limit | KV Namespace |
| Auth | Better Auth (Google OAuth provider) |
| Frontend | Vite + React + TypeScript |
| Deploy | CF Pages (frontend) + CF Workers (API) |
| Cron | CF Cron Trigger (every 6h) |

---

## Secrets required

Set via `wrangler secret put KEY` in `/api` directory:

| Secret | Description |
|---|---|
| `BETTER_AUTH_SECRET` | Random 32-char string (auth session signing) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `YOUTUBE_API_KEY` | YouTube Data API v3 key (public channels.list) |

---

## First-time setup

```bash
# 1. Create D1 database
cd api
npm run d1:create
# Copy database_id output → update wrangler.jsonc d1_databases[0].database_id

# 2. Create KV namespace
npm run kv:create
# Copy id output → update wrangler.jsonc kv_namespaces[0].id

# 3. Run migrations
npm run migrate:local   # local dev
npm run migrate:remote  # production

# 4. Set secrets
wrangler secret put BETTER_AUTH_SECRET
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put YOUTUBE_API_KEY

# 5. Generate types
npm run types
```

---

## Development

```bash
# API (Workers)
cd api
npm run dev        # wrangler dev at localhost:8787

# Frontend (Vite)
cd frontend
npm run dev        # localhost:5173
```

## Deploy

```bash
# API
cd api
CLOUDFLARE_API_TOKEN=<token> npm run deploy

# Frontend — deploy via CF Pages (connect GitHub repo)
# Or: cd frontend && npx wrangler pages deploy dist --project-name yt-smm-exchange-frontend
```

---

## Business model

### Pay orders (VND → sub)
- Buyer trả VND → escrow lock
- Earner claim task → wait 20–45 min → sub → OAuth verify
- Verify pass → delivered_count++ → escrow partial release
- Xu reward locked 48h → cron verify still-subbed → credited

### Cross-sub economy (xu → sub)
- Earner làm task PAY → kiếm xu (locked 48h)
- Earner tạo CROSS_SUB task → escrow xu
- Other users claim CROSS_SUB task → earn xu
- Platform keeps spread (earn 10 xu/sub, spend 14 xu/sub)

### Tier priority
- PAY tasks: `priority=1` — shown first in feed
- CROSS_SUB tasks: `priority=2` — shown after PAY
- Max 50 sub per CROSS_SUB order (MVP cap)

---

## Fraud prevention

| Layer | Mechanism |
|---|---|
| IP dedup | 1 IP never subs same channel twice (D1 `ip_task_log`) |
| IP daily cap | Max 3 claims/IP/day (KV counter, TTL 24h) |
| Account daily cap | Max 8 claims/account/day |
| Random delay | 20–45 min wait between claim and submit |
| Max concurrent | 3 active (unsubmitted) claims per user |
| Xu lock | 48h before xu credited |
| Churn detection | Cron check every 6h → claw back if unsub |
| Double-submit guard | `UNIQUE(task_id, youtube_channel_id)` in D1 |

---

## Anti-patterns (DO NOT)

- ❌ Raw SQL in route handlers — use `src/db/queries/`
- ❌ Credit xu before verify completes
- ❌ Store YouTube OAuth tokens long-term (YouTube TOS violation)
- ❌ Trust client-reported subscriber count — always verify server-side

---

## Error format (all API responses)

```json
{ "error": "MACHINE_READABLE_CODE", "message": "Thông báo tiếng Việt" }
```

---

## File structure

```
yt-smm-exchange/
├── api/                          # Hono CF Worker
│   ├── src/
│   │   ├── index.ts              # App entry, middleware mount
│   │   ├── bindings.ts           # CF env bindings types
│   │   ├── types.ts              # Shared domain types
│   │   ├── routes/
│   │   │   ├── auth.ts           # Better Auth handler
│   │   │   ├── tasks.ts          # Task CRUD + feed
│   │   │   ├── claims.ts         # Claim + submit + verify
│   │   │   ├── wallet.ts         # Wallet balance + txns
│   │   │   └── cron.ts           # Xu unlock cron handler
│   │   ├── middleware/
│   │   │   ├── ip.ts             # IP hash injection
│   │   │   └── auth.ts           # Session auth + requireAuth()
│   │   ├── services/             # Business logic (pure)
│   │   ├── db/queries/           # Typed D1 query functions
│   │   └── lib/
│   │       ├── youtube.ts        # YouTube API wrapper
│   │       ├── xu.ts             # Xu economy logic
│   │       └── fraud.ts          # Anti-abuse checks
│   ├── migrations/
│   │   └── 0001_init.sql         # Full schema
│   └── wrangler.jsonc
├── frontend/                     # Vite React SPA
│   └── src/
│       ├── pages/
│       ├── components/
│       └── lib/
└── README.md
```

---

## Implementation phases

- [x] Phase 1: Foundation (scaffold, migrations, Better Auth, Vite)
- [ ] Phase 2: Pay Orders (create task, feed, claim, verify, xu credit)
- [ ] Phase 3: Cross-sub Economy (xu tasks, tier feed, top-up)
- [ ] Phase 4: Anti-abuse (IP middleware, delay, cron churn)
- [ ] Phase 5: Frontend (feed, claim flow, wallet, dashboard)
- [ ] Phase 6: E2E Testing
