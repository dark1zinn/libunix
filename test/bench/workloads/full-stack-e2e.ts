import { Client, Server } from '../../../src/index.ts';
import { cleanupSocket, parseIterations, tempSocketPath } from '../_shared.ts';

type E2EEvents = {
    ping: null;
    tick: { n: number };
    task: { id: number };
    [key: string]: unknown;
};

const iterations = parseIterations(2, 'BENCH_ITERATIONS', 500);
const concurrentBatchSize = 8;
const socketPath = tempSocketPath('libunix-bench-e2e');

try {
    const server = await Server.create<E2EEvents>({ id: socketPath, adapter: 'bun' });
    const ready = Promise.withResolvers<void>();
    server.on('connection', (peer) => {
        peer.onRequest('ping', () => 'pong');
        peer.onRequest('task', (data: { id: number }) => ({ id: data.id, ok: true }));
        peer.on('tick', () => {});
        ready.resolve();
    });

    const client = await Client.connect<E2EEvents>({ id: socketPath, adapter: 'bun' });
    await ready.promise;

    for (let i = 0; i < iterations; i++) {
        await client.emit('tick', { n: i });
        const pong = await client.request('ping', null);
        if (pong !== 'pong') {
            throw new Error('unexpected ping response');
        }

        if (i % 10 === 0) {
            const results = await Promise.all(
                Array.from({ length: concurrentBatchSize }, (_, id) =>
                    client.request('task', { id: i * concurrentBatchSize + id }),
                ),
            );
            for (let j = 0; j < concurrentBatchSize; j++) {
                const result = results[j] as { id: number; ok: boolean };
                if (!result.ok) {
                    throw new Error('unexpected task response');
                }
            }
        }
    }

    await client.disconnect();
    await server.close();
} finally {
    cleanupSocket(socketPath);
}
