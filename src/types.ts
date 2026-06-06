export interface ConnectionOptions {
    id: string;
    /** Transport backend. Omitted: Bun runtime if available, else `node:net` (Node.js 20+). */
    adapter?: 'bun' | 'node';
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
