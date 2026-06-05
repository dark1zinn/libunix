import { Client, Server } from '../../../src/index.ts';
import { cleanupSocket, parseIterations, tempSocketPath } from '../_shared.ts';

type TickEvents = {
    tick: { n: number };
    [key: string]: unknown;
};

const iterations = parseIterations(2, 'BENCH_ITERATIONS', 5_000);
const socketPath = tempSocketPath('libunix-bench-emit');

try {
    const server = await Server.create<TickEvents>({ id: socketPath, adapter: 'bun' });
    const ready = Promise.withResolvers<void>();
    server.on('connection', (peer) => {
        peer.on('tick', () => {});
        ready.resolve();
    });

    const client = await Client.connect<TickEvents>({ id: socketPath, adapter: 'bun' });
    await ready.promise;

    for (let i = 0; i < iterations; i++) {
        await client.emit('tick', { n: i });
    }

    await client.disconnect();
    await server.close();
} finally {
    cleanupSocket(socketPath);
}
