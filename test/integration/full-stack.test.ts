import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Client, LibunixError, Server } from '../../src/index.ts';
import { MessageType } from '../../src/protocol/constants.ts';
import { encodeEmit } from '../../src/protocol/envelope.ts';
import { encodeFrame, zeroCorrelation } from '../../src/protocol/frame.ts';
import { createBunTransportAdapter } from '../../src/transport/bun.ts';
import { lifecycleDebugState } from '../../src/utils/lifecycle.ts';

function tempSocketPath(): string {
    return join(tmpdir(), `libunix-e2e-${crypto.randomUUID()}.sock`);
}

function splitIntoChunks(data: Uint8Array, size: number): Uint8Array[] {
    const chunks: Uint8Array[] = [];
    for (let i = 0; i < data.length; i += size) {
        chunks.push(data.subarray(i, i + size));
    }
    return chunks;
}

describe('integration: full stack', () => {
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

        const server = await Server.create<EchoEvents>({ id: socketPath, adapter: 'bun' });
        const ready = Promise.withResolvers<void>();
        server.on('connection', (peer) => {
            peer.onRequest('echo', (data) => ({ echo: data.msg }));
            ready.resolve();
        });

        const client = await Client.connect<EchoEvents>({ id: socketPath, adapter: 'bun' });
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

        const server = await Server.create<TaskEvents>({ id: socketPath, adapter: 'bun' });
        const ready = Promise.withResolvers<void>();
        server.on('connection', (peer) => {
            peer.onRequest('task', (data: { id: number }) => ({ id: data.id, ok: true }));
            ready.resolve();
        });

        const client = await Client.connect<TaskEvents>({ id: socketPath, adapter: 'bun' });
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

    test('server ingests frames split into 2-byte chunks', async () => {
        type Events = { 'raw:ping': null; [key: string]: unknown };
        const server = await Server.create<Events>({ id: socketPath, adapter: 'bun' });
        const gotPing = Promise.withResolvers<void>();
        server.on('connection', (peer) => {
            peer.on('raw:ping', () => {
                gotPing.resolve();
            });
        });

        const transport = createBunTransportAdapter();
        const rawClient = await transport.connect(socketPath, { onData: () => {} });

        const payload = encodeEmit('raw:ping', null);
        const frame = encodeFrame(MessageType.EventEmit, zeroCorrelation(), payload);
        for (const chunk of splitIntoChunks(frame, 2)) {
            transport.write(rawClient, chunk);
        }

        await expect(gotPing.promise).resolves.toBeUndefined();

        await transport.close(rawClient);
        await server.close();
    });

    test('removes stale non-listening socket file on Server.create', async () => {
        writeFileSync(socketPath, '');
        expect(existsSync(socketPath)).toBe(true);

        const server = await Server.create({ id: socketPath, adapter: 'bun' });
        const ready = Promise.withResolvers<void>();
        server.on('connection', (peer) => {
            peer.onRequest('up', () => ({ up: true }));
            ready.resolve();
        });

        const client = await Client.connect({ id: socketPath, adapter: 'bun' });
        await ready.promise;
        await expect(client.request('up', null)).resolves.toEqual({ up: true });

        await client.disconnect();
        await server.close();
    });

    test('EADDRINUSE when live server already holds socket', async () => {
        const server = await Server.create({ id: socketPath, adapter: 'bun' });
        await expect(Server.create({ id: socketPath, adapter: 'bun' })).rejects.toMatchObject({
            code: 'EADDRINUSE',
        } satisfies Partial<LibunixError>);
        await server.close();
    });

    test('rapid emit and request loop', async () => {
        type LoopEvents = {
            ping: null;
            tick: { n: number };
            [key: string]: unknown;
        };

        const server = await Server.create<LoopEvents>({ id: socketPath, adapter: 'bun' });
        const ready = Promise.withResolvers<void>();
        server.on('connection', (peer) => {
            peer.onRequest('ping', () => 'pong');
            peer.on('tick', () => {});
            ready.resolve();
        });

        const client = await Client.connect<LoopEvents>({ id: socketPath, adapter: 'bun' });
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
