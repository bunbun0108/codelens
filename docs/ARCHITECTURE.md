# Architecture: CodeLens AI M1

## Overview

CodeLens AI is a single-page, server-rendered Next.js application that allows users to explore any public GitHub repository's file tree and view source files, pinned to an immutable commit SHA. It fetches all data from the GitHub REST API — no cloning, no git binary, no disk writes.

## Layers

Dependencies point **downward only**:

```
┌──────────────────────────────────────────────────┐
│  app/              Pages & thin route handlers   │
│  (parse input → call service → map errors)       │
├──────────────────────────────────────────────────┤
│  server/ingestion/ Orchestration                 │
│  (ingestRepository, getFileContent, single-flight│
├──────────────────────────────────────────────────┤
│  server/github/    GitHubClient interface + impl │
│  server/store/     SnapshotStore, BlobCache ifaces│
├──────────────────────────────────────────────────┤
│  shared/           Pure, I/O-free code           │
│  (types, schemas, URL parser, filter engine,     │
│   tree builder, snapshot ID, language detection) │
└──────────────────────────────────────────────────┘
```

## Interface Abstractions

All infrastructure is hidden behind four first-class interfaces. No caller outside `server/container.ts` may import an implementation directly.

### `GitHubClient`
All GitHub API access. The Octokit adapter is the only consumer of `@octokit/core`. Swapping to a different HTTP client or caching proxy requires only a new implementation wired in `container.ts`.

### `SnapshotStore`
`get(id)`, `put(snapshot)`, `has(id)`. M1 implementation: in-memory LRU, max 50 snapshots, 24-hour TTL. Contract tests in `tests/unit/store-contracts.test.ts` verify any implementation.

### `BlobCache`
`get(blobSha)`, `set(blobSha, bytes)`. M1 implementation: in-memory byte-capped LRU (default 100 MB). Contract tests verify any implementation.

### `ContentProvider`
`getFileContent(snapshot, path)`. M1 implementation: looks up the blob SHA from the snapshot manifest, checks `BlobCache`, fetches via `GitHubClient` on miss, returns UTF-8 content.

## Composition Root

`server/container.ts` is the **only** file that:
- Imports `@octokit/core`
- Instantiates `Map`/LRU caches directly
- Wires implementations to interfaces

To swap to Postgres/pgvector later: write `PostgresSnapshotStore` and `PgBlobCache`, update only `container.ts`.

## Ingestion Flow

```
POST /api/ingest { url }
       │
       ▼
  Parse URL (shared/github-url.ts) ──► INVALID_URL / UNSUPPORTED_URL_FORM
       │
       ▼
  Normalize subpath (shared/subpath.ts)
       │
       ▼
  Single-flight dedup (by candidate snapshot ID)
       │
       ▼
  GET /repos/{o}/{r}     ──────────────► REPO_NOT_FOUND / REPO_UNAVAILABLE
       │ canonical name, default branch
       ▼
  Resolve ref → commit SHA             ► REF_NOT_FOUND
  (slash-ref: try longest-prefix first, max 8 attempts)
       │
       ▼
  Compute snapshot ID (sha256 of owner/repo@sha:subpath:filterVersion)
       │
       ▼
  SnapshotStore.has(id)?  ──── yes ───► return cached snapshot
       │ no
       ▼
  Resolve subpath → subtree SHA        ► SUBPATH_NOT_FOUND / SUBPATH_NOT_DIRECTORY
       │
       ▼
  GET /git/trees/{sha}?recursive=1
       │ truncated?
       ├── no ──► filter (shared/filter-engine.ts)
       └── yes ─► BFS fallback (concurrency 6, max 300 requests)
                  ► REPO_TOO_LARGE (with subpath hint) if cap exceeded
       │
       ▼
  Build snapshot, SnapshotStore.put(snapshot)
       │
       ▼
  Return Snapshot
```

## Content Fetching (Lazy)

File contents are **never** fetched during ingestion. The snapshot stores only the flat file manifest (path + blobSha + metadata).

```
GET /api/snapshots/:id/file?path=...
       │
       ▼
  SnapshotStore.get(id)     ──► SNAPSHOT_NOT_FOUND (client re-ingests)
       │
       ▼
  Lookup path in manifest   ──► FILE_NOT_FOUND (404)
       │
       ▼
  BlobCache.get(blobSha)    ──── hit ──► return content
       │ miss
       ▼
  GitHubClient.getBlob(blobSha) ──► validate UTF-8, check NUL bytes
       │
       ▼
  BlobCache.set(blobSha, bytes)
       │
       ▼
  Return FileContent (Cache-Control: immutable, 1 year)
```

## Security

- **SSRF prevention**: user URL is only parsed. All network calls target `api.github.com` only.
- **Token isolation**: `GITHUB_TOKEN` is read only in `server/config/env.ts`. It is never sent to the client, never included in logs, and excluded from client bundles by Next.js server/client boundary.
- **Path safety**: paths are lookup keys against the snapshot manifest only. They never touch the filesystem.
- **Rate limiting**: per-IP rate limiting (ingest: 10/min, file: separate limit). IP derived from socket unless `TRUST_PROXY=true`.
- **Content safety**: all file content rendered as plain text. No `dangerouslySetInnerHTML` except for Shiki output from escaped input.

## Single-Instance Constraint

> ⚠️ **Critical**: The memory stores (`SnapshotStore`, `BlobCache`) and the rate limiter are per-process. You must run exactly **one container instance** in M1.
>
> Running multiple instances will cause:
> - Cache misses (snapshot not found on instance B that was stored on instance A)
> - Inconsistent rate limiting
> - Unpredictable behavior
>
> To scale horizontally, implement `RedisSnapshotStore`, `RedisBlobCache`, and a distributed rate limiter, then wire them in `container.ts`.

## TRUST_PROXY Configuration

When `TRUST_PROXY=false` (default), the rate limiter uses the TCP socket address as the client IP. This is safe when the container is directly internet-facing.

When `TRUST_PROXY=true`, the rate limiter uses the `X-Forwarded-For` header's leftmost IP. Enable this **only** when running behind a reverse proxy you control (e.g., nginx, Cloudflare) that correctly sets and sanitizes `X-Forwarded-For`. Enabling this incorrectly allows IP spoofing and rate-limit bypass.

## Data Flow Guarantees

- **Snapshots are immutable**: once created, a snapshot's content never changes. Its ID is a deterministic hash of `owner/repo@commitSha:subpath:filterConfigVersion`.
- **Ingestion is idempotent**: ingesting the same URL twice returns the same snapshot ID.
- **Blobs are immutable by SHA**: a blob SHA uniquely identifies content. Blob cache entries never expire (only evicted by byte cap).
- **No silent partial trees**: if a tree is truncated and the BFS fallback hits the 300-request cap, the request fails with `REPO_TOO_LARGE` rather than returning a partial result.
