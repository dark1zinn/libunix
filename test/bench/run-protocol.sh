#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_common.sh"

hyperfine \
    --warmup 2 \
    -L iterations 10000,50000 \
    --export-markdown "$DOCS_DIR/protocol.md" \
    --export-json "$RESULTS_DIR/protocol.json" \
    "bun $WORKLOADS/protocol-frames.ts {iterations}" \
    "bun $WORKLOADS/stream-accumulator.ts {iterations}"
