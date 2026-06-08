#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/_common.sh"

# Fixed-iteration overview: protocol (adapter-agnostic) + IPC/E2E bun vs node.
hyperfine \
    --warmup 1 \
    --export-markdown "$DOCS_DIR/summary.md" \
    --export-json "$RESULTS_DIR/summary.json" \
    "bun $WORKLOADS/protocol-frames.ts 50000" \
    "bun $WORKLOADS/stream-accumulator.ts 10000" \
    "BENCH_ADAPTER=bun bun $WORKLOADS/request-roundtrip.ts 1000" \
    "BENCH_ADAPTER=node bun $WORKLOADS/request-roundtrip.ts 1000" \
    "BENCH_ADAPTER=bun bun $WORKLOADS/concurrent-requests.ts 1000" \
    "BENCH_ADAPTER=node bun $WORKLOADS/concurrent-requests.ts 1000" \
    "BENCH_ADAPTER=bun bun $WORKLOADS/emit-throughput.ts 5000" \
    "BENCH_ADAPTER=node bun $WORKLOADS/emit-throughput.ts 5000" \
    "BENCH_ADAPTER=bun bun $WORKLOADS/full-stack-e2e.ts 500" \
    "BENCH_ADAPTER=node bun $WORKLOADS/full-stack-e2e.ts 500"

bash "$(dirname "$0")/run-protocol.sh"
bash "$(dirname "$0")/run-ipc.sh"
bash "$(dirname "$0")/run-ipc-node.sh"
bash "$(dirname "$0")/run-e2e.sh"
bash "$(dirname "$0")/run-e2e-node.sh"
