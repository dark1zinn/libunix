# Bench suite

Hyperfine-driven workloads under `workloads/`. See [docs/benchmarks/README.md](../../docs/benchmarks/README.md) for tracked reports and regeneration policy.

## Prerequisites

1. `hyperfine` is provided by [flake.nix](../../flake.nix).
2. After flake changes: `direnv reload` (or `nix develop`).

```bash
hyperfine --version
```

## Run

```bash
bun run bench
bun run bench:protocol
bun run bench:ipc
bun run bench:e2e
```

Or invoke scripts directly:

```bash
bash test/bench/run-all.sh
```

## Single workload (no hyperfine)

```bash
bun test/bench/workloads/request-roundtrip.ts 500
BENCH_ITERATIONS=2000 bun test/bench/workloads/protocol-frames.ts
```
