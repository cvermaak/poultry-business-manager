#!/usr/bin/env bash
set -euo pipefail

if ! git rev-parse --show-toplevel >/dev/null 2>&1; then
  echo "Run this script from inside the Railway Git repository." >&2
  exit 1
fi

cd "$(git rev-parse --show-toplevel)"
pnpm exec vitest run \
  server/financial-period-errors.test.ts \
  server/payment-posting.test.ts \
  server/invoice-generation.test.ts \
  server/invoice-tabs-ui.test.ts
pnpm run build
