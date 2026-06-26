# ARCHITECTURE.md — YT SMM Exchange

Updated: 2026-06-25

## Stack
- Runtime: Cloudflare Workers (edge)
- Framework: Hono v4 (TypeScript)
- DB: Cloudflare D1 (SQLite) — `yt-smm-exchange-db`
- KV: Cloudflare KV — rate limits + pricing config
- Auth: Better Auth v1.6 (Google OAuth + email/password)
- Frontend: React 18 + Vite + CF Pages
- Repo: github.com/dungnthe130669/yt-smm-exchange

## Economy Model
Single currency: **coin** (internal unit).
- Earners complete tasks → earn coins (locked 48h → credited)
- Buyers create tasks → escrow coins
- USD only at deposit/withdraw gateway (not yet implemented — stub wallet)
- Pricing: admin-set per action type via KV `pricing_config`

## Task Types
Tasks have `action_type: SUBSCRIBE | LIKE | COMMENT`
- SUBSCRIBE: earner subscribes to a YouTube channel
- LIKE: earner likes a YouTube video
- COMMENT: earner posts a preset comment on a video
All tasks use coin escrow (`task_type='CROSS_SUB'` in DB, PAY removed from UI)

## Data Models (after 7 migrations)
- `user` (Better Auth): id, email, name, image, role, group_id, youtube_channel_id*, youtube_refresh_token*, youtube_linked_at*
- `wallets`: user_id, balance_vnd (USD micro-deposit stub), xu_balance (coins), xu_pending
- `tasks`: id, buyer_id, channel_id, channel_url, action_type, video_id, video_title, video_thumbnail, comment_template, target_count, xu_per_unit, escrow_xu, deadline, status
- `task_claims`: id, task_id, claimer_id, status (CLAIMED→SUBMITTED→VERIFIED|REJECTED|EXPIRED), xu_amount, xu_status (NONE→LOCKED→CREDITED|CLAWED_BACK)
- `task_claim_results`: claim_id, comment_id, rating
- `user_groups`: id, name, max_channels
- `user_linked_channels`: id, user_id, channel_id, channel_name, channel_avatar, channel_url, refresh_token
- `wallet_txns`: audit log for all coin movements
- `ip_task_log`: ip_hash + channel_id dedup (lifetime)
- `user_completed_channels`: user_id + channel_id (hide from feed)

## Auth Flow
1. Login via Google OAuth or email/password (Better Auth)
2. `authMiddleware` reads `role` from DB (BA session doesn't expose custom columns)
3. Use `GET /api/me` for user data incl. role (NOT `/auth/get-session`)
4. YouTube channel linking: separate OAuth flow with `youtube.readonly + youtube.force-ssl` scopes
5. Refresh tokens stored in `user_linked_channels`, used server-side for verify

## Earn Flow
1. User visits `/` (EarnPage) → `GET /tasks/random` returns 1 eligible task
2. User clicks CTA → optional channel picker if >1 linked channel
3. `POST /claims/:taskId/claim` → creates claim, checks task-to-task cooldown
4. `POST /youtube-verify/:claimId/perform` → atomic subscribe/like/comment + verify → credit coins
5. Coins locked 48h → cron unlocks → credited to wallet

## Deploy
```bash
# API
cd ~/projects/yt-smm-exchange/api && npx wrangler deploy

# Frontend
cd ~/projects/yt-smm-exchange/frontend
npm run build
npx wrangler pages deploy dist --project-name yt-smm-exchange
```

## Key Routes
- `GET /api/me` — user + role (use instead of /auth/get-session)
- `GET /api/tasks/random?action_type=` — 1 eligible task
- `POST /claims/:taskId/claim` — claim task (fraud checks + cooldown)
- `POST /youtube-verify/:claimId/perform` — server-side action + verify
- `GET /api/youtube-link/status` — linked channels array + quota
- `GET /api/tasks/pricing` — public pricing config
- `GET/PUT /api/admin/pricing` — admin pricing CRUD
- `GET/PUT /api/admin/users/:id/role` — role management
- `GET/POST/PUT/DELETE /api/admin/groups` — user group CRUD

## ⚠️ Notable Issues
- Cron `checkStillSubscribed` is stub — does not verify actual subscription status
- Wallet deposit/withdraw: UI shows "Coming soon", no backend implementation yet
- `lib/fraud.ts` is dead code — routes inline their own fraud checks
- `balance_vnd` column repurposed as micro-USD deposit balance (stub, unused in task flow)
- `task_type` column kept as 'CROSS_SUB' for all new tasks (PAY removed from UI)
- Better Auth `user` table columns are camelCase (`createdAt`, not `created_at`)
