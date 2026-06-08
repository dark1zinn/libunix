# Benchmarks

Performance baselines for **libunix**, measured with [hyperfine](https://github.com/sharkdp/hyperfine). Addresses [issue #4](https://github.com/dark1zinn/libunix/issues/4).

## Tracked reports

| File                         | Suite              | Contents                                                       |
| ---------------------------- | ------------------ | -------------------------------------------------------------- |
| [summary.md](./summary.md)   | All workloads      | Protocol + IPC/E2E **bun vs node** at default iteration counts |
| [protocol.md](./protocol.md) | Protocol           | Frame/envelope codec + stream accumulator (adapter-agnostic)   |
| [ipc.md](./ipc.md)           | IPC (bun)          | Request roundtrip, concurrent requests, emit throughput        |
| [ipc-node.md](./ipc-node.md) | IPC (node)         | Same workloads with `BENCH_ADAPTER=node`                       |
| [e2e.md](./e2e.md)           | Integration (bun)  | Full-stack mixed emit + request + concurrent usage             |
| [e2e-node.md](./e2e-node.md) | Integration (node) | Same e2e workload with `node:net` adapter                      |

Raw JSON exports are written to `test/bench/results/` (gitignored).

## Regenerate

Requires `hyperfine` from the Nix dev shell (`direnv reload` after flake changes).

```bash
bun run bench              # summary + all parameter scans (bun + node IPC/e2e)
bun run bench:protocol     # protocol only
bun run bench:ipc          # IPC, bun adapter
bun run bench:ipc:node     # IPC, node adapter
bun run bench:e2e          # e2e, bun adapter
bun run bench:e2e:node     # e2e, node adapter
```

After meaningful performance changes, re-run benches and **commit updated `.md` files** here so git history tracks evolution.

## Workloads

| Workload              | Concern                                                            | Adapter         |
| --------------------- | ------------------------------------------------------------------ | --------------- |
| `protocol-frames`     | `encodeRequest` / `encodeFrame` / `decodeFrame` / `decodeEnvelope` | N/A             |
| `stream-accumulator`  | Chunked stream reassembly                                          | N/A             |
| `request-roundtrip`   | Sequential `client.request` over UDS                               | `BENCH_ADAPTER` |
| `concurrent-requests` | Parallel requests (`BENCH_CONCURRENCY`, default 32)                | `BENCH_ADAPTER` |
| `emit-throughput`     | Sequential `client.emit` delivery                                  | `BENCH_ADAPTER` |
| `full-stack-e2e`      | Mixed emit + request + concurrent batch                            | `BENCH_ADAPTER` |

## Environment

- `BENCH_ADAPTER` — `bun` (default) or `node` for IPC/E2E workloads
- `BENCH_ITERATIONS` — override default iteration count when running a workload directly
- `BENCH_CONCURRENCY` — parallel batch size for `concurrent-requests` (default 32)

Node adapter benches run workloads via **Bun** with `BENCH_ADAPTER=node` (exercises `node:net` inside Bun, same as integration tests).
