#!/usr/bin/env bash
# scripts/setup-hooks.sh — install git hooks for this project
# Run once after cloning: bash scripts/setup-hooks.sh

set -e
ROOT="$(git rev-parse --show-toplevel)"
HOOKS_DIR="$ROOT/.git/hooks"

echo "📦 Installing git hooks..."

# pre-commit: typecheck
cat > "$HOOKS_DIR/pre-commit" << 'HOOK'
#!/usr/bin/env bash
# pre-commit: typecheck both API and frontend
set -e
ROOT="$(git rev-parse --show-toplevel)"

echo "⚙️  pre-commit: typechecking..."

cd "$ROOT/api"
if ! npx tsc --noEmit --pretty false 2>&1; then
  echo "❌ API typecheck failed — fix errors before committing"
  exit 1
fi
echo "  ✅ API"

cd "$ROOT/frontend"
if ! npx tsc -b --pretty false 2>&1; then
  echo "❌ Frontend typecheck failed — fix errors before committing"
  exit 1
fi
echo "  ✅ Frontend"

echo "✅ pre-commit passed"
HOOK

# pre-push: E2E
cat > "$HOOKS_DIR/pre-push" << 'HOOK'
#!/usr/bin/env bash
# pre-push: E2E test suite against production
set -e
ROOT="$(git rev-parse --show-toplevel)"

if [ "${SKIP_E2E:-0}" = "1" ]; then
  echo "⏭  pre-push: E2E skipped (SKIP_E2E=1)"
  exit 0
fi

BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$BRANCH" != "main" && "$BRANCH" != feat/* && "$BRANCH" != refactor/* && "$BRANCH" != fix/* ]]; then
  echo "⏭  pre-push: E2E skipped for branch '$BRANCH'"
  exit 0
fi

echo "🧪 pre-push: running E2E against production..."
cd "$ROOT"

if python3 scripts/e2e_test.py; then
  echo "✅ pre-push: E2E passed"
  exit 0
else
  echo ""
  echo "❌ E2E failed — push blocked. Fix above, or: SKIP_E2E=1 git push"
  exit 1
fi
HOOK

chmod +x "$HOOKS_DIR/pre-commit" "$HOOKS_DIR/pre-push"
echo "✅ Hooks installed: pre-commit (typecheck) + pre-push (E2E)"
echo ""
echo "Usage:"
echo "  git commit        → runs typecheck automatically"
echo "  git push          → runs E2E automatically"
echo "  SKIP_E2E=1 git push  → skip E2E (emergency)"
