import { describe, it, expect } from "vitest";
import { filterEntry, type FilterConfig, type RawTreeEntry } from "../../src/shared/filter-engine";
import { DEFAULT_FILTER_CONFIG } from "../../src/shared/config/filter.default";

// Helper to create a raw tree entry
function blob(
  path: string,
  size = 1000,
  mode = "100644",
): RawTreeEntry {
  return {
    path,
    type: "blob",
    mode,
    sha: "a".repeat(40),
    size,
  };
}

describe("filterEntry — structural checks", () => {
  it("excludes git submodules (commit type)", () => {
    const entry: RawTreeEntry = {
      path: "vendor/lib",
      type: "commit",
      mode: "160000",
      sha: "a".repeat(40),
    };
    const r = filterEntry(entry, DEFAULT_FILTER_CONFIG);
    expect(r.included).toBe(false);
    if (!r.included) expect(r.reason).toBe("submodule");
  });

  it("excludes symlinks (mode 120000)", () => {
    const entry: RawTreeEntry = {
      path: "link",
      type: "blob",
      mode: "120000",
      sha: "a".repeat(40),
    };
    const r = filterEntry(entry, DEFAULT_FILTER_CONFIG);
    expect(r.included).toBe(false);
    if (!r.included) expect(r.reason).toBe("symlink");
  });

  it("excludes directories (tree type)", () => {
    const entry: RawTreeEntry = {
      path: "src",
      type: "tree",
      mode: "040000",
      sha: "a".repeat(40),
    };
    const r = filterEntry(entry, DEFAULT_FILTER_CONFIG);
    expect(r.included).toBe(false);
    if (!r.included) expect(r.reason).toBe("ignored_directory");
  });
});

describe("filterEntry — ignored directories", () => {
  it("excludes files inside node_modules", () => {
    const r = filterEntry(blob("node_modules/react/index.js"), DEFAULT_FILTER_CONFIG);
    expect(r.included).toBe(false);
    if (!r.included) expect(r.reason).toBe("ignored_directory");
  });

  it("excludes files inside .git", () => {
    const r = filterEntry(blob(".git/config"), DEFAULT_FILTER_CONFIG);
    expect(r.included).toBe(false);
    if (!r.included) expect(r.reason).toBe("ignored_directory");
  });

  it("excludes files inside __pycache__", () => {
    const r = filterEntry(blob("src/__pycache__/module.pyc"), DEFAULT_FILTER_CONFIG);
    expect(r.included).toBe(false);
    if (!r.included) expect(r.reason).toBe("ignored_directory");
  });

  it("includes files in non-ignored directories", () => {
    const r = filterEntry(blob("src/server/index.ts"), DEFAULT_FILTER_CONFIG);
    expect(r.included).toBe(true);
  });
});

describe("filterEntry — lockfiles", () => {
  const lockfiles = [
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "Gemfile.lock",
    "Pipfile.lock",
    "poetry.lock",
    "composer.lock",
    // Case-sensitive exact match as in DEFAULT_FILTER_CONFIG
    "Cargo.lock",
    "go.sum",
    "bun.lockb",
  ];
  for (const lf of lockfiles) {
    it(`excludes lockfile: ${lf}`, () => {
      const r = filterEntry(blob(lf), DEFAULT_FILTER_CONFIG);
      expect(r.included).toBe(false);
      if (!r.included) expect(r.reason).toBe("lockfile");
    });
  }
});

describe("filterEntry — secret risk", () => {
  it("excludes .env files", () => {
    const r = filterEntry(blob(".env"), DEFAULT_FILTER_CONFIG);
    expect(r.included).toBe(false);
    if (!r.included) expect(r.reason).toBe("secret_risk");
  });

  it("excludes .env.local", () => {
    const r = filterEntry(blob(".env.local"), DEFAULT_FILTER_CONFIG);
    expect(r.included).toBe(false);
    if (!r.included) expect(r.reason).toBe("secret_risk");
  });

  it("excludes *.pem files", () => {
    const r = filterEntry(blob("key.pem"), DEFAULT_FILTER_CONFIG);
    expect(r.included).toBe(false);
    if (!r.included) expect(r.reason).toBe("secret_risk");
  });
});

describe("filterEntry — binary extensions (SVG excluded)", () => {
  it("excludes .png", () => {
    const r = filterEntry(blob("logo.png"), DEFAULT_FILTER_CONFIG);
    expect(r.included).toBe(false);
    if (!r.included) expect(r.reason).toBe("binary_extension");
  });

  it("excludes .jpg", () => {
    const r = filterEntry(blob("photo.jpg"), DEFAULT_FILTER_CONFIG);
    expect(r.included).toBe(false);
    if (!r.included) expect(r.reason).toBe("binary_extension");
  });

  it("excludes .svg (per spec §0 — SVG excluded)", () => {
    const r = filterEntry(blob("icon.svg"), DEFAULT_FILTER_CONFIG);
    expect(r.included).toBe(false);
    if (!r.included) expect(r.reason).toBe("binary_extension");
  });

  it("excludes .pdf", () => {
    const r = filterEntry(blob("doc.pdf"), DEFAULT_FILTER_CONFIG);
    expect(r.included).toBe(false);
    if (!r.included) expect(r.reason).toBe("binary_extension");
  });
});

describe("filterEntry — not allowlisted", () => {
  it("excludes unknown extension", () => {
    const r = filterEntry(blob("file.xyz"), DEFAULT_FILTER_CONFIG);
    expect(r.included).toBe(false);
    if (!r.included) expect(r.reason).toBe("not_allowlisted");
  });

  it("excludes file with no extension and not in allowlist", () => {
    const r = filterEntry(blob("binaryfile"), DEFAULT_FILTER_CONFIG);
    expect(r.included).toBe(false);
  });
});

describe("filterEntry — too large", () => {
  it("excludes blobs exceeding max size", () => {
    const oversize = blob("big.ts", DEFAULT_FILTER_CONFIG.maxFileSizeBytes + 1);
    const r = filterEntry(oversize, DEFAULT_FILTER_CONFIG);
    expect(r.included).toBe(false);
    if (!r.included) expect(r.reason).toBe("too_large");
  });

  it("includes blobs at exactly the max size", () => {
    const atLimit = blob("ok.ts", DEFAULT_FILTER_CONFIG.maxFileSizeBytes);
    const r = filterEntry(atLimit, DEFAULT_FILTER_CONFIG);
    expect(r.included).toBe(true);
  });
});

describe("filterEntry — included files", () => {
  // .js is NOT in allowedExtensions per spec (only .mjs, .cjs)
  const sources = [
    "src/index.ts",
    "app/page.tsx",
    "src/index.mjs",
    "server/api.py",
    "main.go",
    "Makefile",
    "README.md",
    "src/styles.css",
    "config.yaml",
    "docker-compose.yml",
    "Dockerfile",
    "src/schema.graphql",
    ".github/workflows/ci.yml",
  ];
  for (const path of sources) {
    it(`includes: ${path}`, () => {
      const r = filterEntry(blob(path), DEFAULT_FILTER_CONFIG);
      expect(r.included).toBe(true);
    });
  }
});

describe("filterEntry — generated/minified", () => {
  // Patterns are "*.min", "*.min.css", "*.bundle" — no "*.min.js" pattern.
  // app.min.js → not allowlisted (.js not in allowedExtensions) but excluded before generated check
  it("excludes *.min (matches exactly the pattern)", () => {
    const r = filterEntry(blob("app.min"), DEFAULT_FILTER_CONFIG);
    expect(r.included).toBe(false);
    if (!r.included) expect(r.reason).toBe("generated_or_minified");
  });

  it("excludes *.min.css", () => {
    const r = filterEntry(blob("styles.min.css"), DEFAULT_FILTER_CONFIG);
    expect(r.included).toBe(false);
    if (!r.included) expect(r.reason).toBe("generated_or_minified");
  });

  it("excludes *.map files", () => {
    const r = filterEntry(blob("app.map"), DEFAULT_FILTER_CONFIG);
    expect(r.included).toBe(false);
    if (!r.included) expect(r.reason).toBe("generated_or_minified");
  });

  it("excludes .DS_Store", () => {
    const r = filterEntry(blob(".DS_Store"), DEFAULT_FILTER_CONFIG);
    expect(r.included).toBe(false);
    if (!r.included) expect(r.reason).toBe("generated_or_minified");
  });
});

describe("filterEntry — custom config", () => {
  const minimalConfig: FilterConfig = {
    version: "test",
    ignoredDirectories: ["vendor"],
    secretRiskPatterns: [],
    lockfiles: [],
    generatedOrMinifiedPatterns: [],
    binaryExtensions: [],
    allowedExtensions: [".ts"],
    allowedFilenames: [],
    maxFileSizeBytes: 500,
    maxIncludedFiles: 1000,
    maxIncludedBytes: 1000 * 1024,
  };

  it("applies custom maxFileSizeBytes", () => {
    expect(filterEntry(blob("ok.ts", 500), minimalConfig).included).toBe(true);
    expect(filterEntry(blob("big.ts", 501), minimalConfig).included).toBe(false);
  });

  it("applies custom ignoredDirectories", () => {
    const vendorResult = filterEntry(blob("vendor/lib.ts"), minimalConfig);
    expect(vendorResult.included).toBe(false);
    if (!vendorResult.included) expect(vendorResult.reason).toBe("ignored_directory");
    // A file directly in root (no directory prefix, within size limit 500) should pass
    const rootResult = filterEntry({ ...blob("lib.ts"), size: 100 }, minimalConfig);
    expect(rootResult.included).toBe(true);
  });

  it("excludes non-.ts files when only .ts is allowed", () => {
    expect(filterEntry(blob("file.js"), minimalConfig).included).toBe(false);
    if (!filterEntry(blob("file.js"), minimalConfig).included) {
      const r = filterEntry(blob("file.js"), minimalConfig);
      if (!r.included) expect(r.reason).toBe("not_allowlisted");
    }
  });
});
