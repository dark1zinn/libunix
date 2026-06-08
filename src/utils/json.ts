import { MAX_BODY_LENGTH, MIN_BODY_LENGTH } from '../protocol/constants.ts';

export const DEFAULT_MAX_ENVELOPE_BYTES = MAX_BODY_LENGTH - MIN_BODY_LENGTH;
export const DEFAULT_MAX_ENVELOPE_DEPTH = 64;

const FORBIDDEN_JSON_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function parseJsonSafe(text: string): unknown {
    return JSON.parse(text, (key, value) => {
        if (FORBIDDEN_JSON_KEYS.has(key)) {
            return undefined;
        }
        return value;
    });
}

export function measureJsonDepth(value: unknown): number {
    function walk(current: unknown, depth: number): number {
        if (current === null || typeof current !== 'object') {
            return depth;
        }

        let max = depth;
        const items = Array.isArray(current) ? current : Object.values(current);
        for (const item of items) {
            max = Math.max(max, walk(item, depth + 1));
        }
        return max;
    }

    return walk(value, 0);
}
