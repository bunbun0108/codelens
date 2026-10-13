import { describe, it, expect } from "vitest";
import { parseLineHash, clampLineRange, formatLineHash } from "../../src/lib/hash-range";

describe("parseLineHash", () => {
  it("parses single line hash", () => {
    expect(parseLineHash("#L42")).toEqual({ start: 42, end: 42 });
    expect(parseLineHash("L42")).toEqual({ start: 42, end: 42 });
  });

  it("parses multi-line range", () => {
    expect(parseLineHash("#L42-L58")).toEqual({ start: 42, end: 58 });
    expect(parseLineHash("#L42-58")).toEqual({ start: 42, end: 58 });
  });

  it("normalizes reversed ranges", () => {
    expect(parseLineHash("#L58-L42")).toEqual({ start: 42, end: 58 });
    expect(parseLineHash("#L100-10")).toEqual({ start: 10, end: 100 });
  });

  it("returns null for invalid inputs", () => {
    expect(parseLineHash("")).toBeNull();
    expect(parseLineHash("#")).toBeNull();
    expect(parseLineHash("#invalid")).toBeNull();
    expect(parseLineHash("#L0")).toBeNull();
    expect(parseLineHash("#L-5")).toBeNull();
    expect(parseLineHash("#L10-L0")).toBeNull();
    expect(parseLineHash("#Labc")).toBeNull();
  });
});

describe("clampLineRange", () => {
  it("clamps out-of-range lines to totalLines", () => {
    expect(clampLineRange({ start: 5, end: 200 }, 50)).toEqual({ start: 5, end: 50 });
    expect(clampLineRange({ start: 100, end: 200 }, 50)).toEqual({ start: 50, end: 50 });
  });

  it("returns null for non-positive totalLines or null range", () => {
    expect(clampLineRange(null, 50)).toBeNull();
    expect(clampLineRange({ start: 1, end: 10 }, 0)).toBeNull();
    expect(clampLineRange({ start: 1, end: 10 }, -5)).toBeNull();
  });

  it("preserves valid range within bounds", () => {
    expect(clampLineRange({ start: 10, end: 20 }, 50)).toEqual({ start: 10, end: 20 });
  });
});

describe("formatLineHash", () => {
  it("formats single line and multi-line ranges correctly", () => {
    expect(formatLineHash({ start: 42, end: 42 })).toBe("L42");
    expect(formatLineHash({ start: 42, end: 58 })).toBe("L42-L58");
  });
});
