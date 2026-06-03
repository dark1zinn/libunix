export type LibunixErrorCode =
    | 'EADDRINUSE'
    | 'TIMEOUT'
    | 'CONNECTION_LOST'
    | 'HANDLER_THROW'
    | 'NO_HANDLER'
    | 'UNSUPPORTED_ENVELOPE_VERSION'
    | 'INVALID_PATH'
    | 'PROTOCOL_ERROR';

export class LibunixError extends Error {
    readonly code: LibunixErrorCode;

    constructor(code: LibunixErrorCode, message: string) {
        super(message);
        this.name = 'LibunixError';
        this.code = code;
    }
}

export function isLibunixError(value: unknown): value is LibunixError {
    return value instanceof LibunixError;
}
