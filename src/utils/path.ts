import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { LibunixError } from "./errors.ts";

/** Max length for a logical socket id (not a full path). */
export const MAX_LOGICAL_ID_LENGTH = 128;

/** Max resolved filesystem path length (conservative). */
export const MAX_SOCKET_PATH_LENGTH = 4096;

const LOGICAL_ID_PATTERN = /^[a-zA-Z0-9._-]+$/;

export function isFilesystemPathId(id: string): boolean {
  return id.includes("/") || id.endsWith(".sock");
}

export function sanitizeLogicalId(id: string): string {
  const trimmed = id.trim();
  if (trimmed.length === 0) {
    throw new LibunixError("INVALID_PATH", "Socket id must not be empty");
  }
  if (trimmed.length > MAX_LOGICAL_ID_LENGTH) {
    throw new LibunixError(
      "INVALID_PATH",
      `Socket id exceeds ${MAX_LOGICAL_ID_LENGTH} characters`,
    );
  }
  if (!LOGICAL_ID_PATTERN.test(trimmed)) {
    throw new LibunixError(
      "INVALID_PATH",
      "Socket id may only contain letters, digits, '.', '_', and '-'",
    );
  }
  return trimmed;
}

export function resolveSocketPath(id: string): string {
  const resolved = isFilesystemPathId(id)
    ? resolve(id)
    : join(tmpdir(), `${sanitizeLogicalId(id)}.sock`);

  if (resolved.length > MAX_SOCKET_PATH_LENGTH) {
    throw new LibunixError("INVALID_PATH", "Resolved socket path is too long");
  }

  return resolved;
}
