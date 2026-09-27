# Module 23 — Low-Connectivity Offline Sync & Preloading

## Purpose

This implementation covers **Part 1 of Module 23**: a backend-first low-connectivity engine for field devices. It provides a strictly ordered, one-packet-at-a-time offline action queue plus a chunkable, read-only preload bundle.

## Scope / non-scope

Implemented:
- Device-scoped `SyncSession` records that can be resumed after dropped connections.
- Strict sequence enforcement: only `lastAppliedSequence + 1` is accepted.
- Idempotent packet submission through a per-user idempotency key.
- Failed packets consume their sequence slot and can be retried as a new packet.
- Pluggable `PacketHandlerRegistry` with `SYSTEM/PING` and `DIAGNOSTICS/CLIENT_LOG` built-ins.
- Profile/reference/market preload sections with version hashing and network-profile TTLs.

Not implemented:
- Multilingual functionality.
- Voice functionality.
- Offline handlers for other modules' business mutations. Owning modules must explicitly register their own handlers later.

## Data model

`SyncSession` stores the device, owner, status, network profile and last consumed sequence. `SyncPacket` stores one queued action, its payload, status, attempts, result/error details and client creation timestamp.

The database enforces `@@unique([sessionId, sequence])` and `@@unique([userId, idempotencyKey])`. The repository translates Prisma `P2002` sequence races into the service's ordering error.

## Sequential forwarding contract

A client starts a session for a stable `deviceId`, then sends packets starting at sequence `1`. The server accepts exactly the next expected sequence. Out-of-order packets return `SYNC_PACKET_OUT_OF_ORDER` (409). A duplicate idempotency key returns the previously stored packet without invoking its handler again.

A packet is marked `PROCESSING` before its handler runs. Handler success produces `APPLIED`; handler failure produces `FAILED`, records `SYNC_PACKET_FAILED`, and still advances the session cursor. A failed packet must therefore be explicitly retried with a fresh sequence and idempotency key.

## API

- `POST /api/sync/sessions`
- `GET /api/sync/sessions`
- `GET /api/sync/sessions/:publicId`
- `POST /api/sync/sessions/:publicId/packets`
- `POST /api/sync/sessions/:publicId/packets/:packetId/retry`
- `POST /api/sync/sessions/:publicId/complete`
- `POST /api/sync/sessions/:publicId/abandon`
- `GET /api/preload/bundle`

All endpoints require authentication.

## Preload bundle

The bundle is read-only and consumes existing domain tables only. Its independently fetchable sections are:

- `profile` — authenticated user and farmer profile when applicable.
- `reference` — active crops and states.
- `market` — the latest bounded snapshot of up to 50 mandi prices.

District/taluka data is intentionally not duplicated because the existing reference-data endpoint already owns that data.

`bundleVersion` is a SHA-1 hash of the assembled sections. Supplying the same `knownVersion` returns HTTP `204`. `ttlMinutes` is longer for `OFFLINE`/`POOR_2G` clients and shorter for better connectivity profiles.

## Packet handler extension point

Future modules can register a handler through `createLowConnectivityModule({ handlers: [...] })`, for example a `QUALITY/SUBMIT_ASSESSMENT` handler. The handler receives the authenticated session owner and the packet payload and returns a small JSON-serializable result summary.

No other module's write actions are registered in this implementation. Real offline mutations such as creating a lot or submitting a quality assessment remain unavailable through this queue until the owning module explicitly supplies a handler.

## Status honesty

Module 23 is **partial**: low-connectivity offline sync and preloading are implemented, while multilingual and voice remain planned. The backend is designed so additional offline business actions can be added without modifying the core queue engine.
