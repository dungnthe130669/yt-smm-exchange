#!/usr/bin/env bash
# scripts/workflow.sh — AI change workflow orchestrator
#
# Usage:
#   bash scripts/workflow.sh            → typecheck + E2E only (no deploy)
#   bash scripts/workflow.sh deploy     → typecheck + deploy API + deploy frontend + E2E
#   bash scripts/workflow.sh api        → typecheck + deploy API only
#   bash scripts/workflow.sh frontend   → typecheck + build + deploy frontend only
#   bash scripts/workflow.sh e2e        → E2E only
#   bash scripts/workflow.sh e2e tasks  → E2E suite=tasks only
#
# Exit codes: 0 = all passed, 1 = something failed

set -e
ROOT="$(git rev-parse --show-toplevel)"
CMD="${1:-check}"
SUITE="${2:-}"

ok() { echo "  ✅ $1"; }
fail() { echo "  ❌ $1"; exit 1; }
section() { echo ""; echo "── $1 ──────────────────────────────"; }

# ─── Typecheck ────────────────────────────────────────────────────────────────
typecheck() {
  section "Typecheck"
  cd "$ROOT/api"
  npx tsc --noEmit --pretty false && ok "API" || fail "API typecheck"
  cd "$ROOT/frontend"
  npx tsc -b --pretty false && ok "Frontend" || fail "Frontend typecheck"
}

# ─── Deploy API ───────────────────────────────────────────────────────────────
deploy_api() {
  section "Deploy API"
  cd "$ROOT/api"
  npx wrangler deploy 2>&1 | tail -3
  ok "API deployed"
}

# ─── Deploy Frontend ──────────────────────────────────────────────────────────
deploy_frontend() {
  section "Deploy Frontend"
  cd "$ROOT/frontend"
  npm run build 2>&1 | tail -3
  npx wrangler pages deploy dist --project-name yt-smm-exchange 2>&1 | tail -3
  ok "Frontend deployed"
}

# ─── E2E ──────────────────────────────────────────────────────────────────────
run_e2e() {
  section "E2E Tests"
  cd "$ROOT"
  if [ -n "$SUITE" ]; then
    python3 scripts/e2e_test.py --suite "$SUITE"
  else
    python3 scripts/e2e_test.py
  fi
}

# ─── Main ─────────────────────────────────────────────────────────────────────
echo "🚀 YT SMM Exchange workflow: $CMD"

case "$CMD" in
  check)
    typecheck
    run_e2e
    ;;
  deploy)
    typecheck
    deploy_api
    deploy_frontend
    run_e2e
    ;;
  api)
    typecheck
    deploy_api
    ;;
  frontend)
    typecheck
    deploy_frontend
    ;;
  e2e)
    run_e2e
    ;;
  *)
    echo "Unknown command: $CMD"
    echo "Usage: bash scripts/workflow.sh [check|deploy|api|frontend|e2e] [suite]"
    exit 1
    ;;
esac

echo ""
echo "✅ Done"
