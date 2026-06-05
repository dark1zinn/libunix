#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_common.sh"

hyperfine \
    --warmup 1 \
    -L iterations 1000,5000,10000 \
    --export-markdown "$DOCS_DIR/ipc.md" \
    --export-json "$RESULTS_DIR/ipc.json" \
    "bun $WORKLOADS/request-roundtrip.ts {iterations}" \
    "bun $WORKLOADS/concurrent-requests.ts {iterations}" \
    "bun $WORKLOADS/emit-throughput.ts {iterations}"
