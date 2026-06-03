import { describe, expect, test } from 'bun:test';
import {
    CORRELATION_ID_SIZE,
    MAX_BODY_LENGTH,
    MessageType,
    MIN_BODY_LENGTH,
} from '../../src/protocol/constants.ts';
import {
    correlationIdsEqual,
    decodeFrame,
    encodeFrame,
    FrameError,
    readBodyLengthPrefix,
    validateBodyLength,
    zeroCorrelation,
} from '../../src/protocol/frame.ts';

function correlation(byte: number): Uint8Array {
    const id = new Uint8Array(CORRELATION_ID_SIZE);
    id[0] = byte;
    id[15] = byte;
    return id;
}

describe('validateBodyLength', () => {
    test('accepts minimum body length', () => {
        expect(() => validateBodyLength(MIN_BODY_LENGTH)).not.toThrow();
    });

    test('accepts maximum body length', () => {
        expect(() => validateBodyLength(MAX_BODY_LENGTH)).not.toThrow();
    });

    test('rejects body below minimum', () => {
        expect(() => validateBodyLength(MIN_BODY_LENGTH - 1)).toThrow(FrameError);
    });

    test('rejects body above maximum', () => {
        expect(() => validateBodyLength(MAX_BODY_LENGTH + 1)).toThrow(FrameError);
    });
});

describe('encodeFrame / decodeFrame', () => {
    test('round-trips REQUEST with payload', () => {
        const payload = new TextEncoder().encode('{"v":1,"e":"system:ping","d":null}');
        const corr = correlation(0x42);
        const frame = encodeFrame(MessageType.Request, corr, payload);
        const decoded = decodeFrame(frame);
        expect(decoded.type).toBe(MessageType.Request);
        expect(correlationIdsEqual(decoded.correlationId, corr)).toBe(true);
        expect(decoded.payload).toEqual(payload);
    });

    test('EVENT_EMIT uses zero correlation', () => {
        const payload = new TextEncoder().encode('{"v":1,"e":"evt","d":1}');
        const frame = encodeFrame(MessageType.EventEmit, zeroCorrelation(), payload);
        const decoded = decodeFrame(frame);
        expect(decoded.type).toBe(MessageType.EventEmit);
        expect(correlationIdsEqual(decoded.correlationId, zeroCorrelation())).toBe(true);
    });

    test('rejects EVENT_EMIT with non-zero correlation on encode', () => {
        expect(() => encodeFrame(MessageType.EventEmit, correlation(1), new Uint8Array(2))).toThrow(
            FrameError,
        );
    });

    test('readBodyLengthPrefix parses big-endian L', () => {
        const payload = new Uint8Array(2);
        const frame = encodeFrame(MessageType.Request, correlation(1), payload);
        const bodyLength = readBodyLengthPrefix(frame);
        expect(bodyLength).toBe(MIN_BODY_LENGTH + payload.length);
    });

    test('rejects incomplete buffer on decode', () => {
        const frame = encodeFrame(MessageType.Request, correlation(1), new Uint8Array(2));
        expect(() => decodeFrame(frame.subarray(0, frame.length - 1))).toThrow(FrameError);
    });

    test('rejects trailing bytes on decode', () => {
        const frame = encodeFrame(MessageType.Request, correlation(1), new Uint8Array(2));
        const padded = new Uint8Array(frame.length + 1);
        padded.set(frame);
        expect(() => decodeFrame(padded)).toThrow(FrameError);
    });
});
