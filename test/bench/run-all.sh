#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_common.sh"

# Fixed-iteration overview (one row per workload at representative defaults).
hyperfine \
    --warmup 1 \
    --export-markdown "$DOCS_DIR/summary.md" \
    --export-json "$RESULTS_DIR/summary.json" \
    "bun $WORKLOADS/protocol-frames.ts 50000" \
    "bun $WORKLOADS/stream-accumulator.ts 10000" \
    "bun $WORKLOADS/request-roundtrip.ts 1000" \
    "bun $WORKLOADS/concurrent-requests.ts 1000" \
    "bun $WORKLOADS/emit-throughput.ts 5000" \
    "bun $WORKLOADS/full-stack-e2e.ts 500"

# Parameter scans per suite (updates protocol.md, ipc.md, e2e.md).
bash "$(dirname "$0")/run-protocol.sh"
bash "$(dirname "$0")/run-ipc.sh"
bash "$(dirname "$0")/run-e2e.sh"
