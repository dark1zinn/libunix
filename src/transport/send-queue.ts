import type { TransportSocket } from './adapter.ts';

type QueueState = {
    pending: Uint8Array[];
    draining: boolean;
};

export type SocketWriteFn = (socket: TransportSocket, data: Uint8Array) => void;

/**
 * Serializes outbound writes per socket (§4.4).
 */
export class SendQueue {
    private readonly states = new Map<string, QueueState>();

    constructor(private readonly writeBytes: SocketWriteFn) {}

    enqueue(socket: TransportSocket, data: Uint8Array): void {
        const state = this.getOrCreateState(socket.handleId);
        state.pending.push(data);
        this.drain(socket, state);
    }

    clear(socket: TransportSocket): void {
        this.states.delete(socket.handleId);
    }

    pendingCount(socket: TransportSocket): number {
        return this.states.get(socket.handleId)?.pending.length ?? 0;
    }

    private getOrCreateState(handleId: string): QueueState {
        let state = this.states.get(handleId);
        if (!state) {
            state = { pending: [], draining: false };
            this.states.set(handleId, state);
        }
        return state;
    }

    private drain(socket: TransportSocket, state: QueueState): void {
        if (state.draining) {
            return;
        }
        state.draining = true;

        while (state.pending.length > 0) {
            const next = state.pending[0]!;
            this.writeBytes(socket, next);
            state.pending.shift();
        }

        state.draining = false;

        if (state.pending.length === 0) {
            this.states.delete(socket.handleId);
        }
    }
}
