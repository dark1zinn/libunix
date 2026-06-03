import type { ClientOptions } from '../types.ts';

// Safe sleep ahh function
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function connectWithRetry<T>(
    connectOnce: () => Promise<T>,
    reconnect: ClientOptions['reconnect'],
): Promise<T> {
    if (!reconnect) {
        return connectOnce();
    }

    let lastError: Error | undefined;
    let delay = reconnect.initialDelay;

    for (let attempt = 0; attempt <= reconnect.attempts; attempt++) {
        try {
            return await connectOnce();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            if (attempt >= reconnect.attempts) {
                break;
            }
            await sleep(delay);
            if (reconnect.backoff === 'exponential') {
                delay *= 2;
            }
        }
    }

    throw lastError ?? new Error('Failed to connect');
}
