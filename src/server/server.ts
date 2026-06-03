import { chmodSync, existsSync, unlinkSync } from 'node:fs';
import type { TransportAdapter, TransportListenHandle } from '../transport/adapter.ts';
import type { ServerOptions } from '../types.ts';
import { resolveSocketPath } from '../utils/path.ts';
import { LibunixError } from '../utils/errors.ts';
import { registerLifecycle, unregisterLifecycle } from '../utils/lifecycle.ts';
import { prepareSocketPath } from './socket-hygiene.ts';
import { createTransportAdapter } from './transport-factory.ts';
import { RemotePeer } from './peer.ts';

type ConnectionHandler<T extends Record<string, unknown>> = (peer: RemotePeer<T>) => void;

export class Server<IncomingEvents extends Record<string, unknown> = Record<string, unknown>> {
    private readonly connectionHandlers: ConnectionHandler<IncomingEvents>[] = [];
    private readonly errorHandlers: ((err: Error) => void)[] = [];
    private readonly peers = new Map<string, RemotePeer<IncomingEvents>>();

    private listener: TransportListenHandle | undefined;
    private closed = false;
    private readonly lifecycleParticipant = {
        close: () => this.close(),
        disposeSync: () => this.syncDispose(),
    };

    private constructor(
        private readonly options: ServerOptions,
        private readonly socketPath: string,
        private readonly transport: TransportAdapter,
    ) {}

    static async create<T extends Record<string, unknown> = Record<string, unknown>>(
        options: ServerOptions,
    ): Promise<Server<T>> {
        const transport = createTransportAdapter(options.adapter);
        const socketPath = resolveSocketPath(options.id);
        await prepareSocketPath(socketPath, transport);

        const server = new Server<T>(options, socketPath, transport);
        server.start();
        registerLifecycle(server.lifecycleParticipant);
        return server;
    }

    on(event: 'connection', callback: ConnectionHandler<IncomingEvents>): this;
    on(event: 'error', callback: (err: Error) => void): this;
    on(
        event: 'connection' | 'error',
        callback: ConnectionHandler<IncomingEvents> | ((err: Error) => void),
    ): this {
        if (event === 'connection') {
            this.connectionHandlers.push(callback as ConnectionHandler<IncomingEvents>);
        } else {
            this.errorHandlers.push(callback as (err: Error) => void);
        }
        return this;
    }

    async close(): Promise<void> {
        if (this.closed) {
            return;
        }
        this.closed = true;

        for (const peer of this.peers.values()) {
            await this.transport.close(peer.socket);
        }
        this.peers.clear();

        this.listener?.close(true);
        this.listener = undefined;

        this.unlinkSocketFile();

        unregisterLifecycle(this.lifecycleParticipant);
    }

    private syncDispose(): void {
        if (this.closed) {
            return;
        }
        this.listener?.close(true);
        this.listener = undefined;
        this.unlinkSocketFile();
    }

    private unlinkSocketFile(): void {
        if (existsSync(this.socketPath)) {
            try {
                unlinkSync(this.socketPath);
            } catch {
                // best-effort unlink
            }
        }
    }

    [Symbol.dispose](): void {
        void this.close();
    }

    private start(): void {
        this.listener = this.transport.listen(this.socketPath, {
            onOpen: (socket) => {
                const peer = new RemotePeer<IncomingEvents>(socket, this.transport, (error) =>
                    this.emitError(error),
                );
                this.peers.set(socket.handleId, peer);
                for (const handler of this.connectionHandlers) {
                    handler(peer);
                }
            },
            onData: (socket, chunk) => {
                const peer = this.peers.get(socket.handleId);
                peer?.ingest(chunk);
            },
            onClose: (socket) => {
                this.peers.delete(socket.handleId);
            },
            onError: (socket, error) => {
                this.emitError(error);
                this.peers.delete(socket.handleId);
            },
        });

        if (existsSync(this.socketPath)) {
            chmodSync(this.socketPath, this.options.chmod ?? 0o600);
        }
    }

    private emitError(error: Error): void {
        for (const handler of this.errorHandlers) {
            handler(error);
        }
    }
}

export { RemotePeer };
