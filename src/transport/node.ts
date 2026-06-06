import net from 'node:net';
import type {
    ProbeConnectResult,
    TransportAdapter,
    TransportListenHandle,
    TransportSocket,
    TransportSocketHandlers,
} from './adapter.ts';
import { SendQueue } from './send-queue.ts';

const handleBySocket = new WeakMap<net.Socket, NodeSocketHandle>();

function normalizeError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
}

function toUint8Array(data: string | Buffer | Uint8Array): Uint8Array {
    if (typeof data === 'string') {
        return new TextEncoder().encode(data);
    }
    if (data instanceof Uint8Array) {
        return data;
    }
    return new Uint8Array(data);
}

function isProbeRefused(error: unknown): boolean {
    if (error && typeof error === 'object' && 'code' in error) {
        const code = (error as { code?: string }).code;
        if (code === 'ECONNREFUSED' || code === 'ENOENT') {
            return true;
        }
    }
    const message = error instanceof Error ? error.message : String(error);
    return message.includes('ECONNREFUSED') || message.includes('ENOENT');
}

export class NodeSocketHandle implements TransportSocket {
    readonly handleId: string;

    constructor(readonly native: net.Socket) {
        this.handleId = crypto.randomUUID();
    }

    static fromNative(native: net.Socket): NodeSocketHandle {
        const existing = handleBySocket.get(native);
        if (existing) {
            return existing;
        }
        const handle = new NodeSocketHandle(native);
        handleBySocket.set(native, handle);
        return handle;
    }
}

function wireSocketHandlers(
    native: net.Socket,
    handle: NodeSocketHandle,
    handlers: TransportSocketHandlers,
    onSocketEnd?: () => void,
): void {
    native.on('data', (buf) => {
        handlers.onData(handle, toUint8Array(buf));
    });
    native.on('close', (hadError) => {
        onSocketEnd?.();
        handlers.onClose?.(handle, hadError ? new Error('socket closed with error') : undefined);
    });
    native.on('error', (error) => {
        handlers.onError?.(handle, normalizeError(error));
    });
}

export class NodeTransportAdapter implements TransportAdapter {
    private readonly outbound = new SendQueue((socket, data) => {
        this.writeImmediate(socket, data);
    });

    listen(path: string, handlers: TransportSocketHandlers): TransportListenHandle {
        const activeSockets = new Set<net.Socket>();
        const server = net.createServer((native) => {
            activeSockets.add(native);
            const handle = NodeSocketHandle.fromNative(native);
            wireSocketHandlers(native, handle, handlers, () => {
                activeSockets.delete(native);
            });
            handlers.onOpen?.(handle);
        });

        server.listen(path);

        return {
            close(closeActiveConnections = true) {
                if (closeActiveConnections) {
                    for (const socket of activeSockets) {
                        socket.destroy();
                    }
                    activeSockets.clear();
                }
                server.close();
            },
        };
    }

    connect(path: string, handlers: TransportSocketHandlers): Promise<TransportSocket> {
        return new Promise((resolve, reject) => {
            const native = net.connect({ path });
            const handle = NodeSocketHandle.fromNative(native);
            wireSocketHandlers(native, handle, handlers);

            native.once('connect', () => {
                handlers.onOpen?.(handle);
                resolve(handle);
            });
            native.once('error', (error) => {
                reject(normalizeError(error));
            });
        });
    }

    async probeConnect(path: string, timeoutMs = 200): Promise<ProbeConnectResult> {
        let native: net.Socket | undefined;
        try {
            native = await Promise.race([
                new Promise<net.Socket>((resolve, reject) => {
                    const socket = net.connect({ path });
                    socket.once('connect', () => resolve(socket));
                    socket.once('error', reject);
                }),
                new Promise<never>((_, reject) => {
                    setTimeout(() => reject(new Error('probeConnect timeout')), timeoutMs);
                }),
            ]);
            return 'alive';
        } catch (error) {
            if (isProbeRefused(error)) {
                return 'refused';
            }
            throw error;
        } finally {
            native?.destroy();
        }
    }

    write(socket: TransportSocket, data: Uint8Array): void {
        this.outbound.enqueue(socket, data);
    }

    async close(socket: TransportSocket): Promise<void> {
        this.outbound.clear(socket);
        const handle = socket as NodeSocketHandle;
        if (handle.native.destroyed) {
            return;
        }
        return new Promise((resolve) => {
            handle.native.end(() => resolve());
        });
    }

    private writeImmediate(socket: TransportSocket, data: Uint8Array): void {
        const handle = socket as NodeSocketHandle;
        handle.native.write(Buffer.from(data));
    }
}

export function createNodeTransportAdapter(): TransportAdapter {
    return new NodeTransportAdapter();
}
