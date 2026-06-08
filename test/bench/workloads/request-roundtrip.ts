import { Client, Server } from '../../../src/index.ts';
import { cleanupSocket, parseBenchAdapter, parseIterations, tempSocketPath } from '../_shared.ts';

const adapter = parseBenchAdapter();

type EchoEvents = {
    echo: { msg: string };
    [key: string]: unknown;
};

const iterations = parseIterations(2, 'BENCH_ITERATIONS', 1_000);
const socketPath = tempSocketPath('libunix-bench-rr');

try {
    const server = await Server.create<EchoEvents>({ id: socketPath, adapter });
    const ready = Promise.withResolvers<void>();
    server.on('connection', (peer) => {
        peer.onRequest('echo', (data) => ({ echo: data.msg }));
        ready.resolve();
    });

    const client = await Client.connect<EchoEvents>({ id: socketPath, adapter });
    await ready.promise;

    for (let i = 0; i < iterations; i++) {
        const result = await client.request('echo', { msg: `bench-${i}` });
        if (typeof result !== 'object' || result === null || !('echo' in result)) {
            throw new Error('unexpected response');
        }
    }

    await client.disconnect();
    await server.close();
} finally {
    cleanupSocket(socketPath);
}
