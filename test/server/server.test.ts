import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { StreamAccumulator } from "../../src/protocol/accumulator.ts";
import { MessageType } from "../../src/protocol/constants.ts";
import type { DecodedFrame } from "../../src/protocol/frame.ts";
import {
  decodeEnvelope,
  encodeRequest,
} from "../../src/protocol/envelope.ts";
import { encodeFrame } from "../../src/protocol/frame.ts";
import { Server } from "../../src/server/server.ts";
import { createBunTransportAdapter } from "../../src/transport/bun.ts";
import { nextCorrelationId } from "../../src/utils/correlation.ts";
import { LibunixError } from "../../src/utils/errors.ts";

function tempSocketPath(): string {
  return join(tmpdir(), `libunix-server-${crypto.randomUUID()}.sock`);
}

describe("Server", () => {
  let socketPath = tempSocketPath();

  afterEach(() => {
    try {
      if (existsSync(socketPath)) {
        unlinkSync(socketPath);
      }
    } catch {
      // ignore
    }
    socketPath = tempSocketPath();
  });

  test("handles client REQUEST and responds with success", async () => {
    const server = await Server.create({
      id: socketPath,
      adapter: "bun",
    });

    const peerReady = Promise.withResolvers<void>();
    server.on("connection", (peer) => {
      peer.onRequest("system:ping", () => ({
        status: "pong",
        timestamp: 1,
      }));
      peerReady.resolve();
    });

    const transport = createBunTransportAdapter();
    const clientAccumulator = new StreamAccumulator();
    const received: DecodedFrame[] = [];
    const correlation = nextCorrelationId();

    const client = await transport.connect(socketPath, {
      onData: (_socket, chunk) => {
        received.push(...clientAccumulator.append(chunk));
      },
    });

    await peerReady.promise;

    const payload = encodeRequest("system:ping", null);
    const frame = encodeFrame(MessageType.Request, correlation, payload);
    transport.write(client, frame);

    await new Promise((r) => setTimeout(r, 80));

    const frames = received.length > 0 ? received : clientAccumulator.append(new Uint8Array(0));
    expect(frames.length).toBeGreaterThanOrEqual(1);

    const response = frames[0]!;
    expect(response.type).toBe(MessageType.ResponseSuccess);
    const envelope = decodeEnvelope(
      response.payload,
      MessageType.ResponseSuccess,
    );
    expect(envelope.kind).toBe("success");
    if (envelope.kind === "success") {
      expect(envelope.data).toEqual({ status: "pong", timestamp: 1 });
    }

    await server.close();
    await transport.close(client);
  });

  test("throws EADDRINUSE when socket is already served", async () => {
    const server = await Server.create({ id: socketPath, adapter: "bun" });

    await expect(
      Server.create({ id: socketPath, adapter: "bun" }),
    ).rejects.toMatchObject({
      code: "EADDRINUSE",
    } satisfies Partial<LibunixError>);

    await server.close();
  });

  test("RemotePeer.emit delivers EVENT_EMIT to client", async () => {
    type ServerEvents = {
      "server:notify": { value: number };
      [key: string]: unknown;
    };

    const server = await Server.create<ServerEvents>({
      id: socketPath,
      adapter: "bun",
    });

    type PeerEmit = (
      event: "server:notify",
      data: { value: number },
    ) => Promise<void>;
    const peerReady = Promise.withResolvers<PeerEmit>();

    server.on("connection", (peer) => {
      peerReady.resolve((event, data) => peer.emit(event, data));
    });

    const transport = createBunTransportAdapter();
    const clientAccumulator = new StreamAccumulator();
    const received: DecodedFrame[] = [];
    const client = await transport.connect(socketPath, {
      onData: (_s, chunk) => {
        received.push(...clientAccumulator.append(chunk));
      },
    });

    const peerEmit = await peerReady.promise;
    await peerEmit("server:notify", { value: 42 });

    await new Promise((r) => setTimeout(r, 80));

    const frames = received.length > 0 ? received : clientAccumulator.append(new Uint8Array(0));
    expect(frames.length).toBeGreaterThanOrEqual(1);
    expect(frames[0]!.type).toBe(MessageType.EventEmit);
    const decoded = frames[0]!;
    const env = decodeEnvelope(decoded.payload, MessageType.EventEmit);
    expect(env.kind).toBe("emit");
    if (env.kind === "emit") {
      expect(env.event).toBe("server:notify");
      expect(env.data).toEqual({ value: 42 });
    }

    await server.close();
    await transport.close(client);
  });
});
