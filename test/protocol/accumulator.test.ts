import { describe, expect, test } from 'bun:test';
import { MessageType, type MessageType as MessageTypeValue } from '../../src/protocol/constants.ts';
import { StreamAccumulator } from '../../src/protocol/accumulator.ts';
import { encodeEmit } from '../../src/protocol/envelope.ts';
import {
    correlationIdsEqual,
    decodeFrame,
    encodeFrame,
    FrameError,
    zeroCorrelation,
} from '../../src/protocol/frame.ts';

function correlation(byte: number): Uint8Array {
    const id = new Uint8Array(16);
    id[0] = byte;
    return id;
}

function buildFrame(type: MessageTypeValue, corr: Uint8Array, payload: Uint8Array): Uint8Array {
    return encodeFrame(type, corr, payload);
}

function splitIntoChunks(data: Uint8Array, size: number): Uint8Array[] {
    const chunks: Uint8Array[] = [];
    for (let i = 0; i < data.length; i += size) {
        chunks.push(data.subarray(i, i + size));
    }
    return chunks;
}

describe('StreamAccumulator', () => {
    test('decodes a single frame in one append', () => {
        const payload = encodeEmit('evt', { n: 1 });
        const frame = buildFrame(MessageType.EventEmit, zeroCorrelation(), payload);
        const acc = new StreamAccumulator();
        const frames = acc.append(frame);
        expect(frames).toHaveLength(1);
        expect(frames[0]!.type).toBe(MessageType.EventEmit);
        expect(acc.bufferedByteCount()).toBe(0);
    });

    test('reassembles frame split into 2-byte chunks', () => {
        const payload = encodeEmit('evt', null);
        const frame = buildFrame(MessageType.EventEmit, zeroCorrelation(), payload);
        const acc = new StreamAccumulator();
        const all: ReturnType<typeof decodeFrame>[] = [];
        for (const chunk of splitIntoChunks(frame, 2)) {
            all.push(...acc.append(chunk));
        }
        expect(all).toHaveLength(1);
        expect(all[0]!.type).toBe(MessageType.EventEmit);
        expect(acc.bufferedByteCount()).toBe(0);
    });

    test('decodes two concatenated frames in one append', () => {
        const f1 = buildFrame(MessageType.Request, correlation(1), encodeEmit('a', 1));
        const f2 = buildFrame(MessageType.Request, correlation(2), encodeEmit('b', 2));
        const combined = new Uint8Array(f1.length + f2.length);
        combined.set(f1);
        combined.set(f2, f1.length);

        const acc = new StreamAccumulator();
        const frames = acc.append(combined);
        expect(frames).toHaveLength(2);
        expect(correlationIdsEqual(frames[0]!.correlationId, correlation(1))).toBe(true);
        expect(correlationIdsEqual(frames[1]!.correlationId, correlation(2))).toBe(true);
    });

    test('handles partial length prefix then remainder', () => {
        const frame = buildFrame(MessageType.Request, correlation(3), new Uint8Array([1, 2]));
        const acc = new StreamAccumulator();
        expect(acc.append(frame.subarray(0, 2))).toHaveLength(0);
        expect(acc.bufferedByteCount()).toBe(2);
        const frames = acc.append(frame.subarray(2));
        expect(frames).toHaveLength(1);
        expect(acc.bufferedByteCount()).toBe(0);
    });

    test('returns multiple frames across sequential appends', () => {
        const f1 = buildFrame(MessageType.EventEmit, zeroCorrelation(), encodeEmit('x', 1));
        const f2 = buildFrame(MessageType.EventEmit, zeroCorrelation(), encodeEmit('y', 2));
        const acc = new StreamAccumulator();
        expect(acc.append(f1)).toHaveLength(1);
        expect(acc.append(f2)).toHaveLength(1);
    });

    test('throws on invalid body length in prefix', () => {
        const bad = new Uint8Array(8);
        const view = new DataView(bad.buffer);
        view.setUint32(0, 1, false);
        const acc = new StreamAccumulator();
        expect(() => acc.append(bad)).toThrow(FrameError);
    });

    test('reset clears partial buffer', () => {
        const frame = buildFrame(MessageType.EventEmit, zeroCorrelation(), encodeEmit('z', 0));
        const acc = new StreamAccumulator();
        acc.append(frame.subarray(0, 3));
        expect(acc.bufferedByteCount()).toBe(3);
        acc.reset();
        expect(acc.bufferedByteCount()).toBe(0);
        expect(acc.append(frame)).toHaveLength(1);
    });
});
