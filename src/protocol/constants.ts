/** Total on-wire frame size (4-byte length prefix + body). */
export const MAX_FRAME_SIZE = 1_048_576;

/** Bytes in the length prefix. */
export const LENGTH_PREFIX_SIZE = 4;

/** Message type byte within the body. */
export const MESSAGE_TYPE_SIZE = 1;

/** Correlation slot size within the body. */
export const CORRELATION_ID_SIZE = 16;

/** Body length L = type + correlation + payload (excludes 4-byte length prefix). */
export const MIN_BODY_LENGTH = MESSAGE_TYPE_SIZE + CORRELATION_ID_SIZE;

/** Maximum body length L given MAX_FRAME_SIZE. */
export const MAX_BODY_LENGTH = MAX_FRAME_SIZE - LENGTH_PREFIX_SIZE;

/** Index of message type in a full on-wire frame. */
export const FRAME_TYPE_OFFSET = LENGTH_PREFIX_SIZE;

/** Index of correlation id in a full on-wire frame. */
export const FRAME_CORRELATION_OFFSET = LENGTH_PREFIX_SIZE + MESSAGE_TYPE_SIZE;

/** Index of payload in a full on-wire frame. */
export const FRAME_PAYLOAD_OFFSET = FRAME_CORRELATION_OFFSET + CORRELATION_ID_SIZE;

export const MessageType = {
    EventEmit: 0x01,
    Request: 0x02,
    ResponseSuccess: 0x03,
    ResponseError: 0x04,
} as const;

export type MessageType = (typeof MessageType)[keyof typeof MessageType];

const MESSAGE_TYPE_VALUES: ReadonlySet<number> = new Set(Object.values(MessageType));

export function isMessageType(byte: number): byte is MessageType {
    return MESSAGE_TYPE_VALUES.has(byte);
}

/** All-zero correlation for EVENT_EMIT. */
export const ZERO_CORRELATION = new Uint8Array(CORRELATION_ID_SIZE);
