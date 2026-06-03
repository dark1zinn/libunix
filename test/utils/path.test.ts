import { describe, expect, test } from 'bun:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LibunixError } from '../../src/utils/errors.ts';
import { isFilesystemPathId, resolveSocketPath, sanitizeLogicalId } from '../../src/utils/path.ts';

describe('resolveSocketPath', () => {
    test('resolves logical id under tmpdir', () => {
        const path = resolveSocketPath('app-orchestrator');
        expect(path).toBe(join(tmpdir(), 'app-orchestrator.sock'));
    });

    test('resolves explicit .sock path', () => {
        const path = resolveSocketPath('/var/run/my.sock');
        expect(path).toBe('/var/run/my.sock');
    });

    test('rejects empty logical id', () => {
        expect(() => sanitizeLogicalId('  ')).toThrow(LibunixError);
    });

    test('rejects unsafe logical id characters', () => {
        expect(() => sanitizeLogicalId('../evil')).toThrow(LibunixError);
    });

    test('isFilesystemPathId detects path-like ids', () => {
        expect(isFilesystemPathId('foo.sock')).toBe(true);
        expect(isFilesystemPathId('foo/bar')).toBe(true);
        expect(isFilesystemPathId('my-app')).toBe(false);
    });
});
