# WatchPair MVP Design

## 1. Goal

WatchPair is a private Microsoft Edge extension for two people to watch the same Bilibili video remotely. Each person opens the video on their own computer. The extension synchronizes playback controls through a small WebSocket relay; it never relays or stores video content.

The MVP targets Windows desktop Microsoft Edge. Both viewers install the unpacked extension through `edge://extensions` and enable Developer mode.

## 2. Scope

### Included

- Bilibili standard video pages only.
- Two participants per room.
- Six-character room codes.
- Create and join room flows without accounts.
- Play, pause, seek, and playback-rate synchronization.
- Connection, peer presence, buffering, and synchronization status.
- Automatic reconnection and state recovery.
- Node.js WebSocket relay deployable to a Render free web service.
- In-memory room state with automatic cleanup.

### Excluded

- Voice, text chat, and danmaku synchronization.
- Mobile browsers and browsers other than Edge as tested targets.
- Video sites other than Bilibili.
- Accounts, friend lists, and room history.
- Video forwarding, downloading, advertisement handling, or membership bypasses.
- Browser store publishing.

## 3. Architecture

The repository is a TypeScript monorepo:

```text
WatchPair/
├─ apps/
│  ├─ extension/     Edge Manifest V3 extension
│  └─ server/        Node.js WebSocket relay
├─ packages/
│  └─ protocol/      Shared message types and runtime validation
├─ docs/
├─ package.json
└─ README.md
```

The extension contains four isolated responsibilities:

1. The popup manages room creation, room joining, configuration, and status display.
2. The content script detects the active Bilibili video element, observes local media events, and applies remote media commands.
3. The service worker owns connection lifecycle and routes messages between the popup, content script, and server.
4. The Bilibili adapter identifies the current BV number, part number, duration, and active video element despite single-page navigation.

The server validates protocol messages, limits each room to two members, orders accepted operations, broadcasts state, and removes inactive rooms. It does not receive Bilibili cookies, account data, page content, or video media.

## 4. Room and Identity Model

- A room code contains six unambiguous uppercase letters or digits.
- A random local participant ID is generated once and stored in extension local storage.
- A room accepts no more than two simultaneously connected participant IDs.
- Both participants may control playback.
- The server assigns a monotonically increasing room revision to each accepted operation. The latest revision is authoritative.
- When both participants disconnect, the room remains recoverable for 10 minutes and is then deleted.

## 5. Synchronization Protocol

An operation contains the room code, participant ID, video identity, media state, client timestamp, client operation ID, and server-assigned revision. Video identity consists of BV number, part number, and rounded duration.

Local `play`, `pause`, `seeked`, and `ratechange` events produce operations. Applying a remote operation sets a short-lived remote-application guard so resulting DOM events are not rebroadcast.

The extension also publishes a state snapshot every five seconds while connected. Synchronization uses the server timestamp and measured round-trip latency to estimate the authoritative target time.

Drift handling:

- Below 300 ms: no correction.
- From 300 ms through 1.5 s: temporarily adjust playback speed within 0.92x to 1.08x, then restore the room rate.
- Above 1.5 s: seek directly to the target position.

If the BV number, part number, or duration does not match, media commands are withheld and both users see a same-video warning.

Buffering does not pause the peer in the MVP. The buffering state is shown to the peer, and playback is recalibrated when buffering ends.

## 6. Connection and Error Handling

- The client reconnects with capped exponential backoff and jitter.
- After reconnecting, the client requests the current authoritative room snapshot before sending new media operations.
- Render cold starts are shown as `Starting server…`; the UI distinguishes this from a permanent connection failure.
- Invalid messages are rejected without changing room state.
- A missing room, full room, mismatched video, missing video element, disconnected peer, and server error each have a distinct user-facing message.
- Bilibili single-page navigation triggers video identity and element rediscovery without requiring an extension reload.

## 7. Security and Privacy

- Manifest V3 permissions are limited to extension storage and Bilibili page access required by the feature.
- The production WebSocket endpoint uses `wss://`.
- All inbound messages receive runtime schema validation and size limits.
- Room codes are not treated as strong authentication secrets. The server rate-limits room joins by network source, temporarily blocks repeated failures, and never reveals whether a guessed code recently existed.
- No video content, Bilibili cookies, account identifiers, browsing history, or room history is collected.
- The server keeps only active room state in memory and does not use a database.

## 8. Engineering Standards

- TypeScript strict mode across all packages.
- npm workspaces for monorepo dependency management.
- ESLint and Prettier for static quality and formatting.
- Vitest for unit and integration tests.
- Shared protocol definitions prevent client/server message drift.
- Conventional, focused Git commits.
- No remotely hosted executable extension code.

## 9. Testing

### Automated

- Unit tests cover room-code generation, schema validation, room state reduction, drift calculation, ordering, duplicate operations, and reconnection backoff.
- Server integration tests cover room creation and joining, third-member rejection, broadcast behavior, disconnects, expiry, and malformed messages.
- Extension tests use a simulated HTML media element to cover local event emission, remote application, feedback-loop prevention, and Bilibili identity parsing.
- CI-equivalent local checks run tests, TypeScript type checking, linting, and production builds.

### Manual Acceptance

1. Two Windows Edge instances load the unpacked extension and open the same Bilibili video.
2. Viewer A creates a room and Viewer B joins with the six-character room code.
3. Play, pause, seek, and rate changes from either viewer are reflected by the other.
4. During 10 minutes of continuous playback, normal drift remains below one second.
5. Page refresh, part changes, and temporary network loss produce clear status and recover automatically where possible.
6. Different videos never receive media commands.
7. A sleeping Render service is represented as starting rather than as an immediate fatal error.
8. Tests, type checking, linting, and builds pass.
9. The README documents local development, Render deployment, unpacked Edge installation, and two-person usage.

## 10. Deliverables

- Complete extension, server, and shared-protocol source.
- A production extension build loadable as an unpacked Edge extension.
- Render deployment configuration for the server.
- Setup and usage documentation.
- Automated tests and recorded verification commands.
