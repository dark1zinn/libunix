import { createBunTransportAdapter } from '../transport/bun.ts';
import { createNodeTransportAdapter } from '../transport/node.ts';
import type { TransportAdapter } from '../transport/adapter.ts';

function hasBunRuntime(): boolean {
    return typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined';
}

function resolveAdapter(adapter: 'bun' | 'node' | undefined): 'bun' | 'node' {
    if (adapter === 'node') {
        return 'node';
    }
    if (adapter === 'bun') {
        return 'bun';
    }
    return hasBunRuntime() ? 'bun' : 'node';
}

export function createTransportAdapter(adapter: 'bun' | 'node' | undefined): TransportAdapter {
    const resolved = resolveAdapter(adapter);
    if (resolved === 'node') {
        return createNodeTransportAdapter();
    }
    return createBunTransportAdapter();
}
