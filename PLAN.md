# Technical Specification & Architectural Blueprint: libunix

**Package Name:** `libunix`

**Target Runtimes:** Bun (primary, v1 implementation). Node.js/Deno via `TransportAdapter` are **deferred** (see §8 Non-Goals).

**Language:** TypeScript

**Design Philosophy:** Elite Developer Experience (DX), Strict Protocol Stability, Resource Hygiene, **Zero Runtime npm Dependencies**.

---

## 1. Overview & Objectives

`libunix` is a high-performance, abstraction-layer library for managing Unix Domain Sockets (UDS). It eliminates the complexities of raw streaming, chunk fragmentation, filesystem state management, and manual request-response pairing. It converts raw stream channels into highly intuitive, event-driven messaging networks.

### Core Goals for AI Implementation Agents:

1. **Zero Raw Stream Exposure:** The end consumer must never interact with fractional bytes or partial data chunks.
2. **Deterministic Messaging:** Every transmission must be explicitly framed using a predictable length-prefixed protocol.
3. **Impeccable System Hygiene:** Automate file unlinking, handle dead sockets gracefully, and ensure zero lingering resources on process exit.
4. **Clean API Surface:** Provide absolute simplicity via exported `Server` and `Client` primitives.

### 1.1 Zero Runtime Dependencies

- **`package.json` must not list `dependencies`.** Only runtime builtins and Node/Bun **core modules** (`node:fs`, `node:os`, `node:path`, `JSON`, `crypto`).
- **Allowed dev tooling:** `@types/bun` (devDependency), `bun test` for validation.
- **Optional for consumers:** `typescript` as `peerDependencies` (typing event maps only).
- **Do not add:** `uuid`, `zod`, `msgpack`, `vitest`/`jest`, or IPC wrapper packages unless a future requirement explicitly overrides this policy.
- **Forward/backward compatibility** is achieved via stable wire frames, envelope `v`, and optional JSON fields—not via npm packages.

### 1.2 v1 Scope (KISS)

- **Filesystem-bound UDS paths only** (§4.1). Linux abstract namespace sockets are deferred.
- **Bun adapter only** at runtime; `adapter: 'node'` in config may exist for forward-compat but must throw until a Node adapter ships.
- **Client → server** `request()` / `emit()` only; **no** `RemotePeer.request()` (server-initiated RPC) in v1.

---

## 2. Wire Protocol & Binary Framing

Unix Domain Sockets are stream-oriented (not packet-oriented). Data sent as a single block may be sliced into multiple fragments by the OS kernel, or multiple messages may be concatenated into a single read operation. `libunix` resolves this by wrapping every payload in a strict binary frame.

### 2.1 Frame Layout

Every frame transmitted across the socket must conform to the following byte allocation map:

```
+---------------------------+------------------------+-----------------------------------+-----------------------------------+
|  Length Header (4 Bytes)  |  Message Type (1 Byte) |     Correlation ID (16 Bytes)     |       Payload (Variable Length)   |
+---------------------------+------------------------+-----------------------------------+-----------------------------------+
| Uint32 (Big-Endian)       | 0x01 | 0x02 | 0x03 ... | ASCII / Binary String Segment     | UTF-8 Encoded JSON or Raw Binary  |
+---------------------------+------------------------+-----------------------------------+-----------------------------------+

```

### 2.2 Header Specification

1. **Length Header (Bytes 0-3):** A 32-bit unsigned integer (`Uint32`) rendered in Big-Endian (Network Byte Order). This integer defines the exact length of the remaining frame data (**excluding** these 4 header bytes).
2. **Message Type (Byte 4):** A single byte flag defining the interaction pattern:

- `0x01` (`EVENT_EMIT`): Fire-and-forget message. No reply tracking needed.
- `0x02` (`REQUEST`): Bi-directional message requiring an explicit matching response.
- `0x03` (`RESPONSE_SUCCESS`): A positive reply matching an open `REQUEST`.
- `0x04` (`RESPONSE_ERROR`): A failure reply matching an open `REQUEST`.

3. **Correlation ID (bytes 5–20 of the length-delimited body):** A **16-byte opaque binary slot** (not a variable-length string). For `EVENT_EMIT`, all 16 bytes must be `0x00`. For `REQUEST` / `RESPONSE_*`, the client generates 16 unique bytes per in-flight request; responses must echo the initiating request’s bytes exactly. v1 generator: 8-byte big-endian `uint64` (timestamp ms) + 8-byte big-endian `uint64` (monotonic counter). Do not use UTF-8 UUID text unless it is exactly 16 bytes when encoded.
4. **Payload (bytes 21+ of the full on-wire frame):** The variable tail of the length-delimited body: UTF-8 JSON application envelope (§2.4) in v1. The framing layer treats payload as opaque bytes; only the envelope decoder interprets JSON.

**Frame size limits (v1):**

- `MAX_FRAME_SIZE = 1_048_576` (1 MiB): maximum total on-wire frame size `4 + L`.
- `MIN_BODY_LENGTH = 17`: minimum `L` (= 1 byte type + 16 byte correlation + 0 byte payload). Emit/request envelopes require non-empty JSON payload (practical minimum `L ≥ 19`).
- If `L > MAX_FRAME_SIZE - 4` or `L < MIN_BODY_LENGTH`, drop the connection.

### 2.3 Stream Fragmentation Processing Engine

The internal network buffer layer must manage an accumulative chunk pipeline. Length `L` is the size of everything **after** the 4-byte length prefix (type + correlation + payload).

1. **Read length:** Accumulate until `buffer.length ≥ 4`. Parse `L` as big-endian `Uint32`. If invalid per §2.2 limits, drop connection.
2. **Read body:** Accumulate until `buffer.length ≥ 4 + L`.
3. **Dispatch:** Slice exactly `4 + L` bytes as one frame. Pass bytes `[4, 4+L)` to the frame deserializer (type at offset 4, correlation at 5–20, payload at 21+). Retain any trailing bytes for the next loop.
4. **Repeat** from step 1 on the remainder.

Partial reads (e.g. 2 bytes of `L` then the rest) must be handled; never assume a single `read` delivers a full frame.

### 2.4 Application Envelope (JSON)

Payload bytes are **UTF-8 JSON**. The wire frame supplies message type and correlation; the envelope supplies **event name** and **data** for the public API (`emit`, `request`, handlers).

#### Envelope shapes

| Wire type                 | API                             | JSON payload (UTF-8)               |
| ------------------------- | ------------------------------- | ---------------------------------- |
| `0x01` `EVENT_EMIT`       | `emit(event, data)`             | `{"v":1,"e":"<event>","d":<data>}` |
| `0x02` `REQUEST`          | `request(event, data)`          | `{"v":1,"e":"<event>","d":<data>}` |
| `0x03` `RESPONSE_SUCCESS` | handler return value            | `{"v":1,"d":<result>}` — no `e`    |
| `0x04` `RESPONSE_ERROR`   | handler throw / missing handler | `{"v":1,"err":{...}}` — no `e`     |

**Fields:**

- `v` (number, required): Envelope version. **Only `1` is supported in v1.** Unknown `v` on an inbound `REQUEST` should yield `RESPONSE_ERROR` with `code: "UNSUPPORTED_ENVELOPE_VERSION"`.
- `e` (string, required on emit/request): Event channel name (e.g. `"system:ping"`). Must match a registered handler key.
- `d` (any JSON value or `null`): Event argument. Use `"d":null` when there is no argument (e.g. `request("system:ping")`).
- `err` (object, required on `RESPONSE_ERROR` only):

```typescript
interface EnvelopeError {
    code: string; // UPPER_SNAKE, e.g. "NO_HANDLER", "HANDLER_THROW", "TIMEOUT"
    message: string; // human-readable; no stack traces on the wire in v1
    details?: unknown; // optional forward-compat
}
```

#### Routing rules

**Server (inbound from client):**

- `EVENT_EMIT`: decode envelope → dispatch `peer.on(e)` if registered; if no handler, **silent drop** (no wire reply in v1).
- `REQUEST`: decode envelope → dispatch `peer.onRequest(e)`; on success reply with `RESPONSE_SUCCESS`, same correlation, `{"v":1,"d":<result>}`; on thrown error reply with `RESPONSE_ERROR`, `code: "HANDLER_THROW"`; if no handler, `RESPONSE_ERROR`, `code: "NO_HANDLER"`.

**Client (inbound from server):**

- `EVENT_EMIT`: decode → dispatch `client.on(e)` if registered.
- `RESPONSE_SUCCESS` / `RESPONSE_ERROR`: match **correlation bytes** to internal pending map; resolve or reject the `request()` promise. `RESPONSE_ERROR` → reject with library error using `err.code` / `err.message`.

**Defaults (v1):**

- `request(..., timeoutMs?)` default timeout: **30_000** ms.
- Serialization: `JSON.stringify` / `JSON.parse` only (zero npm dependencies).

#### Example

Client `request("system:ping", null)`:

- Outbound frame: type `0x02`, 16-byte correlation, payload `{"v":1,"e":"system:ping","d":null}`.
- Server handler returns `{ status: "pong", timestamp: 1730000000000 }`.
- Inbound frame: type `0x03`, **same** correlation, payload `{"v":1,"d":{"status":"pong","timestamp":1730000000000}}`.

#### Forward compatibility

- v1 decoders ignore unknown optional JSON keys (e.g. future `"meta":{}`).
- Future envelope `v: 2` may change JSON shape; the binary frame layout stays stable.
- Raw/binary payload mode is out of scope for v1.

Implementation: `src/protocol/envelope.ts` (`encodeEmit`, `encodeRequest`, `encodeSuccess`, `encodeError`, `decodeEnvelope`).

---

## 3. Public API Contracts (TypeScript)

### 3.1 Shared Types

```typescript
export interface ConnectionOptions {
    id: string; // Logical name or filesystem path (see §4.1 path resolution)
    adapter?: 'bun' | 'node'; // v1: only 'bun' (default); 'node' throws until implemented
}

export interface ServerOptions extends ConnectionOptions {
    chmod?: number; // File permissions safety layer (e.g., 0o600)
}

export interface ClientOptions extends ConnectionOptions {
    reconnect?: {
        attempts: number;
        backoff: 'fixed' | 'exponential';
        initialDelay: number;
    };
}

export type MessageHandler<T = any> = (data: T) => void | Promise<void>;
export type RequestHandler<T = any, R = any> = (data: T) => R | Promise<R>;
```

### 3.2 The Server Interface

```typescript
export class Server<IncomingEvents extends Record<string, any> = any> {
    private constructor(options: ServerOptions);

    /**
     * Initializes the socket lifecycle, hooks process exit listeners, cleans old files,
     * and opens the Unix Socket listener.
     */
    static create<T extends Record<string, any> = any>(options: ServerOptions): Promise<Server<T>>;

    /** Registers global connection events */
    on(event: 'connection', callback: (peer: RemotePeer<IncomingEvents>) => void): this;
    on(event: 'error', callback: (err: Error) => void): this;

    /** Gracefully tears down the listener and safely unlinks the physical socket file */
    close(): Promise<void>;

    /** Explicit resource management hook for modern runtimes */
    [Symbol.dispose](): void;
}

export class RemotePeer<IncomingEvents extends Record<string, any>> {
    readonly id: string; // Internal process / socket handle reference

    /** Listens to fire-and-forget channel events from this client */
    on<K extends keyof IncomingEvents>(event: K, handler: MessageHandler<IncomingEvents[K]>): void;

    /** Registers a handler to respond directly to incoming client requests */
    onRequest<K extends keyof IncomingEvents, R>(
        event: K,
        handler: RequestHandler<IncomingEvents[K], R>,
    ): void;

    /** Sends a fire-and-forget message directly to this individual client */
    emit<K extends string>(event: K, data: any): Promise<void>;
}
```

### 3.3 The Client Interface

```typescript
export class Client<OutgoingEvents extends Record<string, any> = any> {
    private constructor(options: ClientOptions);

    /** Establishes a connection to the active Unix socket server with built-in retry capabilities */
    static connect<T extends Record<string, any> = any>(options: ClientOptions): Promise<Client<T>>;

    /** Emits an un-tracked fire-and-forget payload over the socket */
    emit<K extends keyof OutgoingEvents>(event: K, data: OutgoingEvents[K]): Promise<void>;

    /** * Sends a structured request frame, generates an internal deferred tracking promise,
     * and awaits the server's matching execution loop response.
     */
    request<K extends keyof OutgoingEvents, ResponseType = any>(
        event: K,
        data: OutgoingEvents[K],
        timeoutMs?: number,
    ): Promise<ResponseType>;

    /** Listens to spontaneous fire-and-forget events sent down from the parent server */
    on(event: string, handler: MessageHandler): void;

    /** Sever the current transport loop gracefully */
    disconnect(): Promise<void>;
}
```

---

## 4. Internal Governance & Operational Primitives

### 4.1 Filesystem Hygiene & Self-Healing Startup

**v1 addressing:** Filesystem paths only. No abstract namespace (`\0` prefix) in v1.

**Path resolution (`resolveSocketPath(id)`):**

1. If `id` contains `/` or ends with `.sock` → `path.resolve(id)` (absolute or relative filesystem path). Parent directory must already exist (no auto-mkdir in v1).
2. Else → `path.join(os.tmpdir(), `${sanitize(id)}.sock`)` using `node:os` `tmpdir()` (honors `TMPDIR`).
3. Reject unsafe or overlong `id` / paths at `Server.create()` / `Client.connect()`.

When `Server.create()` is executed, the internal runtime coordinator MUST process the resolved socket path through the following deterministic synchronization lifecycle:

1. **Detection:** Check if a file already exists at the requested path.
2. **Liveness Verification:** If the file exists, attempt a dry, low-timeout connection loop (`Bun.connect` or platform equivalent) to the socket.

- **Case A (Active Server):** If the connection succeeds, another instance is running. The server setup MUST throw an `EADDRINUSE` exception to block split-brain issues.
- **Case B (Orphaned Socket File):** If the connection is explicitly refused (`ECONNREFUSED`), the file is a leftover remnant of a previous ungraceful application crash. The setup routine MUST automatically call `fs.unlinkSync()` to scrub the dead reference.

3. **Allocation:** Spawn the native network listener and apply file protection attributes via `fs.chmodSync()` matching the specified options.

### 4.2 Graceful Process Teardown

To minimize orphaned operating system handles, use a **single ref-counted lifecycle registry** (`src/utils/lifecycle.ts`) shared by all `Server` / `Client` instances:

- Register **one** set of `process` listeners (`SIGINT`, `SIGTERM`) on first instance; increment ref count per instance, decrement on `close()` / `disconnect()`.
- On signal: run async `close()` / `disconnect()` for all registered instances (best-effort `Promise.all`).
- Remove listeners when ref count reaches zero.
- **`process.on('exit')`:** only synchronous cleanup (e.g. `unlinkSync`); do not rely on `await` during `exit`.
- **`[Symbol.dispose]()`:** sync best-effort teardown (fire-and-forget); prefer `await close()` for full hygiene.
- Document: `SIGKILL` and hard crashes may leave orphan socket files; §4.1 probe-on-start mitigates on next boot.

### 4.3 Platform Agnostic Isolation: The Adapter Interface

To ensure `libunix` remains agnostic and easily extensible without exposing public API changes, isolate all native networking interactions behind a minimal layout interface:

```typescript
export interface TransportAdapter {
    listen(path: string, connections: (socket: any) => void, onError: (err: any) => void): any;
    connect(path: string): Promise<any>;
    write(socket: any, data: Uint8Array): void;
    close(socket: any): Promise<void>;
}
```

### 4.4 Per-Connection Send Queue

Concurrent `write()` calls on one stream interleave bytes and corrupt frames. Every connected socket must use a **serialized send queue** (`src/transport/send-queue.ts`):

- `enqueue(socket, Uint8Array)` appends to a per-socket FIFO.
- A single in-flight write drains the queue; when complete, start the next chunk.
- All `emit` / `request` / response encoding paths go through the queue, never raw adapter `write` from multiple call sites without serialization.
- v1 backpressure: if write fails with `EAGAIN`, retry or queue (full pause/resume is a patch backlog item).

### 4.5 Client Pending Request Registry

`Client.request()` (`src/client/pending.ts`) maintains `Map<string, PendingEntry>` keyed by **hex-encoded 16-byte correlation id** (or equivalent stable string key):

- On `request`: generate correlation (§2.2), store `{ resolve, reject, timer }`, send `REQUEST` frame.
- On `RESPONSE_SUCCESS`: decode `d`, `resolve`, delete entry, clear timer.
- On `RESPONSE_ERROR`: `reject(LibunixError)`, delete entry, clear timer.
- On **timeout** (default 30_000 ms): `reject` with `code: "TIMEOUT"`, delete entry; ignore late responses for that id.
- On **disconnect** or **reconnect start**: reject all pending with a single connection-lost error; clear map.
- Multiple concurrent `request()` calls are supported (unique correlation per call).

---

## 5. Comprehensive Implementation Roadmap

AI agents executing this build should tackle development sequentially across these 5 key phases:

```
+--------------------------------------------------------------------------+
| PHASE 1: Protocol & Serialization Engine                                 |
| - Implement Uint8Array binary framing utilities                          |
| - Build stream accumulator class with state-driven chunk parsing         |
+--------------------------------------------------------------------------+
                                    |
                                    v
+--------------------------------------------------------------------------+
| PHASE 2: Network Adapters Core                                           |
| - Implement BunTransportAdapter via Bun.listen / Bun.connect             |
| - Standardize error conversions (ECONNREFUSED -> Unlink pathway)         |
+--------------------------------------------------------------------------+
                                    |
                                    v
+--------------------------------------------------------------------------+
| PHASE 3: Public Server Core Construction                                 |
| - Build Server class and RemotePeer wrapper                              |
| - Wire file verification lifecycle and signal hooks                      |
+--------------------------------------------------------------------------+
                                    |
                                    v
+--------------------------------------------------------------------------+
| PHASE 4: Public Client Core Construction                                 |
| - Build Client class with deferred Promise registry maps                 |
| - Add timeout management loops and reconnect backoff algorithms          |
+--------------------------------------------------------------------------+
                                    |
                                    v
+--------------------------------------------------------------------------+
| PHASE 5: Validation Suite & Stress Simulation                            |
| - Write automated concurrency test benches                               |
| - Inject mock packet splits/concatenations to ensure frame safety        |
+--------------------------------------------------------------------------+

```

### Phase 1: Protocol & Serialization Engine

- Code the framing formatter that builds out the multi-segment byte packets (`4 bytes length + 1 byte type + 16 bytes tracking + body`).
- Code the consumer stream accumulator. This class must expose an `append(chunk: Uint8Array)` method that continually processes incoming fragments, checking lengths and pulling out full, discrete byte packages.

### Phase 2: Network Adapters Core

- Implement the core `BunTransportAdapter` utilizing `Bun.listen` and `Bun.connect`.
- Ensure that raw network data events feed directly into the Phase 1 processing accumulator.

### Phase 3: Public Server Core Construction

- Create the `Server` and `RemotePeer` classes.
- Implement the filesystem checking algorithm to identify and clean up crashed remnants.
- Integrate internal lifecycle hooks (`SIGINT` / `SIGTERM`) to trigger structural file deletion.

### Phase 4: Public Client Core Construction

- Create the `Client` class.
- Implement the `request` method: generate a **16-byte binary** correlation ID (§2.2), append a deferred promise to an internal tracking map, and emit a `REQUEST` frame with the §2.4 envelope. When type `0x03` or `0x04` arrives with the same correlation bytes, resolve/reject the promise and remove the map entry.
- Code the exponential backoff reconnection routine to retry connections if the socket disappears unexpectedly.

### Phase 5: Validation Suite & Stress Simulation

- Build out a test layout involving massive asynchronous JSON loops to verify that correlation IDs are cleanly routed without data overlap.
- Rig up a stress injector that manually splits frame payloads into tiny 2-byte network chunks to guarantee the structural stream accumulator handles high-fragmentation edge cases without breaking.

---

## 6. Source Module Layout

One concern per file. Public API exported only from `src/index.ts` (and types from `src/types.ts`). **Import direction:** `protocol` must not import `server` / `client`; `transport` imports `protocol` only; `server` / `client` import `protocol`, `transport`, `utils`.

```
src/
  index.ts                 # public exports only
  types.ts                 # ConnectionOptions, handlers, shared public types
  protocol/
    constants.ts           # MessageType, MAX_FRAME_SIZE, MIN_BODY_LENGTH
    frame.ts               # encodeFrame / decodeFrame
    accumulator.ts         # StreamAccumulator.append()
    envelope.ts            # §2.4 JSON envelope encode/decode
  transport/
    adapter.ts             # TransportAdapter interface
    bun.ts                 # BunTransportAdapter
    send-queue.ts          # §4.4 serialized writes
  server/
    server.ts              # Server.create, close
    peer.ts                # RemotePeer handlers + emit
    socket-hygiene.ts      # §4.1 resolve path, probe, unlink, chmod
  client/
    client.ts              # connect, emit, request, disconnect, on
    pending.ts             # §4.5 correlation map + timeouts
    reconnect.ts           # fixed | exponential backoff
  utils/
    path.ts                # resolveSocketPath
    correlation.ts         # nextCorrelationId() -> 16 bytes
    lifecycle.ts           # §4.2 ref-counted signal registry
    errors.ts              # LibunixError

test/                      # mirrors protocol/, server/, client/ (Phase 5)
```

---

## 7. Non-Goals (v1 and Deferred)

| Item                                         | Status                                           |
| -------------------------------------------- | ------------------------------------------------ |
| Linux abstract namespace UDS                 | Deferred (opt-in future `namespace: 'abstract'`) |
| `NodeTransportAdapter` / Deno                | Deferred; v1 Bun only                            |
| `RemotePeer.request()` (server → client RPC) | Out of v1                                        |
| Broadcast / multi-peer fan-out helper        | Out of v1                                        |
| npm runtime dependencies                     | Forbidden in v1 (§1.1)                           |
| Wire protocol version byte                   | Deferred (patch backlog)                         |
| MessagePack / binary envelope mode           | Deferred                                         |

Hardening items (duplicate response, jitter on reconnect, lockfile for `/tmp` races, etc.) live in the execution plan **patch** backlog—not v1 blockers.

---

## 8. Implementation Agent Workflow

Agents implementing this package must follow **one todo per session**:

1. Complete the next pending item in order: spec (`plan-01` ✓, `plan-02` ✓) → `impl-01` … `impl-10`.
2. Do not start the following todo in the same session unless the user explicitly asks to continue.
3. After each todo: summarize changes, how to review, then **stop** for user approval (`proceed`).

Patch todos are **low urgency** until v1 core is shipped and the user reprioritizes.
