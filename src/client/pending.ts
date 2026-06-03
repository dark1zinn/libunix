import { LibunixError } from '../utils/errors.ts';

type PendingEntry = {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
};

export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export class PendingRequestRegistry {
    private readonly pending = new Map<string, PendingEntry>();

    register(correlationKey: string, timeoutMs: number): Promise<unknown> {
        if (this.pending.has(correlationKey)) {
            return Promise.reject(new LibunixError('PROTOCOL_ERROR', 'Duplicate correlation id'));
        }

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(correlationKey);
                reject(new LibunixError('TIMEOUT', `Request timed out after ${timeoutMs}ms`));
            }, timeoutMs);

            this.pending.set(correlationKey, { resolve, reject, timer });
        });
    }

    resolve(correlationKey: string, data: unknown): boolean {
        const entry = this.pending.get(correlationKey);
        if (!entry) {
            return false;
        }
        clearTimeout(entry.timer);
        this.pending.delete(correlationKey);
        entry.resolve(data);
        return true;
    }

    reject(correlationKey: string, error: Error): boolean {
        const entry = this.pending.get(correlationKey);
        if (!entry) {
            return false;
        }
        clearTimeout(entry.timer);
        this.pending.delete(correlationKey);
        entry.reject(error);
        return true;
    }

    rejectAll(error: Error): void {
        for (const entry of this.pending.values()) {
            clearTimeout(entry.timer);
            entry.reject(error);
        }
        this.pending.clear();
    }

    pendingCount(): number {
        return this.pending.size;
    }
}
