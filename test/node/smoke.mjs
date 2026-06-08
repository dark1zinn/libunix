import assert from 'node:assert/strict';
import { existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const { Client, Server } = await import(join(root, 'dist/index.mjs'));

function tempSocketPath() {
    return join(tmpdir(), `libunix-node-smoke-${crypto.randomUUID()}.sock`);
}

describe('libunix node runtime smoke', () => {
    it('Server + Client request/response with adapter node', async () => {
        const socketPath = tempSocketPath();
        try {
            const server = await Server.create({ id: socketPath, adapter: 'node' });
            const ready = Promise.withResolvers();
            server.on('connection', (peer) => {
                peer.onRequest('echo', (data) => ({ echo: data.msg }));
                ready.resolve();
            });

            const client = await Client.connect({ id: socketPath, adapter: 'node' });
            await ready.promise;

            const result = await client.request('echo', { msg: 'node-smoke' });
            assert.deepEqual(result, { echo: 'node-smoke' });

            await client.disconnect();
            await server.close();
        } finally {
            try {
                if (existsSync(socketPath)) {
                    unlinkSync(socketPath);
                }
            } catch {
                // ignore
            }
        }
    });
});
