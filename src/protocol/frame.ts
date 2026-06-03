import {
    CORRELATION_ID_SIZE,
    FRAME_CORRELATION_OFFSET,
    FRAME_PAYLOAD_OFFSET,
    FRAME_TYPE_OFFSET,
    isMessageType,
    LENGTH_PREFIX_SIZE,
    MAX_BODY_LENGTH,
    MAX_FRAME_SIZE,
    MessageType,
    MIN_BODY_LENGTH,
    ZERO_CORRELATION,
    type MessageType as MessageTypeValue,
} from './constants.ts';

export class FrameError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'FrameError';
    }
}

export interface DecodedFrame {
    type: MessageTypeValue;
    correlationId: Uint8Array;
    payload: Uint8Array;
}

export function validateBodyLength(bodyLength: number): void {
    if (
        !Number.isInteger(bodyLength) ||
        bodyLength < MIN_BODY_LENGTH ||
        bodyLength > MAX_BODY_LENGTH
    ) {
        throw new FrameError(
            `Invalid body length ${bodyLength}; expected ${MIN_BODY_LENGTH}..${MAX_BODY_LENGTH}`,
        );
    }
}

export function readBodyLengthPrefix(buffer: Uint8Array): number {
    if (buffer.length < LENGTH_PREFIX_SIZE) {
        throw new FrameError('Buffer too short for length prefix');
    }
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const bodyLength = view.getUint32(0, false);
    validateBodyLength(bodyLength);
    const frameSize = LENGTH_PREFIX_SIZE + bodyLength;
    if (frameSize > MAX_FRAME_SIZE) {
        throw new FrameError(`Frame size ${frameSize} exceeds MAX_FRAME_SIZE`);
    }
    return bodyLength;
}

function assertCorrelationId(correlationId: Uint8Array): void {
    if (correlationId.length !== CORRELATION_ID_SIZE) {
        throw new FrameError(
            `Correlation id must be ${CORRELATION_ID_SIZE} bytes, got ${correlationId.length}`,
        );
    }
}

function assertEmitCorrelation(type: MessageTypeValue, correlationId: Uint8Array): void {
    if (type !== MessageType.EventEmit) {
        return;
    }
    for (let i = 0; i < CORRELATION_ID_SIZE; i++) {
        if (correlationId[i] !== 0) {
            throw new FrameError('EVENT_EMIT requires zero correlation id');
        }
    }
}

/**
 * Builds a full on-wire frame: 4-byte big-endian L + body (type + correlation + payload).
 */
export function encodeFrame(
    type: MessageTypeValue,
    correlationId: Uint8Array,
    payload: Uint8Array,
): Uint8Array {
    assertCorrelationId(correlationId);
    assertEmitCorrelation(type, correlationId);

    const bodyLength = 1 + CORRELATION_ID_SIZE + payload.length;
    validateBodyLength(bodyLength);

    const frame = new Uint8Array(LENGTH_PREFIX_SIZE + bodyLength);
    const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
    view.setUint32(0, bodyLength, false);
    frame[FRAME_TYPE_OFFSET] = type;
    frame.set(correlationId, FRAME_CORRELATION_OFFSET);
    frame.set(payload, FRAME_PAYLOAD_OFFSET);
    return frame;
}

/**
 * Decodes a complete on-wire frame (length prefix + body).
 */
export function decodeFrame(frame: Uint8Array): DecodedFrame {
    const bodyLength = readBodyLengthPrefix(frame);
    const expectedSize = LENGTH_PREFIX_SIZE + bodyLength;
    if (frame.length < expectedSize) {
        throw new FrameError(`Incomplete frame: have ${frame.length}, need ${expectedSize}`);
    }
    if (frame.length > expectedSize) {
        throw new FrameError(`Frame buffer has ${frame.length - expectedSize} trailing bytes`);
    }

    const typeByte = frame[FRAME_TYPE_OFFSET];
    if (typeByte === undefined || !isMessageType(typeByte)) {
        throw new FrameError(`Unknown message type 0x${typeByte?.toString(16) ?? '??'}`);
    }

    const correlationId = frame.slice(FRAME_CORRELATION_OFFSET, FRAME_PAYLOAD_OFFSET);
    assertEmitCorrelation(typeByte, correlationId);

    const payload = frame.slice(FRAME_PAYLOAD_OFFSET);
    return { type: typeByte, correlationId, payload };
}

export function correlationIdsEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) {
        return false;
    }
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}

export function zeroCorrelation(): Uint8Array {
    return ZERO_CORRELATION;
}
