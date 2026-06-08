export interface ConnectionOptions {
    id: string;
    /** Transport backend. Omitted: Bun runtime if available, else `node:net` (Node.js 20+). */
    adapter?: 'bun' | 'node';
    /** When true, reject oversized or deeply nested envelope JSON before dispatch. */
    strictEnvelope?: boolean;
    /** Max envelope JSON bytes when strictEnvelope is true (default: max frame payload). */
    maxEnvelopeBytes?: number;
    /** Max JSON nesting depth when strictEnvelope is true (default: 64). */
    maxEnvelopeDepth?: number;
}

export interface ServerOptions extends ConnectionOptions {
    chmod?: number;
}

export interface ClientOptions extends ConnectionOptions {
    reconnect?: {
        attempts: number;
        backoff: 'fixed' | 'exponential';
        initialDelay: number;
    };
}

export type MessageHandler<T = unknown> = (data: T) => void | Promise<void>;
export type RequestHandler<T = unknown, R = unknown> = (data: T) => R | Promise<R>;
