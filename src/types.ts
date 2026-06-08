export interface ConnectionOptions {
    id: string;
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
