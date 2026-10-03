import { describe, it, expect } from "vitest";
import { parseGitHubUrl } from "../../src/shared/github-url";

// ---------------------------------------------------------------------------
// Table-driven test cases
// ---------------------------------------------------------------------------
interface Case {
  input: string;
  expected?:
    | { owner: string; repo: string; treeSegments: string[] }
    | "INVALID_URL"
    | "UNSUPPORTED_URL_FORM";
}

const CASES: Case[] = [
  // ── Basic valid URLs ──────────────────────────────────────────────────────
  {
    input: "https://github.com/vercel/next.js",
    expected: { owner: "vercel", repo: "next.js", treeSegments: [] },
  },
  {
    input: "https://github.com/torvalds/linux",
    expected: { owner: "torvalds", repo: "linux", treeSegments: [] },
  },
  {
    input: "https://github.com/owner/repo",
    expected: { owner: "owner", repo: "repo", treeSegments: [] },
  },
  // ── Trailing slash ────────────────────────────────────────────────────────
  {
    input: "https://github.com/owner/repo/",
    expected: { owner: "owner", repo: "repo", treeSegments: [] },
  },
  // ── .git suffix ──────────────────────────────────────────────────────────
  {
    input: "https://github.com/owner/repo.git",
    expected: { owner: "owner", repo: "repo", treeSegments: [] },
  },
  {
    input: "https://github.com/owner/repo.git/",
    expected: { owner: "owner", repo: "repo", treeSegments: [] },
  },
  // ── Query strings and fragments are ignored ───────────────────────────────
  {
    input: "https://github.com/owner/repo?tab=readme",
    expected: { owner: "owner", repo: "repo", treeSegments: [] },
  },
  {
    input: "https://github.com/owner/repo#readme",
    expected: { owner: "owner", repo: "repo", treeSegments: [] },
  },
  // ── HTTP → HTTPS normalization ────────────────────────────────────────────
  {
    input: "http://github.com/owner/repo",
    expected: { owner: "owner", repo: "repo", treeSegments: [] },
  },
  // ── Scheme-less (github.com/…) ────────────────────────────────────────────
  {
    input: "github.com/owner/repo",
    expected: { owner: "owner", repo: "repo", treeSegments: [] },
  },
  {
    input: "www.github.com/owner/repo",
    expected: { owner: "owner", repo: "repo", treeSegments: [] },
  },
  // ── /tree/ URLs with simple branch ───────────────────────────────────────
  {
    input: "https://github.com/owner/repo/tree/main",
    expected: { owner: "owner", repo: "repo", treeSegments: ["main"] },
  },
  {
    input: "https://github.com/owner/repo/tree/develop",
    expected: { owner: "owner", repo: "repo", treeSegments: ["develop"] },
  },
  // ── /tree/ with subpath ───────────────────────────────────────────────────
  {
    input: "https://github.com/owner/repo/tree/main/src",
    expected: {
      owner: "owner",
      repo: "repo",
      treeSegments: ["main", "src"],
    },
  },
  {
    input: "https://github.com/owner/repo/tree/main/src/server/ingestion",
    expected: {
      owner: "owner",
      repo: "repo",
      treeSegments: ["main", "src", "server", "ingestion"],
    },
  },
  // ── Slash-containing branch names (segments preserved verbatim) ───────────
  {
    input: "https://github.com/owner/repo/tree/feat/my-feature",
    expected: {
      owner: "owner",
      repo: "repo",
      treeSegments: ["feat", "my-feature"],
    },
  },
  {
    input: "https://github.com/owner/repo/tree/release/v1.2.3/docs",
    expected: {
      owner: "owner",
      repo: "repo",
      treeSegments: ["release", "v1.2.3", "docs"],
    },
  },
  // ── Full SHA as ref ───────────────────────────────────────────────────────
  {
    input:
      "https://github.com/owner/repo/tree/a".padEnd(
        "https://github.com/owner/repo/tree/".length + 40,
        "b",
      ),
    expected: {
      owner: "owner",
      repo: "repo",
      treeSegments: ["a" + "b".repeat(39)],
    },
  },
  // ── Special valid chars in repo name ─────────────────────────────────────
  {
    input: "https://github.com/owner/my-repo_v2.0",
    expected: { owner: "owner", repo: "my-repo_v2.0", treeSegments: [] },
  },
  {
    input: "https://github.com/owner/123repo",
    expected: { owner: "owner", repo: "123repo", treeSegments: [] },
  },
  // ── Mixed case owner/repo (GitHub is case-insensitive but we preserve case) ──
  {
    input: "https://github.com/OWNER/REPO",
    expected: { owner: "OWNER", repo: "REPO", treeSegments: [] },
  },

  // ── INVALID_URL cases ─────────────────────────────────────────────────────
  { input: "", expected: "INVALID_URL" },
  { input: "   ", expected: "INVALID_URL" },
  { input: "https://gitlab.com/owner/repo", expected: "INVALID_URL" },
  { input: "https://bitbucket.org/owner/repo", expected: "INVALID_URL" },
  { input: "not-a-url", expected: "INVALID_URL" },
  // Owner with leading hyphen
  {
    input: "https://github.com/-owner/repo",
    expected: "INVALID_URL",
  },
  // Owner with trailing hyphen
  {
    input: "https://github.com/owner-/repo",
    expected: "INVALID_URL",
  },
  // Owner with consecutive hyphens
  {
    input: "https://github.com/ow--ner/repo",
    expected: "INVALID_URL",
  },
  // Owner too long (40+ chars)
  {
    input: `https://github.com/${"a".repeat(40)}/repo`,
    expected: "INVALID_URL",
  },
  // '.'/'..' as repo names: new URL() normalizes them away, so we get UNSUPPORTED_URL_FORM
  // ("owner/." → "/owner/" → only 1 segment; "owner/.." → "/" → 0 segments)
  {
    input: "https://github.com/owner/.",
    expected: "UNSUPPORTED_URL_FORM",
  },
  {
    input: "https://github.com/owner/..",
    expected: "UNSUPPORTED_URL_FORM",
  },
  // URL exceeds 2048 chars (30 + 2020 = 2050 > 2048)
  {
    input: "https://github.com/owner/repo/" + "a".repeat(2020),
    expected: "INVALID_URL",
  },
  // Control character in URL
  {
    input: "https://github.com/owner/repo\x00",
    expected: "INVALID_URL",
  },
  // ftp scheme
  {
    input: "ftp://github.com/owner/repo",
    expected: "INVALID_URL",
  },

  // ── UNSUPPORTED_URL_FORM cases ────────────────────────────────────────────
  { input: "https://github.com/owner", expected: "UNSUPPORTED_URL_FORM" },
  { input: "https://github.com/", expected: "UNSUPPORTED_URL_FORM" },
  {
    input: "https://github.com/owner/repo/blob/main/README.md",
    expected: "UNSUPPORTED_URL_FORM",
  },
  {
    input: "https://github.com/owner/repo/pull/42",
    expected: "UNSUPPORTED_URL_FORM",
  },
  {
    input: "https://github.com/owner/repo/issues/1",
    expected: "UNSUPPORTED_URL_FORM",
  },
  {
    input: "https://github.com/owner/repo/commit/abc123",
    expected: "UNSUPPORTED_URL_FORM",
  },
  {
    input: "https://github.com/owner/repo/releases",
    expected: "UNSUPPORTED_URL_FORM",
  },
  {
    input: "https://github.com/owner/repo/actions",
    expected: "UNSUPPORTED_URL_FORM",
  },
  {
    input: "https://github.com/owner/repo/settings",
    expected: "UNSUPPORTED_URL_FORM",
  },
  {
    input: "https://github.com/owner/repo/wiki",
    expected: "UNSUPPORTED_URL_FORM",
  },
];

describe("parseGitHubUrl", () => {
  for (const tc of CASES) {
    const label = tc.input.length > 80 ? tc.input.slice(0, 77) + "..." : tc.input;

    if (typeof tc.expected === "object") {
      it(`parses: ${label}`, () => {
        const result = parseGitHubUrl(tc.input);
        expect(result.owner).toBe((tc.expected as any).owner);
        expect(result.repo).toBe((tc.expected as any).repo);
        expect(result.treeSegments).toEqual((tc.expected as any).treeSegments);
      });
    } else {
      it(`throws ${tc.expected}: ${label}`, () => {
        expect(() => parseGitHubUrl(tc.input)).toThrow();
        try {
          parseGitHubUrl(tc.input);
        } catch (e: any) {
          expect(e.code).toBe(tc.expected);
        }
      });
    }
  }
});
