import { describe, expect, test } from "bun:test";
import type { TransportSocket } from "../../src/transport/adapter.ts";
import { SendQueue } from "../../src/transport/send-queue.ts";

function mockSocket(id: string): TransportSocket {
  return { handleId: id };
}

describe("SendQueue", () => {
  test("writes buffers in FIFO order per socket", () => {
    const written: Uint8Array[] = [];
    const queue = new SendQueue((_socket, data) => {
      written.push(data);
    });
    const socket = mockSocket("a");

    queue.enqueue(socket, new Uint8Array([1]));
    queue.enqueue(socket, new Uint8Array([2, 3]));

    expect(written).toHaveLength(2);
    expect(written[0]).toEqual(new Uint8Array([1]));
    expect(written[1]).toEqual(new Uint8Array([2, 3]));
  });

  test("isolates queues by socket handleId", () => {
    const written: { id: string; data: Uint8Array }[] = [];
    const queue = new SendQueue((socket, data) => {
      written.push({ id: socket.handleId, data });
    });

    queue.enqueue(mockSocket("a"), new Uint8Array([1]));
    queue.enqueue(mockSocket("b"), new Uint8Array([2]));

    expect(written).toEqual([
      { id: "a", data: new Uint8Array([1]) },
      { id: "b", data: new Uint8Array([2]) },
    ]);
  });

  test("clear drops pending state", () => {
    const queue = new SendQueue(() => {});
    const socket = mockSocket("x");
    queue.enqueue(socket, new Uint8Array([1]));
    queue.clear(socket);
    expect(queue.pendingCount(socket)).toBe(0);
  });
});
