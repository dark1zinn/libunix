import type { Socket, SocketListener } from "bun";
import type {
  ProbeConnectResult,
  TransportAdapter,
  TransportListenHandle,
  TransportSocket,
  TransportSocketHandlers,
} from "./adapter.ts";

type BunSocketData = {
  handle: BunSocketHandle;
};

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

  constructor(readonly native: Socket<BunSocketData>) {
    this.handleId = crypto.randomUUID();
  }

  static fromNative(native: Socket<BunSocketData>): BunSocketHandle {
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
): Socket<BunSocketData>["handler"] {
  return {
    open(native) {
      const handle = BunSocketHandle.fromNative(native);
      handlers.onOpen?.(handle);
    },
    data(native, data) {
      const handle = BunSocketHandle.fromNative(native);
      handlers.onData(handle, toUint8Array(data));
    },
    close(native, error) {
      const handle = BunSocketHandle.fromNative(native);
      handlers.onClose?.(handle, error ? normalizeError(error) : undefined);
    },
    error(native, error) {
      const handle = BunSocketHandle.fromNative(native);
      handlers.onError?.(handle, normalizeError(error));
    },
  };
}

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
    const native = await Bun.connect({
      unix: path,
      socket: createSocketHandlers(handlers),
    });
    return BunSocketHandle.fromNative(native);
  }

  async probeConnect(
    path: string,
    timeoutMs = 200,
  ): Promise<ProbeConnectResult> {
    let native: Socket | undefined;
    try {
      native = await Promise.race([
        Bun.connect({
          unix: path,
          socket: {
            data() {},
            open() {},
            error() {},
          },
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
    const handle = socket as BunSocketHandle;
    handle.native.write(data);
  }

  async close(socket: TransportSocket): Promise<void> {
    const handle = socket as BunSocketHandle;
    handle.native.end();
  }
}

export function createBunTransportAdapter(): TransportAdapter {
  return new BunTransportAdapter();
}
