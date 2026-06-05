import { MessageType } from '../../../src/protocol/constants.ts';
import { decodeEnvelope, encodeRequest } from '../../../src/protocol/envelope.ts';
import { correlationIdsEqual, decodeFrame, encodeFrame } from '../../../src/protocol/frame.ts';
import { parseIterations } from '../_shared.ts';

function correlation(byte: number): Uint8Array {
    const id = new Uint8Array(16);
    id[0] = byte;
    id[15] = byte;
    return id;
}

const iterations = parseIterations(2, 'BENCH_ITERATIONS', 50_000);

for (let i = 0; i < iterations; i++) {
    const corr = correlation(i % 256);
    const payload = encodeRequest('bench', { n: i });
    const frame = encodeFrame(MessageType.Request, corr, payload);
    const decoded = decodeFrame(frame);
    const envelope = decodeEnvelope(decoded.payload, decoded.type);
    if (envelope.kind !== 'request' || envelope.event !== 'bench') {
        throw new Error('unexpected envelope');
    }
    if (!correlationIdsEqual(decoded.correlationId, corr)) {
        throw new Error('correlation mismatch');
    }
}
