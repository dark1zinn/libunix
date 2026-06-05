| Command | Mean [ms] | Min [ms] | Max [ms] | Relative |
|:---|---:|---:|---:|---:|
| `bun test/bench/workloads/protocol-frames.ts 50000` | 165.7 ± 24.3 | 152.7 | 257.2 | 2.67 ± 0.41 |
| `bun test/bench/workloads/stream-accumulator.ts 10000` | 299.3 ± 32.6 | 274.7 | 360.8 | 4.83 ± 0.57 |
| `bun test/bench/workloads/request-roundtrip.ts 1000` | 98.5 ± 13.0 | 83.2 | 153.2 | 1.59 ± 0.22 |
| `bun test/bench/workloads/concurrent-requests.ts 1000` | 92.0 ± 18.3 | 81.9 | 183.8 | 1.48 ± 0.30 |
| `bun test/bench/workloads/emit-throughput.ts 5000` | 62.0 ± 2.9 | 55.4 | 69.9 | 1.00 |
| `bun test/bench/workloads/full-stack-e2e.ts 500` | 99.1 ± 9.6 | 85.8 | 130.3 | 1.60 ± 0.17 |
