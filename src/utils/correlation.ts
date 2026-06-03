import { CORRELATION_ID_SIZE } from '../protocol/constants.ts';

let sequence = 0n;

function writeUint64Be(view: DataView, offset: number, value: bigint): void {
    const hi = Number((value >> 32n) & 0xffff_ffffn);
    const lo = Number(value & 0xffff_ffffn);
    view.setUint32(offset, hi, false);
    view.setUint32(offset + 4, lo, false);
}

/** 16-byte correlation: 8-byte BE timestamp (ms) + 8-byte BE sequence. */
export function nextCorrelationId(): Uint8Array {
    const id = new Uint8Array(CORRELATION_ID_SIZE);
    const view = new DataView(id.buffer, id.byteOffset, id.byteLength);
    const timestamp = BigInt(Date.now());
    sequence += 1n;
    writeUint64Be(view, 0, timestamp);
    writeUint64Be(view, 8, sequence);
    return id;
}

/** For tests: reset monotonic sequence. */
export function resetCorrelationSequence(): void {
    sequence = 0n;
}

export function correlationIdToKey(id: Uint8Array): string {
    return Buffer.from(id).toString('hex');
}
