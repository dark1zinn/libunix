export interface ConnectionOptions {
  id: string;
  adapter?: "bun" | "node";
}

export interface ServerOptions extends ConnectionOptions {
  chmod?: number;
}

export interface ClientOptions extends ConnectionOptions {
  reconnect?: {
    attempts: number;
    backoff: "fixed" | "exponential";
    initialDelay: number;
  };
}

export type MessageHandler<T = unknown> = (data: T) => void | Promise<void>;
export type RequestHandler<T = unknown, R = unknown> = (
  data: T,
) => R | Promise<R>;
