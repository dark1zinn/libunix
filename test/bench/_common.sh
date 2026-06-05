#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RESULTS_DIR="$ROOT/test/bench/results"
DOCS_DIR="$ROOT/docs/benchmarks"
WORKLOADS="$ROOT/test/bench/workloads"

mkdir -p "$RESULTS_DIR" "$DOCS_DIR"

if ! command -v hyperfine >/dev/null 2>&1; then
    echo "hyperfine not found; add it via flake.nix and run: direnv reload" >&2
    exit 1
fi
