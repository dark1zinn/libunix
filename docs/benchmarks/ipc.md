| Command | Mean [ms] | Min [ms] | Max [ms] | Relative |
|:---|---:|---:|---:|---:|
| `bun test/bench/workloads/request-roundtrip.ts 500` | 77.6 ± 2.6 | 71.7 | 82.8 | 1.53 ± 0.10 |
| `bun test/bench/workloads/concurrent-requests.ts 500` | 79.4 ± 16.7 | 63.4 | 138.0 | 1.57 ± 0.34 |
| `bun test/bench/workloads/emit-throughput.ts 500` | 50.6 ± 2.9 | 46.4 | 57.0 | 1.00 |
| `bun test/bench/workloads/request-roundtrip.ts 1000` | 99.2 ± 6.8 | 91.1 | 116.5 | 1.96 ± 0.18 |
| `bun test/bench/workloads/concurrent-requests.ts 1000` | 91.3 ± 13.3 | 80.2 | 149.6 | 1.80 ± 0.28 |
| `bun test/bench/workloads/emit-throughput.ts 1000` | 54.4 ± 8.3 | 47.5 | 85.4 | 1.08 ± 0.18 |
