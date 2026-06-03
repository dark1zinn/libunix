import { describe, expect, test } from 'bun:test';
import {
    lifecycleDebugState,
    registerLifecycle,
    unregisterLifecycle,
} from '../../src/utils/lifecycle.ts';

describe('lifecycle registry', () => {
    test('attaches listeners on first register', () => {
        const participant = { close: async () => {} };
        registerLifecycle(participant);
        expect(lifecycleDebugState().listenersAttached).toBe(true);
        expect(lifecycleDebugState().refCount).toBe(1);
        unregisterLifecycle(participant);
        expect(lifecycleDebugState().listenersAttached).toBe(false);
        expect(lifecycleDebugState().refCount).toBe(0);
    });

    test('ref-counts multiple participants', () => {
        const a = { close: async () => {} };
        const b = { close: async () => {} };
        registerLifecycle(a);
        registerLifecycle(b);
        expect(lifecycleDebugState().refCount).toBe(2);
        unregisterLifecycle(a);
        expect(lifecycleDebugState().listenersAttached).toBe(true);
        unregisterLifecycle(b);
        expect(lifecycleDebugState().listenersAttached).toBe(false);
    });
});
