# CodeLens AI

Explore any public GitHub repository's file tree and source files, pinned to a specific commit SHA — with syntax highlighting, without cloning.

[![CI](https://github.com/your-org/codelens/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/codelens/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Features

- **Instant ingestion** — paste any public GitHub repo URL and get a browsable file tree in seconds
- **Deep-linkable explorer** — share a URL that includes the exact commit SHA, subpath, and file
- **Subpath support** — paste a `/tree/{ref}/{path}` URL to scope the view to a directory
- **Syntax highlighting** — read-only Shiki-powered highlighting for 50+ languages
- **Commit-pinned** — every view is pinned to an immutable commit SHA, not a mutable branch
- **Privacy-safe** — source files are fetched lazily on click, never stored to disk

## Quick Start

### Prerequisites

- Node.js 22 LTS
- pnpm 12+
- A [GitHub fine-grained PAT](https://github.com/settings/tokens?type=beta) with **Public Repositories (read-only)** scope

### Development

```bash
# Clone and install
git clone https://github.com/your-org/codelens
cd codelens
pnpm install

# Configure
cp .env.example .env.local
# Edit .env.local and set GITHUB_TOKEN=your_token_here

# Run dev server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Production with Docker

> ⚠️ **Single-instance constraint:** This application uses in-memory stores (LRU snapshot cache, blob cache). You must run **exactly one container instance**. Running multiple instances will cause cache misses and inconsistent behavior. See `docs/ARCHITECTURE.md` for details.

```bash
# Build the image
docker build -t codelens:latest .

# Run (supply your token at runtime — never bake it into the image)
docker run -d \
  --name codelens \
  -p 3000:3000 \
  -e GITHUB_TOKEN=your_token_here \
  -e NODE_ENV=production \
  --restart unless-stopped \
  codelens:latest
```

Optional environment variables:

| Variable | Default | Description |
|---|---|---|
| `GITHUB_TOKEN` | — | **Required in production.** Fine-grained PAT, public repos read-only |
| `PORT` | `3000` | Server port |
| `LOG_LEVEL` | `info` | `trace\|debug\|info\|warn\|error\|fatal` |
| `TRUST_PROXY` | `false` | Set `true` only behind a trusted reverse proxy (enables `X-Forwarded-For` for rate limiting) |
| `SNAPSHOT_STORE_MAX` | `50` | Max snapshots in LRU memory store |
| `BLOB_CACHE_MAX_MB` | `100` | Max MB for in-memory blob cache |

The container exposes a health endpoint at `/api/health`.

## Architecture

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for a detailed description of the layered architecture, interface abstractions, and single-instance constraint.

## Development Decisions

See [`docs/DECISIONS.md`](docs/DECISIONS.md) for a record of every non-obvious decision made during development.

## Testing

```bash
pnpm test              # unit + integration (vitest)
pnpm test:e2e          # end-to-end (Playwright, GitHub mocked)
SMOKE=true pnpm test   # live smoke test against real prisma-examples (needs token)
```

## License

MIT — see [LICENSE](LICENSE).
