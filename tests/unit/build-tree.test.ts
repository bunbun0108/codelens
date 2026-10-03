import { describe, it, expect } from "vitest";
import { buildTree } from "../../src/shared/build-tree";
import type { FileEntry } from "../../src/shared/schemas/index";

function makeFile(path: string): FileEntry {
  return {
    path,
    name: path.split("/").pop()!,
    blobSha: "a".repeat(40),
    size: 100,
    language: "TypeScript",
    kind: "source",
  };
}

describe("buildTree", () => {
  it("returns [] for empty file list", () => {
    expect(buildTree([], "")).toEqual([]);
  });

  it("returns flat file nodes for root files", () => {
    const files = [makeFile("README.md"), makeFile("package.json")];
    const tree = buildTree(files, "");
    expect(tree).toHaveLength(2);
    expect(tree[0]!.kind).toBe("file");
  });

  it("directories come before files", () => {
    const files = [
      makeFile("README.md"),
      makeFile("src/index.ts"),
      makeFile("package.json"),
    ];
    const tree = buildTree(files, "");
    expect(tree[0]!.kind).toBe("directory");
    expect(tree[0]!.name).toBe("src");
  });

  it("files within a directory are nested correctly", () => {
    const files = [makeFile("src/index.ts"), makeFile("src/utils.ts")];
    const tree = buildTree(files, "");
    expect(tree).toHaveLength(1);
    expect(tree[0]!.kind).toBe("directory");
    if (tree[0]!.kind === "directory") {
      expect(tree[0]!.children).toHaveLength(2);
    }
  });

  it("nested directories are recursively built", () => {
    const files = [makeFile("src/server/api.ts"), makeFile("src/shared/utils.ts")];
    const tree = buildTree(files, "");
    expect(tree).toHaveLength(1);
    if (tree[0]!.kind === "directory") {
      // src has server and shared
      expect(tree[0]!.children).toHaveLength(2);
      expect(tree[0]!.children[0]!.kind).toBe("directory");
    }
  });

  it("sorts directories case-insensitively", () => {
    const files = [
      makeFile("Zeta/file.ts"),
      makeFile("alpha/file.ts"),
      makeFile("Beta/file.ts"),
    ];
    const tree = buildTree(files, "");
    const names = tree.map((n) => n.name);
    expect(names).toEqual(["alpha", "Beta", "Zeta"]);
  });

  it("sorts files case-insensitively within a directory", () => {
    const files = [makeFile("Zeta.ts"), makeFile("alpha.ts"), makeFile("Beta.ts")];
    const tree = buildTree(files, "");
    const names = tree.map((n) => n.name);
    expect(names).toEqual(["alpha.ts", "Beta.ts", "Zeta.ts"]);
  });

  it("filters to subpath correctly", () => {
    const files = [
      makeFile("src/index.ts"),
      makeFile("src/utils.ts"),
      makeFile("tests/foo.test.ts"),
    ];
    const tree = buildTree(files, "src");
    // Only files under src/
    expect(tree).toHaveLength(2);
    expect(tree.every((n) => n.kind === "file")).toBe(true);
  });

  it("returns [] if subpath has no matching files", () => {
    const files = [makeFile("src/index.ts")];
    expect(buildTree(files, "tests")).toEqual([]);
  });

  it("handles deep nesting (4 levels)", () => {
    const files = [makeFile("a/b/c/d/deep.ts")];
    const tree = buildTree(files, "");
    expect(tree).toHaveLength(1);
    expect(tree[0]!.kind).toBe("directory");
    if (tree[0]!.kind === "directory") {
      const b = tree[0]!.children[0]!;
      expect(b.kind).toBe("directory");
      if (b.kind === "directory") {
        const c = b.children[0]!;
        expect(c.kind).toBe("directory");
        if (c.kind === "directory") {
          const d = c.children[0]!;
          expect(d.kind).toBe("directory");
          if (d.kind === "directory") {
            expect(d.children[0]!.name).toBe("deep.ts");
          }
        }
      }
    }
  });
});
