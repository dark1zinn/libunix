#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_common.sh"

hyperfine \
    --warmup 1 \
    -L iterations 100,500,1000 \
    --export-markdown "$DOCS_DIR/e2e.md" \
    --export-json "$RESULTS_DIR/e2e.json" \
    "bun $WORKLOADS/full-stack-e2e.ts {iterations}"
