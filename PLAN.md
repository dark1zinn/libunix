# Technical Specification & Architectural Blueprint: libunix

**Package Name:** `libunix`

**Target Runtimes:** Bun (Primary, optimized), Node.js/Deno (Agnostic via Adapter Pattern)

**Language:** TypeScript

**Design Philosophy:** Elite Developer Experience (DX), Strict Protocol Stability, Resource Hygiene, Zero External Dependencies.

---

## 1. Overview & Objectives

`libunix` is a high-performance, abstraction-layer library for managing Unix Domain Sockets (UDS). It eliminates the complexities of raw streaming, chunk fragmentation, filesystem state management, and manual request-response pairing. It converts raw stream channels into highly intuitive, event-driven messaging networks.

### Core Goals for AI Implementation Agents:

1. **Zero Raw Stream Exposure:** The end consumer must never interact with fractional bytes or partial data chunks.
2. **Deterministic Messaging:** Every transmission must be explicitly framed using a predictable length-prefixed protocol.
3. **Impeccable System Hygiene:** Automate file unlinking, handle dead sockets gracefully, and ensure zero lingering resources on process exit.
4. **Clean API Surface:** Provide absolute simplicity via exported `Server` and `Client` primitives.

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
* `0x01` (`EVENT_EMIT`): Fire-and-forget message. No reply tracking needed.
* `0x02` (`REQUEST`): Bi-directional message requiring an explicit matching response.
* `0x03` (`RESPONSE_SUCCESS`): A positive reply matching an open `REQUEST`.
* `0x04` (`RESPONSE_ERROR`): A failure reply matching an open `REQUEST`.


3. **Correlation ID (Bytes 5-20):** A 16-byte fixed-width slot. For `EVENT_EMIT`, this must be filled with zeros. For `REQUEST`, this contains a unique alphanumeric identifier (e.g., fractional timestamp + incremental tracker padding to 16 bytes). A `RESPONSE` must echo back the exact correlation ID of its initiating `REQUEST`.
4. **Payload (Bytes 21+):** The raw serialized message block. By default, this is a UTF-8 string containing stringified JSON, but the framing parser must remain agnostic to allow raw binary injection.

### 2.3 Stream Fragmentation Processing Engine

The internal network buffer layer must manage an accumulative chunk pipeline.

* **State 1: Reading Header:** Accumulate incoming bytes until the total buffer size is $\ge 21$ bytes. Parse the length header ($L$).
* **State 2: Reading Payload:** Accumulate incoming bytes until the total buffer size contains at least $4 + L$ bytes.
* **State 3: Frame Dispatch:** Slice exactly $4 + L$ bytes out of the pipeline buffer, pass it down to the framing deserializer, and retain any trailing bytes for the next framing loop cycle.

---

## 3. Public API Contracts (TypeScript)

### 3.1 Shared Types

```typescript
export interface ConnectionOptions {
  id: string;             // Absolute file path or a generic token resolving to /tmp/{id}.sock
  adapter?: 'bun' | 'node'; // Extensible platform target
}

export interface ServerOptions extends ConnectionOptions {
  chmod?: number;         // File permissions safety layer (e.g., 0o600)
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
  onRequest<K extends keyof IncomingEvents, R>(event: K, handler: RequestHandler<IncomingEvents[K], R>): void;

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
    timeoutMs?: number
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

When `Server.create()` is executed, the internal runtime coordinator MUST process the target socket path through the following deterministic synchronization lifecycle:

1. **Detection:** Check if a file already exists at the requested path.
2. **Liveness Verification:** If the file exists, attempt a dry, low-timeout connection loop (`Bun.connect` or platform equivalent) to the socket.
* **Case A (Active Server):** If the connection succeeds, another instance is running. The server setup MUST throw an `EADDRINUSE` exception to block split-brain issues.
* **Case B (Orphaned Socket File):** If the connection is explicitly refused (`ECONNREFUSED`), the file is a leftover remnant of a previous ungraceful application crash. The setup routine MUST automatically call `fs.unlinkSync()` to scrub the dead reference.


3. **Allocation:** Spawn the native network listener and apply file protection attributes via `fs.chmodSync()` matching the specified options.

### 4.2 Graceful Process Teardown

To minimize orphaned operating system handles, both the Server and Client modules must capture active termination vectors. Register internal event bindings onto:

* `process.on('SIGINT')`
* `process.on('SIGTERM')`
* `process.on('exit')`

Upon receipt of any of these lifecycle hooks, the server instance MUST execute its standard cleanup routing, unlinking the `.sock` path completely from the platform file tree before final context termination.

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

* Code the framing formatter that builds out the multi-segment byte packets (`4 bytes length + 1 byte type + 16 bytes tracking + body`).
* Code the consumer stream accumulator. This class must expose an `append(chunk: Uint8Array)` method that continually processes incoming fragments, checking lengths and pulling out full, discrete byte packages.

### Phase 2: Network Adapters Core

* Implement the core `BunTransportAdapter` utilizing `Bun.listen` and `Bun.connect`.
* Ensure that raw network data events feed directly into the Phase 1 processing accumulator.

### Phase 3: Public Server Core Construction

* Create the `Server` and `RemotePeer` classes.
* Implement the filesystem checking algorithm to identify and clean up crashed remnants.
* Integrate internal lifecycle hooks (`SIGINT` / `SIGTERM`) to trigger structural file deletion.

### Phase 4: Public Client Core Construction

* Create the `Client` class.
* Implement the `request` method: generate a 16-character correlation ID, append a deferred promise object to an internal tracking map, and emit the packet. When a packet containing type `0x03` or `0x04` arrives with that same identifier, look it up in the tracking map and resolve/reject the parent promise immediately.
* Code the exponential backoff reconnection routine to retry connections if the socket disappears unexpectedly.

### Phase 5: Validation Suite & Stress Simulation

* Build out a test layout involving massive asynchronous JSON loops to verify that correlation IDs are cleanly routed without data overlap.
* Rig up a stress injector that manually splits frame payloads into tiny 2-byte network chunks to guarantee the structural stream accumulator handles high-fragmentation edge cases without breaking.