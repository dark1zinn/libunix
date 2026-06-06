# libunix

Unix domain socket (UDS) IPC for [Bun](https://bun.com) and **Node.js 20+**: framed messages, `Server` / `Client`, correlation-based request/response, and lifecycle helpers. **Linux and macOS only**.

## Install

```bash
bun add libunix
# or
npm install libunix
```

## Usage

Typed event maps mirror the integration tests: define the events your app exchanges, then wire handlers on each connected `RemotePeer`.

```ts
import { Client, Server } from 'libunix';

type EchoEvents = {
    echo: { msg: string };
    [key: string]: unknown;
};

const server = await Server.create<EchoEvents>({ id: 'my-app', adapter: 'bun' });

const ready = Promise.withResolvers<void>();
server.on('connection', (peer) => {
    peer.onRequest('echo', (data) => ({ echo: data.msg }));
    ready.resolve();
});

const client = await Client.connect<EchoEvents>({ id: 'my-app', adapter: 'bun' });
await ready.promise;

const result = await client.request('echo', { msg: 'hello' });
// { echo: 'hello' }

await client.disconnect();
await server.close();
```

### Socket `id`

- **Logical id** (e.g. `'my-app'`): resolved to `$TMPDIR/my-app.sock` (letters, digits, `.`, `_`, `-` only).
- **Filesystem path**: pass a path containing `/` or ending in `.sock` (e.g. `/run/myapp.sock`).

On **Bun**, omit `adapter` (defaults to `Bun.listen` / `Bun.connect`). On **Node**, omit `adapter` (auto-detects `node:net`) or pass `adapter: 'node'` explicitly.

### Node.js 20+

Same API; use the `node:net` transport (no extra dependencies):

```ts
import { Client, Server } from 'libunix';

const server = await Server.create({ id: 'my-app', adapter: 'node' });
// ... same handler wiring as above

const client = await Client.connect({ id: 'my-app', adapter: 'node' });
```

Verify on Node after build: `bun run test:node`.

### One-way events (emit)

```ts
type LoopEvents = {
    ping: null;
    tick: { n: number };
    [key: string]: unknown;
};

const server = await Server.create<LoopEvents>({ id: 'my-app', adapter: 'bun' });
const ready = Promise.withResolvers<void>();
server.on('connection', (peer) => {
    peer.onRequest('ping', () => 'pong');
    peer.on('tick', () => {});
    ready.resolve();
});

const client = await Client.connect<LoopEvents>({ id: 'my-app', adapter: 'bun' });
await ready.promise;

await client.emit('tick', { n: 0 });
const pong = await client.request('ping', null);

await client.disconnect();
await server.close();
```

### Errors

```ts
import { LibunixError, isLibunixError } from 'libunix';

try {
    await Server.create({ id: socketPath, adapter: 'bun' });
} catch (err) {
    if (isLibunixError(err) && err.code === 'EADDRINUSE') {
        // socket already in use
    }
}
```

## Development

```bash
bun install
bun test
bun run build   # tsdown → dist/
```

Benchmarks (hyperfine, requires Nix dev shell): `bun run bench`. Tracked baselines live in [docs/benchmarks/](docs/benchmarks/).

Publish tarball is built with [tsdown](https://tsdown.dev/guide/getting-started); `prepublishOnly` runs format check, tests, and build.

## License

[MIT](./LICENSE)
