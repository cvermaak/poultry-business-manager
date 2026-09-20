#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PATCH_FILE="$SCRIPT_DIR/railway-financial-attention.patch"

if [[ ! -f "$PATCH_FILE" ]]; then
  echo "Missing patch: $PATCH_FILE" >&2
  exit 1
fi

if ! git rev-parse --show-toplevel >/dev/null 2>&1; then
  echo "Run this script from inside the Railway Git repository." >&2
  exit 1
fi

cd "$(git rev-parse --show-toplevel)"
git apply --check "$PATCH_FILE"
git apply "$PATCH_FILE"

echo "Dashboard Financial Attention patch applied."
echo "Next: pnpm install --frozen-lockfile && bash ./validate-railway-financial-attention.sh"
git status --short
