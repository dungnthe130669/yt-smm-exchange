# YT SMM Exchange API — Worker

Xem README.md gốc ở thư mục root: ../README.md

## Quick commands

```bash
npm run dev              # wrangler dev
npm run deploy           # wrangler deploy
npm run migrate:local    # D1 migration local
npm run migrate:remote   # D1 migration remote (prod)
npm run types            # generate CF bindings types
npm run typecheck        # tsc --noEmit
```

## Secrets

```bash
wrangler secret put BETTER_AUTH_SECRET
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put YOUTUBE_API_KEY
```

## Wrangler.jsonc notes

- **account_id**: `5428747acff6eee82f9d2fba7162ba22` (dngtiennguyen600@gmail.com)
- **database_id**: PLACEHOLDER — chạy `npm run d1:create` rồi update
- **KV id**: PLACEHOLDER — chạy `npm run kv:create` rồi update
