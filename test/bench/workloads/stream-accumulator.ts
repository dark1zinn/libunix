import { MessageType } from '../../../src/protocol/constants.ts';
import { StreamAccumulator } from '../../../src/protocol/accumulator.ts';
import { encodeEmit } from '../../../src/protocol/envelope.ts';
import { encodeFrame, zeroCorrelation } from '../../../src/protocol/frame.ts';
import { parseIterations, splitIntoChunks } from '../_shared.ts';

const iterations = parseIterations(2, 'BENCH_ITERATIONS', 10_000);

for (let i = 0; i < iterations; i++) {
    const payload = encodeEmit('bench', { n: i });
    const frame = encodeFrame(MessageType.EventEmit, zeroCorrelation(), payload);
    const accumulator = new StreamAccumulator();

    let frameCount = 0;
    for (const chunk of splitIntoChunks(frame, 2)) {
        const frames = accumulator.append(chunk);
        frameCount += frames.length;
    }

    if (frameCount !== 1) {
        throw new Error(`expected 1 frame, got ${frameCount}`);
    }
}
