import { describe, it, expect } from "vitest";
import { normalizeSubpath, splitSubpath } from "../../src/shared/subpath";

describe("normalizeSubpath", () => {
  it("returns empty string for empty segments", () => {
    expect(normalizeSubpath([])).toBe("");
  });

  it("returns single segment", () => {
    expect(normalizeSubpath(["src"])).toBe("src");
  });

  it("joins multiple segments with /", () => {
    expect(normalizeSubpath(["src", "server", "ingestion"])).toBe(
      "src/server/ingestion",
    );
  });

  it("percent-decodes segments", () => {
    expect(normalizeSubpath(["my%20folder"])).toBe("my folder");
  });

  it("rejects path traversal with ..", () => {
    expect(() => normalizeSubpath(["src", "..", "etc"])).toThrow();
    try {
      normalizeSubpath(["src", "..", "etc"]);
    } catch (e: any) {
      expect(e.code).toBe("INVALID_SUBPATH");
    }
  });

  it("rejects path traversal with .", () => {
    expect(() => normalizeSubpath(["src", "."])).toThrow();
    try {
      normalizeSubpath(["src", "."]);
    } catch (e: any) {
      expect(e.code).toBe("INVALID_SUBPATH");
    }
  });

  it("rejects backslashes", () => {
    expect(() => normalizeSubpath(["src\\server"])).toThrow();
    try {
      normalizeSubpath(["src\\server"]);
    } catch (e: any) {
      expect(e.code).toBe("INVALID_SUBPATH");
    }
  });

  it("rejects NUL bytes", () => {
    expect(() => normalizeSubpath(["src\x00etc"])).toThrow();
  });

  it("rejects control characters", () => {
    expect(() => normalizeSubpath(["src\x1f"])).toThrow();
  });

  it("rejects subpath exceeding max depth of 20", () => {
    const tooDeep = Array.from({ length: 21 }, (_, i) => `dir${i}`);
    expect(() => normalizeSubpath(tooDeep)).toThrow();
    try {
      normalizeSubpath(tooDeep);
    } catch (e: any) {
      expect(e.code).toBe("INVALID_SUBPATH");
    }
  });

  it("accepts exactly 20 segments", () => {
    const exact = Array.from({ length: 20 }, (_, i) => `d${i}`);
    expect(() => normalizeSubpath(exact)).not.toThrow();
  });

  it("rejects invalid percent-encoding", () => {
    expect(() => normalizeSubpath(["%xy"])).toThrow();
    try {
      normalizeSubpath(["%xy"]);
    } catch (e: any) {
      expect(e.code).toBe("INVALID_SUBPATH");
    }
  });

  it("rejects subpath over 1024 chars", () => {
    expect(() => normalizeSubpath(["a".repeat(1025)])).toThrow();
  });
});

describe("splitSubpath", () => {
  it("returns [] for empty string", () => {
    expect(splitSubpath("")).toEqual([]);
  });

  it("splits by /", () => {
    expect(splitSubpath("src/server/ingestion")).toEqual([
      "src",
      "server",
      "ingestion",
    ]);
  });

  it("handles single segment", () => {
    expect(splitSubpath("src")).toEqual(["src"]);
  });
});
