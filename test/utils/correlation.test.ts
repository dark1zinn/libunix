import { describe, expect, test } from 'bun:test';
import { CORRELATION_ID_SIZE } from '../../src/protocol/constants.ts';
import { correlationIdsEqual } from '../../src/protocol/frame.ts';
import {
    correlationIdToKey,
    nextCorrelationId,
    resetCorrelationSequence,
} from '../../src/utils/correlation.ts';

describe('nextCorrelationId', () => {
    test('returns 16 bytes', () => {
        const id = nextCorrelationId();
        expect(id.length).toBe(CORRELATION_ID_SIZE);
    });

    test('generates unique ids', () => {
        resetCorrelationSequence();
        const a = nextCorrelationId();
        const b = nextCorrelationId();
        expect(correlationIdsEqual(a, b)).toBe(false);
    });

    test('correlationIdToKey is stable hex', () => {
        const id = nextCorrelationId();
        const key = correlationIdToKey(id);
        expect(key).toMatch(/^[0-9a-f]{32}$/);
        expect(correlationIdToKey(id)).toBe(key);
    });
});
