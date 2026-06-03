import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Client } from '../../src/client/client.ts';
import { PendingRequestRegistry } from '../../src/client/pending.ts';
import { connectWithRetry } from '../../src/client/reconnect.ts';
import { Server } from '../../src/server/server.ts';
import { LibunixError } from '../../src/utils/errors.ts';

function tempSocketPath(): string {
    return join(tmpdir(), `libunix-client-${crypto.randomUUID()}.sock`);
}

describe('PendingRequestRegistry', () => {
    test('times out unresolved requests', async () => {
        const registry = new PendingRequestRegistry();
        const promise = registry.register('abc', 25);
        await expect(promise).rejects.toMatchObject({
            code: 'TIMEOUT',
        } satisfies Partial<LibunixError>);
    });

    test('rejectAll fails pending requests', async () => {
        const registry = new PendingRequestRegistry();
        const promise = registry.register('abc', 5_000);
        registry.rejectAll(new LibunixError('CONNECTION_LOST', 'gone'));
        await expect(promise).rejects.toMatchObject({
            code: 'CONNECTION_LOST',
        } satisfies Partial<LibunixError>);
    });
});

describe('connectWithRetry', () => {
    test('retries until connectOnce succeeds', async () => {
        let calls = 0;
        const result = await connectWithRetry(
            async () => {
                calls += 1;
                if (calls < 3) {
                    throw new Error('connection refused');
                }
                return 'connected';
            },
            { attempts: 5, backoff: 'fixed', initialDelay: 10 },
        );
        expect(result).toBe('connected');
        expect(calls).toBe(3);
    });
});

describe('Client', () => {
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

    test('request receives success response from server', async () => {
        const server = await Server.create({ id: socketPath, adapter: 'bun' });
        const peerReady = Promise.withResolvers<void>();
        server.on('connection', (peer) => {
            peer.onRequest('system:ping', () => ({ status: 'pong' }));
            peerReady.resolve();
        });

        const client = await Client.connect({ id: socketPath, adapter: 'bun' });
        await peerReady.promise;

        const reply = await client.request('system:ping', null);
        expect(reply).toEqual({ status: 'pong' });

        await client.disconnect();
        await server.close();
    });

    test('request rejects on server error envelope', async () => {
        const server = await Server.create({ id: socketPath, adapter: 'bun' });
        const peerReady = Promise.withResolvers<void>();
        server.on('connection', (peer) => {
            peerReady.resolve();
        });

        const client = await Client.connect({ id: socketPath, adapter: 'bun' });
        await peerReady.promise;

        await expect(client.request('missing:event', null, 500)).rejects.toMatchObject({
            code: 'NO_HANDLER',
        } satisfies Partial<LibunixError>);

        await client.disconnect();
        await server.close();
    });

    test('on receives server emit', async () => {
        type Events = { 'server:push': { n: number }; [key: string]: unknown };
        const server = await Server.create<Events>({ id: socketPath, adapter: 'bun' });
        const peerReady = Promise.withResolvers<(data: { n: number }) => Promise<void>>();
        server.on('connection', (peer) => {
            peerReady.resolve(async (data) => {
                await peer.emit('server:push', data);
            });
        });

        const received = Promise.withResolvers<{ n: number }>();
        const client = await Client.connect<Events>({ id: socketPath, adapter: 'bun' });
        client.on('server:push', (data) => {
            received.resolve(data as { n: number });
        });

        const push = await peerReady.promise;
        await push({ n: 7 });

        await expect(received.promise).resolves.toEqual({ n: 7 });

        await client.disconnect();
        await server.close();
    });

    test('disconnect rejects in-flight requests', async () => {
        const server = await Server.create({ id: socketPath, adapter: 'bun' });
        server.on('connection', (peer) => {
            peer.onRequest('slow', async () => {
                await new Promise((r) => setTimeout(r, 500));
                return { ok: true };
            });
        });

        const client = await Client.connect({ id: socketPath, adapter: 'bun' });
        const pending = client.request('slow', null, 10_000);
        await client.disconnect();

        await expect(pending).rejects.toMatchObject({
            code: 'CONNECTION_LOST',
        } satisfies Partial<LibunixError>);

        await server.close();
    });
});
