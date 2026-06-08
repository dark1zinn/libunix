import { MessageType, type MessageType as MessageTypeValue } from './constants.ts';
import {
    DEFAULT_MAX_ENVELOPE_BYTES,
    DEFAULT_MAX_ENVELOPE_DEPTH,
    measureJsonDepth,
    parseJsonSafe,
} from '../utils/json.ts';

export const ENVELOPE_VERSION = 1 as const;

export interface EnvelopeErrorBody {
    code: string;
    message: string;
    details?: unknown;
}

export type EmitEnvelope = { v: typeof ENVELOPE_VERSION; e: string; d: unknown };
export type RequestEnvelope = { v: typeof ENVELOPE_VERSION; e: string; d: unknown };
export type SuccessEnvelope = { v: typeof ENVELOPE_VERSION; d: unknown };
export type ErrorEnvelope = {
    v: typeof ENVELOPE_VERSION;
    err: EnvelopeErrorBody;
};

export type ParsedEmit = { kind: 'emit'; event: string; data: unknown };
export type ParsedRequest = { kind: 'request'; event: string; data: unknown };
export type ParsedSuccess = { kind: 'success'; data: unknown };
export type ParsedError = { kind: 'error'; error: EnvelopeErrorBody };

export type ParsedEnvelope = ParsedEmit | ParsedRequest | ParsedSuccess | ParsedError;

export interface DecodeEnvelopeOptions {
    strictEnvelope?: boolean;
    maxEnvelopeBytes?: number;
    maxEnvelopeDepth?: number;
}

export class EnvelopeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'EnvelopeError';
    }
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function toPayloadJson(value: unknown): Uint8Array {
    return textEncoder.encode(JSON.stringify(value));
}

function parseJsonRecord(
    bytes: Uint8Array,
    options?: DecodeEnvelopeOptions,
): Record<string, unknown> {
    if (options?.strictEnvelope) {
        const maxBytes = options.maxEnvelopeBytes ?? DEFAULT_MAX_ENVELOPE_BYTES;
        if (bytes.length > maxBytes) {
            throw new EnvelopeError(
                `Envelope payload exceeds maxEnvelopeBytes (${bytes.length} > ${maxBytes})`,
            );
        }
    }

    let parsed: unknown;
    try {
        parsed = parseJsonSafe(textDecoder.decode(bytes));
    } catch {
        throw new EnvelopeError('Invalid JSON in envelope payload');
    }

    if (options?.strictEnvelope) {
        const maxDepth = options.maxEnvelopeDepth ?? DEFAULT_MAX_ENVELOPE_DEPTH;
        if (measureJsonDepth(parsed) > maxDepth) {
            throw new EnvelopeError(`Envelope JSON exceeds maxEnvelopeDepth (${maxDepth})`);
        }
    }

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new EnvelopeError('Envelope must be a JSON object');
    }
    return parsed as Record<string, unknown>;
}

function readVersion(obj: Record<string, unknown>): number {
    const v = obj['v'];
    if (v !== ENVELOPE_VERSION) {
        throw new EnvelopeError(
            `Unsupported envelope version ${String(v)}; expected ${ENVELOPE_VERSION}`,
        );
    }
    return ENVELOPE_VERSION;
}

function readEvent(obj: Record<string, unknown>): string {
    const e = obj['e'];
    if (typeof e !== 'string' || e.length === 0) {
        throw new EnvelopeError('Envelope field "e" must be a non-empty string');
    }
    return e;
}

function readData(obj: Record<string, unknown>): unknown {
    if (!('d' in obj)) {
        return null;
    }
    return obj['d'];
}

function readErrorBody(obj: Record<string, unknown>): EnvelopeErrorBody {
    const err = obj['err'];
    if (err === null || typeof err !== 'object' || Array.isArray(err)) {
        throw new EnvelopeError('Envelope field "err" must be an object');
    }
    const record = err as Record<string, unknown>;
    const code = record['code'];
    const message = record['message'];
    if (typeof code !== 'string' || code.length === 0) {
        throw new EnvelopeError('err.code must be a non-empty string');
    }
    if (typeof message !== 'string' || message.length === 0) {
        throw new EnvelopeError('err.message must be a non-empty string');
    }
    const body: EnvelopeErrorBody = { code, message };
    if ('details' in record) {
        body.details = record['details'];
    }
    return body;
}

export function encodeEmit(event: string, data: unknown): Uint8Array {
    const envelope: EmitEnvelope = {
        v: ENVELOPE_VERSION,
        e: event,
        d: data ?? null,
    };
    return toPayloadJson(envelope);
}

export function encodeRequest(event: string, data: unknown): Uint8Array {
    const envelope: RequestEnvelope = {
        v: ENVELOPE_VERSION,
        e: event,
        d: data ?? null,
    };
    return toPayloadJson(envelope);
}

export function encodeSuccess(result: unknown): Uint8Array {
    const envelope: SuccessEnvelope = { v: ENVELOPE_VERSION, d: result };
    return toPayloadJson(envelope);
}

export function encodeError(error: EnvelopeErrorBody): Uint8Array {
    const envelope: ErrorEnvelope = { v: ENVELOPE_VERSION, err: error };
    return toPayloadJson(envelope);
}

export function decodeEnvelope(
    bytes: Uint8Array,
    frameType: MessageTypeValue,
    options?: DecodeEnvelopeOptions,
): ParsedEnvelope {
    const obj = parseJsonRecord(bytes, options);
    readVersion(obj);

    switch (frameType) {
        case MessageType.EventEmit: {
            return { kind: 'emit', event: readEvent(obj), data: readData(obj) };
        }
        case MessageType.Request: {
            return { kind: 'request', event: readEvent(obj), data: readData(obj) };
        }
        case MessageType.ResponseSuccess: {
            if ('e' in obj) {
                throw new EnvelopeError('RESPONSE_SUCCESS must not include field "e"');
            }
            if (!('d' in obj)) {
                throw new EnvelopeError('RESPONSE_SUCCESS requires field "d"');
            }
            return { kind: 'success', data: obj['d'] };
        }
        case MessageType.ResponseError: {
            if ('e' in obj) {
                throw new EnvelopeError('RESPONSE_ERROR must not include field "e"');
            }
            return { kind: 'error', error: readErrorBody(obj) };
        }
        default: {
            const _exhaustive: never = frameType;
            throw new EnvelopeError(`Unhandled frame type ${_exhaustive}`);
        }
    }
}

export function decodeEnvelopeOptionsFromConnection(options: {
    strictEnvelope?: boolean;
    maxEnvelopeBytes?: number;
    maxEnvelopeDepth?: number;
}): DecodeEnvelopeOptions {
    return {
        strictEnvelope: options.strictEnvelope,
        maxEnvelopeBytes: options.maxEnvelopeBytes,
        maxEnvelopeDepth: options.maxEnvelopeDepth,
    };
}
