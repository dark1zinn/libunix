import { createBunTransportAdapter } from "../transport/bun.ts";
import type { TransportAdapter } from "../transport/adapter.ts";
import { LibunixError } from "../utils/errors.ts";

export function createTransportAdapter(
  adapter: "bun" | "node" | undefined,
): TransportAdapter {
  if (adapter === "node") {
    throw new LibunixError(
      "PROTOCOL_ERROR",
      "Node transport adapter is not implemented in v1",
    );
  }
  return createBunTransportAdapter();
}
