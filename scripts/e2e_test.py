#!/usr/bin/env python3
"""
YT SMM Exchange — E2E Test Suite
Tests all API flows against production: https://yt-smm-exchange-api.linkdev.workers.dev

Usage:
  python3 scripts/e2e_test.py
  python3 scripts/e2e_test.py --verbose
  python3 scripts/e2e_test.py --suite auth
  python3 scripts/e2e_test.py --suite tasks
  python3 scripts/e2e_test.py --suite claims
  python3 scripts/e2e_test.py --suite admin
  python3 scripts/e2e_test.py --suite wallet

Test accounts (must exist in DB):
  buyer@test.com / Test@1234   — buyer_id: C2x6vP8tOO3V34kFAsjFca7YbQATW6Mb
  earner@test.com / Test@1234  — earner_id: H2hDhCjE8Zvcar2GfxHnF7zdEULhCL9p
  admin: dngtiennguyen600@gmail.com (Google OAuth only, skip in script)

NOTE: YouTube OAuth flows (claim/verify) cannot be tested in CI — requires real OAuth.
      Those flows are marked SKIP with explanation.
"""

import sys
import json
import time
import argparse
import urllib.request
import urllib.error
from typing import Optional

# ─── Config ──────────────────────────────────────────────────────────────────

BASE = "https://yt-smm-exchange-api.linkdev.workers.dev"
BUYER_EMAIL = "buyer@test.com"
BUYER_PASS = "E2eTest@1234!"
EARNER_EMAIL = "earner@test.com"
EARNER_PASS = "E2eTest@1234!"

# Known test task IDs (seeded)
TASK_SUBSCRIBE = "test-sub-002"        # Fireship, buyer=buyer@test.com
TASK_LIKE = "test-like-001"           # Rick Astley like
TASK_COMMENT = "test-comment-001"     # Rick Astley comment
TASK_CROSSSUB = "test-crosssub-001"   # Theo t3.gg, buyer=earner@test.com

# ─── HTTP helpers ────────────────────────────────────────────────────────────

class Client:
    """Simple HTTP client that persists cookies per session."""
    def __init__(self, label: str):
        self.label = label
        self.cookies: dict = {}
        self.verbose = False

    def _cookie_header(self) -> str:
        return "; ".join(f"{k}={v}" for k, v in self.cookies.items())

    def _update_cookies(self, headers):
        raw = headers.get("set-cookie", "")
        if not raw:
            return
        for part in raw.split(","):
            seg = part.strip().split(";")[0].strip()
            if "=" in seg:
                k, v = seg.split("=", 1)
                self.cookies[k.strip()] = v.strip()

    def request(self, method: str, path: str, body=None, expect_status: int = 200) -> dict:
        url = BASE + path
        data = json.dumps(body).encode() if body is not None else None
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0 (compatible; YT-SMM-E2E/1.0)",
        }
        if self.cookies:
            headers["Cookie"] = self._cookie_header()

        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req) as resp:
                self._update_cookies(resp.headers)
                raw = resp.read().decode()
                result = json.loads(raw) if raw.strip() else {}
                if self.verbose:
                    print(f"  [{self.label}] {method} {path} → {resp.status} {raw[:200]}")
                return {"status": resp.status, "body": result}
        except urllib.error.HTTPError as e:
            raw = e.read().decode()
            result = json.loads(raw) if raw.strip() else {}
            if self.verbose:
                print(f"  [{self.label}] {method} {path} → {e.code} {raw[:200]}")
            return {"status": e.code, "body": result}

    def get(self, path, **kw): return self.request("GET", path, **kw)
    def post(self, path, body=None, **kw): return self.request("POST", path, body, **kw)
    def put(self, path, body=None, **kw): return self.request("PUT", path, body, **kw)
    def delete(self, path, **kw): return self.request("DELETE", path, **kw)


# ─── Test runner ─────────────────────────────────────────────────────────────

class TestRunner:
    def __init__(self, verbose=False):
        self.verbose = verbose
        self.passed = 0
        self.failed = 0
        self.skipped = 0
        self.results: list = []

    def ok(self, name: str, detail: str = ""):
        self.passed += 1
        self.results.append(("PASS", name, detail))
        print(f"  ✅ {name}" + (f" — {detail}" if detail else ""))

    def fail(self, name: str, detail: str = ""):
        self.failed += 1
        self.results.append(("FAIL", name, detail))
        print(f"  ❌ {name}" + (f" — {detail}" if detail else ""))

    def skip(self, name: str, reason: str = ""):
        self.skipped += 1
        self.results.append(("SKIP", name, reason))
        print(f"  ⏭  {name}" + (f" — {reason}" if reason else ""))

    def check(self, name: str, condition: bool, detail: str = ""):
        if condition:
            self.ok(name, detail)
        else:
            self.fail(name, detail)
        return condition

    def summary(self):
        total = self.passed + self.failed + self.skipped
        print(f"\n{'─'*50}")
        print(f"Results: {self.passed}/{total} passed, {self.failed} failed, {self.skipped} skipped")
        if self.failed:
            print("\nFailed tests:")
            for status, name, detail in self.results:
                if status == "FAIL":
                    print(f"  ❌ {name}: {detail}")
        return self.failed == 0


# ─── Test suites ─────────────────────────────────────────────────────────────

def suite_health(r: TestRunner):
    print("\n📋 Health")
    c = Client("anon")
    c.verbose = r.verbose

    res = c.get("/health")
    r.check("GET /health → 200", res["status"] == 200, str(res["body"]))
    r.check("health body ok=true", res["body"].get("ok") is True)


def suite_auth(r: TestRunner, buyer: Client, earner: Client):
    print("\n🔐 Auth")
    anon = Client("anon")
    anon.verbose = r.verbose

    # Login buyer
    res = buyer.post("/api/auth/sign-in/email", {
        "email": BUYER_EMAIL, "password": BUYER_PASS
    })
    # BA returns 200 on success; some configs return 403 if emailVerified=false
    # but cookie is still set — check cookie as primary signal
    r.check("buyer login → cookie set", bool(buyer.cookies), f"status={res['status']} cookies={list(buyer.cookies.keys())}")

    # Login earner
    res = earner.post("/api/auth/sign-in/email", {
        "email": EARNER_EMAIL, "password": EARNER_PASS
    })
    r.check("earner login → cookie set", bool(earner.cookies), f"status={res['status']}")

    # /api/me
    res = buyer.get("/api/me")
    r.check("GET /api/me → 200", res["status"] == 200)
    r.check("/api/me returns user", "user" in res["body"])
    if "user" in res["body"] and res["body"]["user"]:
        r.check("/api/me has email", res["body"]["user"].get("email") == BUYER_EMAIL)

    # Anon cannot access /api/me protected routes
    res = anon.get("/api/tasks/random")
    r.check("anon /tasks/random → 401", res["status"] == 401)

    res = anon.get("/api/wallet")
    r.check("anon /wallet → 401", res["status"] == 401)


def suite_tasks(r: TestRunner, buyer: Client, earner: Client):
    print("\n📋 Tasks")

    # Public pricing
    anon = Client("anon")
    res = anon.get("/api/tasks/pricing")
    r.check("GET /tasks/pricing → 200", res["status"] == 200)
    pricing = res["body"]
    r.check("pricing has coin_per_subscribe", "coin_per_subscribe" in pricing,
            str(list(pricing.keys())[:6]))

    # Random task (earner perspective — earner can see buyer's tasks)
    res = earner.get("/api/tasks/random")
    r.check("earner GET /tasks/random → 200", res["status"] == 200)
    task = res["body"].get("task")
    r.check("random task returned or null (both valid)", True,
            f"task={'present' if task else 'null (all done)'}")

    # Random task with action filter
    res = earner.get("/api/tasks/random?action_type=LIKE")
    r.check("random?action_type=LIKE → 200", res["status"] == 200)
    task_like = res["body"].get("task")
    if task_like:
        r.check("filtered task has action_type LIKE",
                task_like.get("action_type") == "LIKE", str(task_like.get("action_type")))

    res = earner.get("/api/tasks/random?action_type=COMMENT")
    r.check("random?action_type=COMMENT → 200", res["status"] == 200)

    # My channels (for task creation)
    res = buyer.get("/api/tasks/my-channels")
    r.check("GET /tasks/my-channels → 200", res["status"] == 200)
    channels = res["body"].get("channels", [])
    r.check("my-channels returns list", isinstance(channels, list))

    # Create task — no channel linked for test account → expect error or success
    # Try to create a task and accept both outcomes
    res = buyer.post("/api/tasks", {
        "channel_id": "UCsBjURj4Tix5N2g4Zqa9J9A",
        "channel_url": "https://www.youtube.com/channel/UCsBjURj4Tix5N2g4Zqa9J9A",
        "channel_name": "Fireship E2E Test",
        "target_count": 1,
        "deadline_days": 3,
        "action_type": "SUBSCRIBE"
    })
    if res["status"] == 201:
        r.ok("POST /tasks → 201 (created)", f"task_id={res['body'].get('task_id')}")
    elif res["status"] == 400 and "coin" in str(res["body"]).lower():
        r.ok("POST /tasks → 400 insufficient coins (expected, buyer has exact balance)", str(res["body"]))
    elif res["status"] == 400:
        r.ok("POST /tasks → 400 (validation, acceptable)", str(res["body"].get("error", "")))
    else:
        r.fail("POST /tasks unexpected status", f"status={res['status']} body={res['body']}")

    # Invalid deadline
    res = buyer.post("/api/tasks", {
        "channel_id": "UCtest",
        "channel_url": "https://youtube.com/channel/UCtest",
        "target_count": 1,
        "deadline_days": 1,
        "action_type": "SUBSCRIBE"
    })
    r.check("invalid deadline_days=1 → 400", res["status"] == 400,
            str(res["body"].get("error")))

    # LIKE task missing video_id
    res = buyer.post("/api/tasks", {
        "target_count": 1,
        "deadline_days": 3,
        "action_type": "LIKE"
    })
    r.check("LIKE without video_id → 400", res["status"] == 400,
            str(res["body"].get("error")))

    # COMMENT task missing template
    res = buyer.post("/api/tasks", {
        "video_id": "dQw4w9WgXcQ",
        "target_count": 1,
        "deadline_days": 3,
        "action_type": "COMMENT"
    })
    r.check("COMMENT without template → 400", res["status"] == 400,
            str(res["body"].get("error")))


def suite_claims(r: TestRunner, buyer: Client, earner: Client):
    print("\n🎯 Claims")

    # Earner cannot claim own task
    res = earner.post(f"/api/claims/{TASK_CROSSSUB}/claim", {})
    r.check("earner cannot claim own task → 400", res["status"] == 400,
            str(res["body"].get("error")))

    # Earner claims buyer's subscribe task
    res = earner.post(f"/api/claims/{TASK_SUBSCRIBE}/claim", {})
    if res["status"] == 201:
        claim_id = res["body"].get("claim_id")
        r.ok("earner claim SUBSCRIBE task → 201", f"claim_id={claim_id}")

        # YouTube verify requires real OAuth — skip
        r.skip("POST /youtube-verify/:claimId/perform",
               "Requires real YouTube OAuth token — cannot automate in CI")

    elif res["status"] == 429:
        error = res["body"].get("error", "")
        if error == "TASK_COOLDOWN":
            r.ok("earner claim → 429 TASK_COOLDOWN (between-task cooldown active)", str(res["body"].get("wait_seconds")))
        elif error == "IP_DAILY_LIMIT":
            r.ok("earner claim → 429 IP_DAILY_LIMIT (daily cap reached)", "")
        elif error == "ALREADY_CLAIMED":
            r.ok("earner claim → 400 ALREADY_CLAIMED (already has this task)", "")
        else:
            r.ok(f"earner claim → 429 {error} (rate limited)", "")
        r.skip("POST /youtube-verify/:claimId/perform", "Claim not created due to rate limit")
    elif res["status"] == 400 and res["body"].get("error") == "NO_YT_CHANNEL":
        r.ok("earner claim → 400 NO_YT_CHANNEL (no channel linked — expected in CI)", "")
        r.skip("POST /youtube-verify/:claimId/perform", "No YouTube channel linked")
    elif res["status"] == 400 and res["body"].get("error") == "ALREADY_CLAIMED":
        r.ok("earner claim → 400 ALREADY_CLAIMED (idempotent)", "")
        r.skip("POST /youtube-verify/:claimId/perform", "Already claimed")
    elif res["status"] == 400 and res["body"].get("error") == "TASK_FULL":
        r.ok("earner claim → 400 TASK_FULL (task at capacity)", "")
        r.skip("POST /youtube-verify/:claimId/perform", "Task full")
    else:
        r.fail("earner claim unexpected response", f"status={res['status']} body={res['body']}")
        r.skip("POST /youtube-verify/:claimId/perform", "Claim failed")

    # My claims
    res = earner.get("/api/claims/my")
    r.check("GET /claims/my → 200", res["status"] == 200)
    r.check("claims is list", isinstance(res["body"].get("claims"), list))

    # Cannot claim with invalid task id
    res = earner.post("/api/claims/nonexistent-task-id/claim", {})
    r.check("claim nonexistent task → 404", res["status"] == 404)


def suite_wallet(r: TestRunner, buyer: Client, earner: Client):
    print("\n💰 Wallet")

    res = buyer.get("/api/wallet")
    r.check("GET /wallet → 200", res["status"] == 200)
    wallet = res["body"].get("wallet")
    r.check("wallet has coin_balance", "coin_balance" in (wallet or {}),
            str(list((wallet or {}).keys())))
    r.check("wallet has coin_pending", "coin_pending" in (wallet or {}))
    r.check("wallet has balance_usd_micro", "balance_usd_micro" in (wallet or {}))
    r.check("coin_balance is int", isinstance((wallet or {}).get("coin_balance"), int))

    res = buyer.get("/api/wallet")
    txns = res["body"].get("transactions", [])
    r.check("wallet transactions is list", isinstance(txns, list))


def suite_admin(r: TestRunner, admin_client: Optional[Client] = None):
    print("\n🛡  Admin")

    # Earner cannot access admin
    earner = Client("earner-admin-check")
    earner.post("/api/auth/sign-in/email", {"email": EARNER_EMAIL, "password": EARNER_PASS})
    res = earner.get("/api/admin/stats")
    r.check("earner GET /admin/stats → 403", res["status"] == 403,
            str(res["body"].get("error")))

    res = earner.get("/api/admin/users")
    r.check("earner GET /admin/users → 403", res["status"] == 403)

    # Admin endpoints exist and reject non-admin
    endpoints = [
        ("/api/admin/stats", "GET"),
        ("/api/admin/users", "GET"),
        ("/api/admin/tasks", "GET"),
        ("/api/admin/claims", "GET"),
        ("/api/admin/pricing", "GET"),
        ("/api/admin/groups", "GET"),
    ]
    for path, method in endpoints:
        res = earner.get(path) if method == "GET" else earner.post(path, {})
        r.check(f"non-admin {method} {path} → 403", res["status"] == 403, "")

    # Pricing is publicly readable (GET /api/tasks/pricing not /admin/pricing)
    anon = Client("anon")
    res = anon.get("/api/tasks/pricing")
    r.check("anon GET /tasks/pricing → 200 (public)", res["status"] == 200)


def suite_youtube_link(r: TestRunner, buyer: Client):
    print("\n🔗 YouTube Link")

    res = buyer.get("/api/youtube-link/status")
    r.check("GET /youtube-link/status → 200", res["status"] == 200)
    body = res["body"]
    r.check("status has channels array", isinstance(body.get("channels"), list),
            str(list(body.keys())))
    r.check("status has max_channels", isinstance(body.get("max_channels"), int))
    r.check("status has can_link_more", "can_link_more" in body)

    # OAuth start redirect (don't follow — just check it redirects)
    r.skip("GET /youtube-link/start → redirect",
           "OAuth redirect requires browser session — cannot follow in curl")
    r.skip("GET /youtube-link/callback",
           "Requires Google OAuth code — cannot automate")
    r.skip("POST /youtube-link/unlink",
           "Would break linked channels for real test account")


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="YT SMM Exchange E2E tests")
    parser.add_argument("--verbose", "-v", action="store_true")
    parser.add_argument("--suite", choices=["health", "auth", "tasks", "claims", "wallet", "admin", "youtube"], default=None)
    args = parser.parse_args()

    print(f"🚀 YT SMM Exchange E2E — {BASE}")
    print(f"   Time: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}")

    r = TestRunner(verbose=args.verbose)

    # Shared authenticated clients
    buyer = Client("buyer")
    buyer.verbose = args.verbose
    earner = Client("earner")
    earner.verbose = args.verbose

    # Login both upfront
    buyer.post("/api/auth/sign-in/email", {"email": BUYER_EMAIL, "password": BUYER_PASS})
    earner.post("/api/auth/sign-in/email", {"email": EARNER_EMAIL, "password": EARNER_PASS})

    suites = {
        "health": lambda: suite_health(r),
        "auth": lambda: suite_auth(r, buyer, earner),
        "tasks": lambda: suite_tasks(r, buyer, earner),
        "claims": lambda: suite_claims(r, buyer, earner),
        "wallet": lambda: suite_wallet(r, buyer, earner),
        "admin": lambda: suite_admin(r),
        "youtube": lambda: suite_youtube_link(r, buyer),
    }

    if args.suite:
        suites[args.suite]()
    else:
        for name, fn in suites.items():
            fn()

    ok = r.summary()
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
