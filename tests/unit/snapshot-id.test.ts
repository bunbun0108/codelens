import { describe, it, expect } from "vitest";
import { computeSnapshotId } from "../../src/shared/snapshot-id";

describe("computeSnapshotId", () => {
  const BASE_ARGS = [
    "vercel",
    "next.js",
    "a".repeat(40),
    "",
    "v1",
  ] as const;

  it("returns a non-empty string", () => {
    const id = computeSnapshotId(...BASE_ARGS);
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("is deterministic — same inputs → same id", () => {
    const id1 = computeSnapshotId(...BASE_ARGS);
    const id2 = computeSnapshotId(...BASE_ARGS);
    expect(id1).toBe(id2);
  });

  it("changes when owner changes", () => {
    const id1 = computeSnapshotId("vercel", "next.js", "a".repeat(40), "", "v1");
    const id2 = computeSnapshotId("OTHER", "next.js", "a".repeat(40), "", "v1");
    expect(id1).not.toBe(id2);
  });

  it("changes when repo changes", () => {
    const id1 = computeSnapshotId("vercel", "next.js", "a".repeat(40), "", "v1");
    const id2 = computeSnapshotId("vercel", "swr", "a".repeat(40), "", "v1");
    expect(id1).not.toBe(id2);
  });

  it("changes when commitSha changes", () => {
    const id1 = computeSnapshotId("vercel", "next.js", "a".repeat(40), "", "v1");
    const id2 = computeSnapshotId("vercel", "next.js", "b".repeat(40), "", "v1");
    expect(id1).not.toBe(id2);
  });

  it("changes when subpath changes", () => {
    const id1 = computeSnapshotId("vercel", "next.js", "a".repeat(40), "", "v1");
    const id2 = computeSnapshotId("vercel", "next.js", "a".repeat(40), "src", "v1");
    expect(id1).not.toBe(id2);
  });

  it("changes when filter version changes (invalidates cached snapshots)", () => {
    const id1 = computeSnapshotId("vercel", "next.js", "a".repeat(40), "", "v1");
    const id2 = computeSnapshotId("vercel", "next.js", "a".repeat(40), "", "v2");
    expect(id1).not.toBe(id2);
  });

  it("is exactly 16 lowercase hex characters", () => {
    const id = computeSnapshotId(...BASE_ARGS);
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });
});
