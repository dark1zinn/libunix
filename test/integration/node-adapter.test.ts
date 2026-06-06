import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Client, Server } from '../../src/index.ts';
import { lifecycleDebugState } from '../../src/utils/lifecycle.ts';

function tempSocketPath(): string {
    return join(tmpdir(), `libunix-node-e2e-${crypto.randomUUID()}.sock`);
}

describe('integration: node adapter', () => {
    let socketPath = tempSocketPath();

    afterEach(() => {
        try {
            if (existsSync(socketPath)) {
                unlinkSync(socketPath);
            }
        } catch {
            // ignore
        }
        socketPath = tempSocketPath();
    });

    test('public barrel Client + Server request/response', async () => {
        type EchoEvents = {
            echo: { msg: string };
            [key: string]: unknown;
        };

        const server = await Server.create<EchoEvents>({ id: socketPath, adapter: 'node' });
        const ready = Promise.withResolvers<void>();
        server.on('connection', (peer) => {
            peer.onRequest('echo', (data) => ({ echo: data.msg }));
            ready.resolve();
        });

        const client = await Client.connect<EchoEvents>({ id: socketPath, adapter: 'node' });
        await ready.promise;

        const result = await client.request('echo', { msg: 'hello' });
        expect(result).toEqual({ echo: 'hello' });

        await client.disconnect();
        await server.close();
        expect(lifecycleDebugState().refCount).toBe(0);
    });

    test('concurrent requests keep correlation routing', async () => {
        type TaskEvents = {
            task: { id: number };
            [key: string]: unknown;
        };

        const server = await Server.create<TaskEvents>({ id: socketPath, adapter: 'node' });
        const ready = Promise.withResolvers<void>();
        server.on('connection', (peer) => {
            peer.onRequest('task', (data: { id: number }) => ({ id: data.id, ok: true }));
            ready.resolve();
        });

        const client = await Client.connect<TaskEvents>({ id: socketPath, adapter: 'node' });
        await ready.promise;

        const count = 12;
        const results = await Promise.all(
            Array.from({ length: count }, (_, id) => client.request('task', { id })),
        );

        for (let id = 0; id < count; id++) {
            expect(results[id]).toEqual({ id, ok: true });
        }

        await client.disconnect();
        await server.close();
    });

    test('rapid emit and request loop', async () => {
        type LoopEvents = {
            ping: null;
            tick: { n: number };
            [key: string]: unknown;
        };

        const server = await Server.create<LoopEvents>({ id: socketPath, adapter: 'node' });
        const ready = Promise.withResolvers<void>();
        server.on('connection', (peer) => {
            peer.onRequest('ping', () => 'pong');
            peer.on('tick', () => {});
            ready.resolve();
        });

        const client = await Client.connect<LoopEvents>({ id: socketPath, adapter: 'node' });
        await ready.promise;

        for (let i = 0; i < 25; i++) {
            await client.emit('tick', { n: i });
            const pong = await client.request('ping', null);
            expect(pong).toBe('pong');
        }

        await client.disconnect();
        await server.close();
    });
});
