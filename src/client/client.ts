import { StreamAccumulator } from '../protocol/accumulator.ts';
import { MessageType } from '../protocol/constants.ts';
import { decodeEnvelope, encodeEmit, encodeRequest } from '../protocol/envelope.ts';
import { encodeFrame, type DecodedFrame, zeroCorrelation } from '../protocol/frame.ts';
import type { TransportAdapter, TransportSocket } from '../transport/adapter.ts';
import type { ClientOptions, MessageHandler } from '../types.ts';
import { correlationIdToKey, nextCorrelationId } from '../utils/correlation.ts';
import { LibunixError, isLibunixError } from '../utils/errors.ts';
import { registerLifecycle, unregisterLifecycle } from '../utils/lifecycle.ts';
import { resolveSocketPath } from '../utils/path.ts';
import { createTransportAdapter } from '../server/transport-factory.ts';
import { connectWithRetry } from './reconnect.ts';
import { DEFAULT_REQUEST_TIMEOUT_MS, PendingRequestRegistry } from './pending.ts';

export class Client<OutgoingEvents extends Record<string, unknown> = Record<string, unknown>> {
    private readonly accumulator = new StreamAccumulator();
    private readonly pending = new PendingRequestRegistry();
    private readonly messageHandlers = new Map<string, MessageHandler<unknown>>();

    private socket: TransportSocket | undefined;
    private disconnected = false;
    private readonly lifecycleParticipant = {
        close: () => this.disconnect(),
    };

    private constructor(
        private readonly options: ClientOptions,
        private readonly socketPath: string,
        private readonly transport: TransportAdapter,
    ) {}

    static async connect<T extends Record<string, unknown> = Record<string, unknown>>(
        options: ClientOptions,
    ): Promise<Client<T>> {
        const transport = createTransportAdapter(options.adapter);
        const socketPath = resolveSocketPath(options.id);
        const client = new Client<T>(options, socketPath, transport);
        await client.establishConnection();
        registerLifecycle(client.lifecycleParticipant);
        return client;
    }

    on(event: string, handler: MessageHandler): void {
        this.messageHandlers.set(event, handler as MessageHandler<unknown>);
    }

    async emit<K extends keyof OutgoingEvents>(event: K, data: OutgoingEvents[K]): Promise<void> {
        this.assertConnected();
        const payload = encodeEmit(event as string, data);
        const frame = encodeFrame(MessageType.EventEmit, zeroCorrelation(), payload);
        this.transport.write(this.socket!, frame);
    }

    async request<K extends keyof OutgoingEvents, ResponseType = unknown>(
        event: K,
        data: OutgoingEvents[K],
        timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
    ): Promise<ResponseType> {
        this.assertConnected();
        const correlation = nextCorrelationId();
        const key = correlationIdToKey(correlation);
        const responsePromise = this.pending.register(key, timeoutMs);

        const payload = encodeRequest(event as string, data);
        const frame = encodeFrame(MessageType.Request, correlation, payload);
        this.transport.write(this.socket!, frame);

        return responsePromise as Promise<ResponseType>;
    }

    async disconnect(): Promise<void> {
        if (this.disconnected) {
            return;
        }
        this.disconnected = true;
        this.pending.rejectAll(new LibunixError('CONNECTION_LOST', 'Client disconnected'));
        if (this.socket) {
            await this.transport.close(this.socket);
            this.socket = undefined;
        }

        unregisterLifecycle(this.lifecycleParticipant);
    }

    private async establishConnection(): Promise<void> {
        this.socket = await connectWithRetry(() => this.openSocket(), this.options.reconnect);
    }

    private openSocket(): Promise<TransportSocket> {
        return this.transport.connect(this.socketPath, {
            onData: (_socket, chunk) => this.ingest(chunk),
            onClose: () => this.handleConnectionLost(),
            onError: (_socket, error) => this.handleConnectionLost(error),
        });
    }

    private ingest(chunk: Uint8Array): void {
        let frames: DecodedFrame[];
        try {
            frames = this.accumulator.append(chunk);
        } catch (error) {
            void this.handleConnectionLost(
                error instanceof Error ? error : new Error(String(error)),
            );
            return;
        }

        for (const frame of frames) {
            void this.dispatch(frame);
        }
    }

    private async dispatch(frame: DecodedFrame): Promise<void> {
        let envelope;
        try {
            envelope = decodeEnvelope(frame.payload, frame.type);
        } catch (error) {
            void this.handleConnectionLost(
                error instanceof Error ? error : new Error(String(error)),
            );
            return;
        }

        if (envelope.kind === 'emit') {
            const handler = this.messageHandlers.get(envelope.event);
            if (!handler) {
                return;
            }
            try {
                await handler(envelope.data);
            } catch {
                // v1: no client-side error channel for handler failures
            }
            return;
        }

        const key = correlationIdToKey(frame.correlationId);

        if (envelope.kind === 'success') {
            this.pending.resolve(key, envelope.data);
            return;
        }

        if (envelope.kind === 'error') {
            this.pending.reject(
                key,
                new LibunixError(normalizeErrorCode(envelope.error.code), envelope.error.message),
            );
        }
    }

    private assertConnected(): void {
        if (this.disconnected || !this.socket) {
            throw new LibunixError('CONNECTION_LOST', 'Client is not connected');
        }
    }

    private handleConnectionLost(error?: Error): void {
        if (this.disconnected) {
            return;
        }
        this.socket = undefined;
        const reason =
            error ?? new LibunixError('CONNECTION_LOST', 'Connection to server was lost');
        this.pending.rejectAll(
            isLibunixError(reason) ? reason : new LibunixError('CONNECTION_LOST', reason.message),
        );
    }
}

function normalizeErrorCode(code: string): LibunixError['code'] {
    const allowed: LibunixError['code'][] = [
        'NO_HANDLER',
        'HANDLER_THROW',
        'TIMEOUT',
        'UNSUPPORTED_ENVELOPE_VERSION',
        'PROTOCOL_ERROR',
        'CONNECTION_LOST',
        'EADDRINUSE',
        'INVALID_PATH',
    ];
    if (allowed.includes(code as LibunixError['code'])) {
        return code as LibunixError['code'];
    }
    return 'PROTOCOL_ERROR';
}
