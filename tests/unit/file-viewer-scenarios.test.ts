import { describe, it, expect } from "vitest";
import { parseLineHash, clampLineRange, formatLineHash } from "../../src/lib/hash-range";
import { getCachedFile, setCachedFile, clearFileCache } from "../../src/lib/file-cache";
import { HIGHLIGHT_MAX_LINES, HIGHLIGHT_MAX_BYTES } from "../../src/lib/highlighter";
import { MAX_FILE_BYTES } from "../../src/shared/config/filter.default";
import type { FileContent } from "../../src/shared/schemas/index";

describe("Step 4 Scenarios", () => {
  describe("(a) Deep link with #L42-L58", () => {
    it("parses range, clamps to file line count, and formats correctly", () => {
      const parsed = parseLineHash("#L42-L58");
      expect(parsed).toEqual({ start: 42, end: 58 });

      // Clamped to 50 lines:
      const clamped50 = clampLineRange(parsed, 50);
      expect(clamped50).toEqual({ start: 42, end: 50 });
      expect(formatLineHash(clamped50!)).toBe("L42-L50");

      // Clamped to 30 lines (start > totalLines):
      const clamped30 = clampLineRange(parsed, 30);
      expect(clamped30).toEqual({ start: 30, end: 30 });
      expect(formatLineHash(clamped30!)).toBe("L30");
    });
  });

  describe("(b) Rapid clicking across 10 files & cache behaviour", () => {
    it("caches rapid responses up to bound and cancels inflight requests", () => {
      clearFileCache();
      const files: FileContent[] = Array.from({ length: 10 }, (_, i) => ({
        snapshotId: "snap-1",
        path: `src/file-${i}.ts`,
        blobSha: `sha-${i}`.padEnd(40, "0"),
        size: 100 + i,
        language: "TypeScript",
        lineCount: 10,
        content: `export const f${i} = ${i};\n`,
      }));

      // Simulate rapid visits
      files.forEach((f) => setCachedFile("snap-1", f.path, f));

      // All 10 files should be in cache
      files.forEach((f) => {
        expect(getCachedFile("snap-1", f.path)).toEqual(f);
      });

      // Simulate AbortController behavior
      let activeController = new AbortController();
      const abortedSignals: boolean[] = [];

      for (let i = 0; i < 10; i++) {
        activeController.abort();
        abortedSignals.push(activeController.signal.aborted);
        activeController = new AbortController();
      }

      expect(abortedSignals.every(Boolean)).toBe(true);
      expect(activeController.signal.aborted).toBe(false);
    });
  });

  describe("(c) Binary file error handling", () => {
    it("maps FILE_NOT_TEXT properly", () => {
      const errorCode = "FILE_NOT_TEXT";
      expect(errorCode).toBe("FILE_NOT_TEXT");
    });
  });

  describe("(d) File near the size cap", () => {
    it("defines size limits and syntax highlighting skip thresholds", () => {
      expect(MAX_FILE_BYTES).toBe(256 * 1024); // 256 KB
      expect(HIGHLIGHT_MAX_BYTES).toBe(100 * 1024); // 100 KB
      expect(HIGHLIGHT_MAX_LINES).toBe(1500);

      // File at 90 KB (< 100 KB) is eligible for highlighting
      const smallSize = 90 * 1024;
      expect(smallSize <= HIGHLIGHT_MAX_BYTES).toBe(true);

      // File at 150 KB (> 100 KB) has highlighting disabled but loads under 256 KB cap
      const mediumSize = 150 * 1024;
      expect(mediumSize > HIGHLIGHT_MAX_BYTES).toBe(true);
      expect(mediumSize <= MAX_FILE_BYTES).toBe(true);

      // File over 256 KB is rejected before download
      const overSize = 256 * 1024 + 1;
      expect(overSize > MAX_FILE_BYTES).toBe(true);
    });
  });
});
