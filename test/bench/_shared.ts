import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export function tempSocketPath(prefix = 'libunix-bench'): string {
    return join(tmpdir(), `${prefix}-${crypto.randomUUID()}.sock`);
}

export function cleanupSocket(socketPath: string): void {
    try {
        if (existsSync(socketPath)) {
            unlinkSync(socketPath);
        }
    } catch {
        // ignore
    }
}

export function parseIterations(argvIndex: number, envKey: string, defaultValue: number): number {
    const fromArgv = process.argv[argvIndex];
    if (fromArgv !== undefined) {
        const n = Number.parseInt(fromArgv, 10);
        if (Number.isFinite(n) && n > 0) {
            return n;
        }
    }

    const fromEnv = process.env[envKey];
    if (fromEnv !== undefined) {
        const n = Number.parseInt(fromEnv, 10);
        if (Number.isFinite(n) && n > 0) {
            return n;
        }
    }

    return defaultValue;
}

export function parseConcurrency(defaultValue = 32): number {
    const raw = process.env.BENCH_CONCURRENCY;
    if (raw === undefined) {
        return defaultValue;
    }
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : defaultValue;
}

export function splitIntoChunks(data: Uint8Array, size: number): Uint8Array[] {
    const chunks: Uint8Array[] = [];
    for (let i = 0; i < data.length; i += size) {
        chunks.push(data.subarray(i, i + size));
    }
    return chunks;
}
