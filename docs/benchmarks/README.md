# Benchmarks

Performance baselines for **libunix**, measured with [hyperfine](https://github.com/sharkdp/hyperfine). Addresses [issue #4](https://github.com/dark1zinn/libunix/issues/4).

## Tracked reports

| File                         | Suite         | Contents                                                   |
| ---------------------------- | ------------- | ---------------------------------------------------------- |
| [summary.md](./summary.md)   | All workloads | Single-run comparison at default iteration counts          |
| [protocol.md](./protocol.md) | Protocol      | Frame/envelope codec + stream accumulator (parameter scan) |
| [ipc.md](./ipc.md)           | IPC           | Request roundtrip, concurrent requests, emit throughput    |
| [e2e.md](./e2e.md)           | Integration   | Full-stack mixed emit + request + concurrent usage         |

Raw JSON exports are written to `test/bench/results/` (gitignored).

## Regenerate

Requires `hyperfine` from the Nix dev shell (`direnv reload` after flake changes).

```bash
bun run bench              # summary + all parameter scans
bun run bench:protocol     # protocol only
bun run bench:ipc          # targeted IPC only
bun run bench:e2e          # integration e2e only
```

After meaningful performance changes, re-run benches and **commit updated `.md` files** here so git history tracks evolution.

## Workloads

| Workload              | Concern                                                                |
| --------------------- | ---------------------------------------------------------------------- |
| `protocol-frames`     | `encodeRequest` / `encodeFrame` / `decodeFrame` / `decodeEnvelope`     |
| `stream-accumulator`  | Chunked stream reassembly                                              |
| `request-roundtrip`   | Sequential `client.request` over UDS                                   |
| `concurrent-requests` | Parallel requests (`BENCH_CONCURRENCY`, default 32)                    |
| `emit-throughput`     | Sequential `client.emit` delivery                                      |
| `full-stack-e2e`      | Realistic mixed session: emit, ping request, periodic concurrent batch |

## Environment

- `BENCH_ITERATIONS` — override default iteration count when running a workload directly
- `BENCH_CONCURRENCY` — parallel batch size for `concurrent-requests` (default 32)
