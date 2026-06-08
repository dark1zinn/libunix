import { StreamAccumulator } from '../protocol/accumulator.ts';
import { MessageType } from '../protocol/constants.ts';
import {
    decodeEnvelope,
    decodeEnvelopeOptionsFromConnection,
    encodeEmit,
    encodeError,
    encodeSuccess,
    type DecodeEnvelopeOptions,
    type EnvelopeErrorBody,
} from '../protocol/envelope.ts';
import { encodeFrame, type DecodedFrame, zeroCorrelation } from '../protocol/frame.ts';
import type { TransportAdapter, TransportSocket } from '../transport/adapter.ts';
import type { MessageHandler, RequestHandler } from '../types.ts';

export class RemotePeer<IncomingEvents extends Record<string, unknown>> {
    readonly id: string;
    private readonly accumulator = new StreamAccumulator();
    private readonly messageHandlers = new Map<string, MessageHandler<unknown>>();
    private readonly requestHandlers = new Map<string, RequestHandler<unknown, unknown>>();

    constructor(
        readonly socket: TransportSocket,
        private readonly transport: TransportAdapter,
        private readonly onProtocolError: (error: Error) => void,
        private readonly decodeEnvelopeOptions?: DecodeEnvelopeOptions,
    ) {
        this.id = socket.handleId;
    }

    on<K extends keyof IncomingEvents>(event: K, handler: MessageHandler<IncomingEvents[K]>): void {
        this.messageHandlers.set(event as string, handler as MessageHandler<unknown>);
    }

    onRequest<K extends keyof IncomingEvents, R>(
        event: K,
        handler: RequestHandler<IncomingEvents[K], R>,
    ): void {
        this.requestHandlers.set(event as string, handler as RequestHandler<unknown, unknown>);
    }

    async emit<K extends string>(event: K, data: unknown): Promise<void> {
        const payload = encodeEmit(event, data);
        const frame = encodeFrame(MessageType.EventEmit, zeroCorrelation(), payload);
        this.transport.write(this.socket, frame);
    }

    ingest(chunk: Uint8Array): void {
        let frames: DecodedFrame[];
        try {
            frames = this.accumulator.append(chunk);
        } catch (error) {
            this.onProtocolError(error instanceof Error ? error : new Error(String(error)));
            void this.transport.close(this.socket);
            return;
        }

        for (const frame of frames) {
            void this.dispatch(frame);
        }
    }

    private async dispatch(frame: DecodedFrame): Promise<void> {
        let envelope;
        try {
            envelope = decodeEnvelope(frame.payload, frame.type, this.decodeEnvelopeOptions);
        } catch (error) {
            this.onProtocolError(error instanceof Error ? error : new Error(String(error)));
            return;
        }

        if (envelope.kind === 'emit') {
            const handler = this.messageHandlers.get(envelope.event);
            if (!handler) {
                return;
            }
            try {
                await handler(envelope.data);
            } catch (error) {
                this.onProtocolError(error instanceof Error ? error : new Error(String(error)));
            }
            return;
        }

        if (envelope.kind === 'request') {
            const handler = this.requestHandlers.get(envelope.event);
            if (!handler) {
                this.replyError(frame, {
                    code: 'NO_HANDLER',
                    message: `No handler registered for event "${envelope.event}"`,
                });
                return;
            }
            try {
                const result = await handler(envelope.data);
                this.replySuccess(frame, result);
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Handler threw an error';
                this.replyError(frame, {
                    code: 'HANDLER_THROW',
                    message,
                });
            }
        }
    }

    private replySuccess(frame: DecodedFrame, result: unknown): void {
        const payload = encodeSuccess(result);
        const response = encodeFrame(MessageType.ResponseSuccess, frame.correlationId, payload);
        this.transport.write(this.socket, response);
    }

    private replyError(frame: DecodedFrame, err: EnvelopeErrorBody): void {
        const payload = encodeError(err);
        const response = encodeFrame(MessageType.ResponseError, frame.correlationId, payload);
        this.transport.write(this.socket, response);
    }
}
