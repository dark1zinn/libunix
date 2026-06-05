| Command                                               |    Mean [ms] | Min [ms] | Max [ms] |    Relative |
| :---------------------------------------------------- | -----------: | -------: | -------: | ----------: |
| `bun test/bench/workloads/protocol-frames.ts 1000`    |   42.0 ± 3.9 |     32.5 |     53.1 |        1.00 |
| `bun test/bench/workloads/stream-accumulator.ts 1000` |   73.7 ± 8.9 |     65.4 |    111.3 | 1.75 ± 0.27 |
| `bun test/bench/workloads/protocol-frames.ts 5000`    |   56.6 ± 9.1 |     50.4 |     96.4 | 1.35 ± 0.25 |
| `bun test/bench/workloads/stream-accumulator.ts 5000` | 196.1 ± 21.1 |    177.5 |    261.9 | 4.67 ± 0.66 |
