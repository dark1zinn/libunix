import { describe, expect, test } from "bun:test";
import { MessageType } from "../../src/protocol/constants.ts";
import {
  decodeEnvelope,
  encodeEmit,
  encodeError,
  encodeRequest,
  encodeSuccess,
  ENVELOPE_VERSION,
  EnvelopeError,
} from "../../src/protocol/envelope.ts";
import { decodeFrame, encodeFrame } from "../../src/protocol/frame.ts";

const textDecoder = new TextDecoder();

describe("encode / decode emit & request", () => {
  test("encodeRequest matches PLAN example", () => {
    const bytes = encodeRequest("system:ping", null);
    expect(textDecoder.decode(bytes)).toBe(
      `{"v":${ENVELOPE_VERSION},"e":"system:ping","d":null}`,
    );
    const parsed = decodeEnvelope(bytes, MessageType.Request);
    expect(parsed).toEqual({
      kind: "request",
      event: "system:ping",
      data: null,
    });
  });

  test("encodeEmit round-trips", () => {
    const bytes = encodeEmit("compute:start", { taskId: "tx-1" });
    const parsed = decodeEnvelope(bytes, MessageType.EventEmit);
    expect(parsed.kind).toBe("emit");
    if (parsed.kind === "emit") {
      expect(parsed.event).toBe("compute:start");
      expect(parsed.data).toEqual({ taskId: "tx-1" });
    }
  });

  test("missing d decodes as null", () => {
    const bytes = new TextEncoder().encode(
      `{"v":${ENVELOPE_VERSION},"e":"evt"}`,
    );
    const parsed = decodeEnvelope(bytes, MessageType.EventEmit);
    expect(parsed.kind).toBe("emit");
    if (parsed.kind === "emit") {
      expect(parsed.data).toBe(null);
    }
  });
});

describe("encode / decode responses", () => {
  test("encodeSuccess round-trips", () => {
    const result = { status: "pong", timestamp: 1730000000000 };
    const bytes = encodeSuccess(result);
    const parsed = decodeEnvelope(bytes, MessageType.ResponseSuccess);
    expect(parsed).toEqual({ kind: "success", data: result });
  });

  test("encodeError round-trips", () => {
    const bytes = encodeError({
      code: "NO_HANDLER",
      message: "No handler for event",
    });
    const parsed = decodeEnvelope(bytes, MessageType.ResponseError);
    expect(parsed.kind).toBe("error");
    if (parsed.kind === "error") {
      expect(parsed.error.code).toBe("NO_HANDLER");
      expect(parsed.error.message).toBe("No handler for event");
    }
  });

  test("rejects success envelope with e", () => {
    const bytes = new TextEncoder().encode(
      `{"v":${ENVELOPE_VERSION},"e":"x","d":1}`,
    );
    expect(() => decodeEnvelope(bytes, MessageType.ResponseSuccess)).toThrow(
      EnvelopeError,
    );
  });
});

describe("frame + envelope integration", () => {
  test("full REQUEST frame decodes payload envelope", () => {
    const corr = new Uint8Array(16);
    corr[0] = 9;
    const payload = encodeRequest("system:ping", null);
    const frame = encodeFrame(MessageType.Request, corr, payload);
    const { type, payload: framePayload } = decodeFrame(frame);
    const env = decodeEnvelope(framePayload, type);
    expect(env.kind).toBe("request");
  });
});

describe("validation errors", () => {
  test("rejects unsupported envelope version", () => {
    const bytes = new TextEncoder().encode('{"v":99,"e":"a","d":null}');
    expect(() => decodeEnvelope(bytes, MessageType.Request)).toThrow(
      EnvelopeError,
    );
  });

  test("rejects invalid JSON", () => {
    const bytes = new TextEncoder().encode("{not json");
    expect(() => decodeEnvelope(bytes, MessageType.Request)).toThrow(
      EnvelopeError,
    );
  });
});
