# Development Decisions

This file records every non-obvious decision made during development of CodeLens AI M1.

---

## D-001: Interface-first persistence design

**Decision:** Define `GitHubClient`, `SnapshotStore`, `BlobCache`, and `ContentProvider` as TypeScript interfaces with in-memory implementations, wired only in `server/container.ts`.

**Rationale:** The spec explicitly requires "no database implementation, not no persistence design." This allows M2+ to introduce Postgres/Redis by writing new implementations and changing only `container.ts`.

**Trade-off:** Slightly more boilerplate than direct implementation. Worth it for future-safety.

---

## D-002: Lazy content fetching

**Decision:** File contents are not fetched during ingestion. The snapshot stores only the flat manifest (path + blobSha + size + language). Content is fetched on click via `GET /api/snapshots/:id/file`.

**Rationale:** Most users browse only a fraction of files. Fetching all blobs eagerly would be slow, wasteful of memory, and hit rate limits unnecessarily. BlobSHAs are immutable, so responses are cached with `Cache-Control: immutable, max-age=31536000`.

---

## D-003: Snapshot ID derivation

**Decision:** `sha256(lower(owner)/lower(repo)@commitSha:subpath:filterConfigVersion)`, hex-encoded, first 16 chars.

**Rationale:** Deterministic and collision-resistant at this scale. Inputs capture all factors that affect snapshot content. 16 hex chars = 64 bits of entropy, sufficient for a memory store with max 50 entries.

**Trade-off:** Not human-readable, but snapshot IDs are internal (exposed in API only).

---

## D-004: Slash-containing refs handled by longest-prefix disambiguation

**Decision:** For `/tree/feature/login/src`, try longest prefix first (up to 8 attempts) against the commits endpoint. 404/422 = "not this ref". Still ambiguous → `REF_NOT_FOUND` listing what was tried.

**Rationale:** Git allows branch names with slashes. The GitHub API has no endpoint that unambiguously separates ref from path. Longest-prefix-first maximizes the chance of finding the correct ref (more specific refs are less likely to be prefixes of paths).

**Trade-off:** Up to 8 extra API calls in the worst case. Documented edge case.

---

## D-005: Short SHAs rejected

**Decision:** A ref that looks like a short SHA (< 40 hex chars) is rejected with `REF_NOT_FOUND` and a hint to use the full SHA.

**Rationale:** Short SHAs are ambiguous and can collide. The spec explicitly requires this behavior.

---

## D-006: Truncated tree BFS fallback

**Decision:** If `GET /git/trees/{sha}?recursive=1` returns `truncated: true`, fall back to non-recursive BFS with pruned ignored directories. Concurrency 6, hard cap 300 tree requests. Exceeded → `REPO_TOO_LARGE`. Never return partial results silently.

**Rationale:** Silent partial trees violate user trust. The spec mandates this behavior. The cap prevents runaway API consumption on very large repos.

---

## D-007: Subpath paths stay repo-root-relative

**Decision:** Even when ingesting a subpath, all `FileEntry.path` values are relative to the **repo root**, not the subpath root.

**Rationale:** Paths are the canonical identity for future citation and cross-reference features. Repo-root-relative paths are stable regardless of what subpath was used for ingestion.

---

## D-008: Filter engine is generic with versioned config

**Decision:** `shared/filter-engine.ts` is a pure function that takes `(entry, config)`. The default config lives in `shared/config/filter.default.ts` with a `version` string. Any config change bumps the version, changing all snapshot IDs.

**Rationale:** Makes filtering testable in isolation. Version bumping invalidates cached snapshots when rules change, ensuring fresh results.

---

## D-009: `TRUST_PROXY` defaults to false

**Decision:** Rate-limiting IP defaults to socket address. `TRUST_PROXY=true` enables `X-Forwarded-For` usage.

**Rationale:** Trusting proxy headers when not behind a proxy enables IP spoofing. Safe default is to not trust them. Users must explicitly opt in when deploying behind a reverse proxy.

---

## D-010: SVG excluded as binary/media

**Decision:** `.svg` files are excluded with reason `binary_extension`.

**Rationale:** The spec explicitly excludes SVG (§9 and §0 locked decisions). SVG can contain JavaScript and is a CSP risk to render.

---

## D-011: Markdown rendered as highlighted raw text only

**Decision:** Markdown files are displayed as syntax-highlighted raw text, not rendered HTML.

**Rationale:** Rendering Markdown as HTML requires sanitization (DOMPurify, etc.) and adds complexity. The spec says "highlighted raw text only; no HTML rendering" (§12).

---

## D-012: Single-flight dedup by candidate snapshot ID

**Decision:** Before any GitHub API calls, compute the candidate snapshot ID (requires only the parsed URL + resolved ref). Use this ID as the key for single-flight dedup.

**Rationale:** Concurrent requests for the same repo/ref/subpath should share one upstream run, not multiply API calls. The candidate ID is computed client-side before the first API call by combining `owner/repo` (normalized) + raw ref + subpath. If the ref resolves to the same commit, they'll produce the same final snapshot ID.

---

## D-013: `GITHUB_TOKEN` required in production, optional in dev

**Decision:** `server/config/env.ts` fails fast at boot if `NODE_ENV=production` and `GITHUB_TOKEN` is absent. In dev, a startup warning is logged.

**Rationale:** Unauthenticated GitHub API allows only 60 req/hr — barely enough for a single ingest. Production without a token is effectively broken. Fail-fast surfaces this immediately.

---

## D-014: pino for structured logging

**Decision:** Use pino with a request ID on every log entry. Never log file contents, tokens, or raw user data.

**Rationale:** Structured logs are machine-parseable for aggregation. Request ID enables correlation across log entries for a single request.

---

## D-015: `@octokit/core` + retry plugin, no REST.js

**Decision:** Use `@octokit/core` with `@octokit/plugin-retry` rather than `@octokit/rest`.

**Rationale:** `@octokit/core` is smaller and gives full control over request construction. The retry plugin handles network errors and 5xx with exponential backoff. We implement 4xx handling ourselves to comply with spec rules (never retry 4xx).

---

## D-016: Docker non-root user

**Decision:** The runtime stage creates and uses a dedicated `nodejs` user (UID 1001).

**Rationale:** Running as root in a container is a security anti-pattern. The spec requires non-root.

---

## D-017: `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`

**Decision:** Both enabled in tsconfig.

**Rationale:** These catch common bugs: array indexing without `undefined` check, and using `key: undefined` in optional-property objects. The spec requires both.

---

## D-018: Fake GitHubClient for deterministic E2E

**Decision:** Introduce `FakeGitHubClient`, wired via `CODELENS_FAKE_GITHUB=1` and strictly refused in production.

**Rationale:** E2E testing against the live GitHub API is slow, rate-limited, and non-deterministic due to network. `FakeGitHubClient` provides a hardcoded, in-memory repository fixture (`fake-owner/fake-repo`). This enables instant, 100% deterministic E2E runs in CI without requiring the `GITHUB_TOKEN` secret.

---

## D-019: Landing page palette exception

**Decision:** The landing page uses two colours outside the global 5-colour palette:

| Token | Value | Scope | Reason |
|---|---|---|---|
| Landing page background | `#030504` (near-black) | Landing page only | `#241D01` (Pitch Black) reads as yellow-brown on screen; `#030504` provides the neutral dark backdrop needed for the neon matrix effect. |
| Matrix character colour | `#39FF14` (neon hacker green) | `MatrixBackground` component only | Achieves the visual "cyber matrix" effect the design calls for. `#3A745D` (Deep Teal) at 35% is invisible against a very dark bg at the required idle opacity. |

All other UI elements on the landing page (panel, input, text, links, title) use the canonical 5-colour palette: Space Indigo (`#393A4F`), Deep Teal (`#3A745D`), Icy Aqua (`#AFFDF0`), Light Green (`#BEEF8D`), Pitch Black (`#241D01`).

Explorer pages are unaffected; their background remains Pitch Black `#241D01`.

**Rationale:** Design review (step 1 revision) explicitly approved these deviations and directed they be recorded here.

---

## D-020: dev-only unsafe-eval in CSP

**Decision:** `Content-Security-Policy: script-src` includes `'unsafe-eval'` in `NODE_ENV=development` only. Production never includes it.

**Rationale:** React DevTools require `eval()` in development for stack-trace reconstruction. Next.js dev overlay also relies on it. Blocking it produces console errors that mislead developers into thinking the production build is broken.

**Guard:** `next.config.ts` branches on `process.env.NODE_ENV === "development"`. A unit test in `tests/unit/csp.test.ts` asserts that the production CSP string never contains `unsafe-eval`, failing CI if the logic is accidentally removed.
