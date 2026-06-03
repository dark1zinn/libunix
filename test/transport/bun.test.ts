import { afterEach, describe, expect, test } from "bun:test";
import { unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { StreamAccumulator } from "../../src/protocol/accumulator.ts";
import { MessageType } from "../../src/protocol/constants.ts";
import type { DecodedFrame } from "../../src/protocol/frame.ts";
import { encodeEmit } from "../../src/protocol/envelope.ts";
import { encodeFrame, zeroCorrelation } from "../../src/protocol/frame.ts";
import { createBunTransportAdapter } from "../../src/transport/bun.ts";
import type { TransportSocket } from "../../src/transport/adapter.ts";

function tempSocketPath(): string {
  return join(tmpdir(), `libunix-transport-${crypto.randomUUID()}.sock`);
}

describe("BunTransportAdapter", () => {
  const adapter = createBunTransportAdapter();
  let socketPath = tempSocketPath();

  afterEach(() => {
    try {
      unlinkSync(socketPath);
    } catch {
      // ignore missing file
    }
    socketPath = tempSocketPath();
  });

  test("exchanges a framed message over unix socket", async () => {
    const serverAccumulator = new StreamAccumulator();
    const received: DecodedFrame[] = [];

    const listener = adapter.listen(socketPath, {
      onData(_socket, chunk) {
        received.push(...serverAccumulator.append(chunk));
      },
    });

    const clientSocket = await adapter.connect(socketPath, {
      onData() {},
    });

    const payload = encodeEmit("transport:test", { ok: true });
    const frame = encodeFrame(MessageType.EventEmit, zeroCorrelation(), payload);
    adapter.write(clientSocket, frame);

    await new Promise((r) => setTimeout(r, 50));

    expect(received.length).toBeGreaterThanOrEqual(1);
    expect(received[0]!.type).toBe(MessageType.EventEmit);

    listener.close(true);
    await adapter.close(clientSocket);
  });

  test("probeConnect returns refused when nothing listens", async () => {
    const result = await adapter.probeConnect(socketPath);
    expect(result).toBe("refused");
  });

  test("probeConnect returns alive when server is listening", async () => {
    const listener = adapter.listen(socketPath, { onData() {} });
    const result = await adapter.probeConnect(socketPath);
    expect(result).toBe("alive");
    listener.close(true);
  });
});
