import { existsSync, unlinkSync } from 'node:fs';
import type { TransportAdapter } from '../transport/adapter.ts';
import { LibunixError } from '../utils/errors.ts';

export async function prepareSocketPath(
    socketPath: string,
    transport: TransportAdapter,
): Promise<void> {
    if (!existsSync(socketPath)) {
        return;
    }

    const probe = await transport.probeConnect(socketPath);
    if (probe === 'alive') {
        throw new LibunixError(
            'EADDRINUSE',
            `Another process is already listening on ${socketPath}`,
        );
    }

    unlinkSync(socketPath);
}
