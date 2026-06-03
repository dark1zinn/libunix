import type { Socket, SocketHandler, SocketListener } from "bun";
import type {
  ProbeConnectResult,
  TransportAdapter,
  TransportListenHandle,
  TransportSocket,
  TransportSocketHandlers,
} from "./adapter.ts";
import { SendQueue } from "./send-queue.ts";

type BunSocketData = {
  handle: BunSocketHandle;
};

type BunSocket = Socket<BunSocketData>;

function toUint8Array(data: string | ArrayBuffer | Uint8Array): Uint8Array {
  if (typeof data === "string") {
    return new TextEncoder().encode(data);
  }
  if (data instanceof Uint8Array) {
    return data;
  }
  return new Uint8Array(data);
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export class BunSocketHandle implements TransportSocket {
  readonly handleId: string;

  constructor(readonly native: BunSocket) {
    this.handleId = crypto.randomUUID();
  }

  static fromNative(native: BunSocket): BunSocketHandle {
    const existing = native.data?.handle;
    if (existing) {
      return existing;
    }
    const handle = new BunSocketHandle(native);
    native.data = { handle };
    return handle;
  }
}

function createSocketHandlers(
  handlers: TransportSocketHandlers,
): SocketHandler<BunSocketData> {
  return {
    open(socket: BunSocket) {
      const handle = BunSocketHandle.fromNative(socket);
      handlers.onOpen?.(handle);
    },
    data(socket: BunSocket, data: string | ArrayBuffer | Uint8Array) {
      const handle = BunSocketHandle.fromNative(socket);
      handlers.onData(handle, toUint8Array(data));
    },
    close(socket: BunSocket, error?: Error) {
      const handle = BunSocketHandle.fromNative(socket);
      handlers.onClose?.(handle, error ? normalizeError(error) : undefined);
    },
    error(socket: BunSocket, error: Error) {
      const handle = BunSocketHandle.fromNative(socket);
      handlers.onError?.(handle, normalizeError(error));
    },
  };
}

const probeSocketHandlers: SocketHandler<BunSocketData> = {
  open() {},
  data() {},
  error() {},
};

function isProbeRefused(error: unknown): boolean {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: string }).code;
    if (code === "ECONNREFUSED" || code === "ENOENT") {
      return true;
    }
  }
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("ECONNREFUSED") || message.includes("ENOENT");
}

export class BunTransportAdapter implements TransportAdapter {
  private readonly outbound = new SendQueue((socket, data) => {
    this.writeImmediate(socket, data);
  });

  listen(
    path: string,
    handlers: TransportSocketHandlers,
  ): TransportListenHandle {
    const listener: SocketListener<BunSocketData> = Bun.listen({
      unix: path,
      socket: createSocketHandlers(handlers),
    });

    return {
      close(closeActiveConnections = true) {
        listener.stop(closeActiveConnections);
      },
    };
  }

  async connect(
    path: string,
    handlers: TransportSocketHandlers,
  ): Promise<TransportSocket> {
    const native = await Bun.connect<BunSocketData>({
      unix: path,
      socket: createSocketHandlers(handlers),
    });
    return BunSocketHandle.fromNative(native);
  }

  async probeConnect(
    path: string,
    timeoutMs = 200,
  ): Promise<ProbeConnectResult> {
    let native: BunSocket | undefined;
    try {
      native = await Promise.race([
        Bun.connect<BunSocketData>({
          unix: path,
          socket: probeSocketHandlers,
        }),
        new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error("probeConnect timeout")),
            timeoutMs,
          );
        }),
      ]);
      return "alive";
    } catch (error) {
      if (isProbeRefused(error)) {
        return "refused";
      }
      throw error;
    } finally {
      native?.end();
    }
  }

  write(socket: TransportSocket, data: Uint8Array): void {
    this.outbound.enqueue(socket, data);
  }

  async close(socket: TransportSocket): Promise<void> {
    this.outbound.clear(socket);
    const handle = socket as BunSocketHandle;
    handle.native.end();
  }

  private writeImmediate(socket: TransportSocket, data: Uint8Array): void {
    const handle = socket as BunSocketHandle;
    handle.native.write(data);
  }
}

export function createBunTransportAdapter(): TransportAdapter {
  return new BunTransportAdapter();
}
