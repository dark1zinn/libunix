import { Client, Server } from '../../../src/index.ts';
import { cleanupSocket, parseConcurrency, parseIterations, tempSocketPath } from '../_shared.ts';

type TaskEvents = {
    task: { id: number };
    [key: string]: unknown;
};

const iterations = parseIterations(2, 'BENCH_ITERATIONS', 1_000);
const concurrency = parseConcurrency(32);
const socketPath = tempSocketPath('libunix-bench-concurrent');

try {
    const server = await Server.create<TaskEvents>({ id: socketPath, adapter: 'bun' });
    const ready = Promise.withResolvers<void>();
    server.on('connection', (peer) => {
        peer.onRequest('task', (data: { id: number }) => ({ id: data.id, ok: true }));
        ready.resolve();
    });

    const client = await Client.connect<TaskEvents>({ id: socketPath, adapter: 'bun' });
    await ready.promise;

    let completed = 0;
    while (completed < iterations) {
        const batchSize = Math.min(concurrency, iterations - completed);
        const results = await Promise.all(
            Array.from({ length: batchSize }, (_, offset) =>
                client.request('task', { id: completed + offset }),
            ),
        );
        for (let i = 0; i < batchSize; i++) {
            const result = results[i] as { id: number; ok: boolean };
            if (result.id !== completed + i || result.ok !== true) {
                throw new Error('unexpected concurrent response');
            }
        }
        completed += batchSize;
    }

    await client.disconnect();
    await server.close();
} finally {
    cleanupSocket(socketPath);
}
