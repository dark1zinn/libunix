| Command | Mean [ms] | Min [ms] | Max [ms] | Relative |
|:---|---:|---:|---:|---:|
| `bun /home/dark1zin/repos/1-Projects/libunix/test/bench/workloads/protocol-frames.ts 50000` | 129.6 ± 2.9 | 123.8 | 135.9 | 2.47 ± 0.11 |
| `bun /home/dark1zin/repos/1-Projects/libunix/test/bench/workloads/stream-accumulator.ts 10000` | 219.4 ± 24.8 | 204.3 | 295.5 | 4.18 ± 0.50 |
| `BENCH_ADAPTER=bun bun /home/dark1zin/repos/1-Projects/libunix/test/bench/workloads/request-roundtrip.ts 1000` | 77.9 ± 3.1 | 74.3 | 93.5 | 1.48 ± 0.08 |
| `BENCH_ADAPTER=node bun /home/dark1zin/repos/1-Projects/libunix/test/bench/workloads/request-roundtrip.ts 1000` | 99.4 ± 4.9 | 93.7 | 109.6 | 1.89 ± 0.12 |
| `BENCH_ADAPTER=bun bun /home/dark1zin/repos/1-Projects/libunix/test/bench/workloads/concurrent-requests.ts 1000` | 68.3 ± 2.7 | 63.6 | 75.6 | 1.30 ± 0.07 |
| `BENCH_ADAPTER=node bun /home/dark1zin/repos/1-Projects/libunix/test/bench/workloads/concurrent-requests.ts 1000` | 85.2 ± 9.8 | 78.3 | 134.2 | 1.62 ± 0.20 |
| `BENCH_ADAPTER=bun bun /home/dark1zin/repos/1-Projects/libunix/test/bench/workloads/emit-throughput.ts 5000` | 52.5 ± 2.0 | 46.2 | 61.0 | 1.00 |
| `BENCH_ADAPTER=node bun /home/dark1zin/repos/1-Projects/libunix/test/bench/workloads/emit-throughput.ts 5000` | 203.0 ± 9.0 | 193.7 | 231.0 | 3.87 ± 0.22 |
| `BENCH_ADAPTER=bun bun /home/dark1zin/repos/1-Projects/libunix/test/bench/workloads/full-stack-e2e.ts 500` | 78.4 ± 6.1 | 72.0 | 110.3 | 1.49 ± 0.13 |
| `BENCH_ADAPTER=node bun /home/dark1zin/repos/1-Projects/libunix/test/bench/workloads/full-stack-e2e.ts 500` | 95.0 ± 2.7 | 90.7 | 102.5 | 1.81 ± 0.08 |
