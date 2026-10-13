import { describe, it, expect } from "vitest";
import { buildFileTree } from "../../src/lib/file-tree";
import { FileEntry } from "../../src/shared/schemas";

describe("buildFileTree", () => {
  it("should build a basic tree", () => {
    const files: FileEntry[] = [
      { path: "src/index.ts", name: "index.ts", blobSha: "1", size: 10, language: "TypeScript", kind: "source" },
      { path: "package.json", name: "package.json", blobSha: "2", size: 10, language: "JSON", kind: "config" },
    ];
    const tree = buildFileTree(files);
    
    expect(tree).toHaveLength(2);
    expect(tree[0]?.kind).toBe("directory");
    expect(tree[0]?.name).toBe("src");
    expect(tree[1]?.kind).toBe("file");
    expect(tree[1]?.name).toBe("package.json");
    
    if (tree[0]?.kind === "directory") {
      expect(tree[0].children).toHaveLength(1);
      expect(tree[0].children[0]?.name).toBe("index.ts");
    }
  });

  it("should compress single-child directories", () => {
    const files: FileEntry[] = [
      { path: "src/app/api/route.ts", name: "route.ts", blobSha: "1", size: 10, language: "TypeScript", kind: "source" },
      { path: "src/components/button.tsx", name: "button.tsx", blobSha: "2", size: 10, language: "TypeScript", kind: "source" },
    ];
    const tree = buildFileTree(files);

    expect(tree).toHaveLength(1);
    expect(tree[0]?.name).toBe("src");
    
    if (tree[0]?.kind === "directory") {
      expect(tree[0].children).toHaveLength(2);
      expect(tree[0].children[0]?.name).toBe("app/api"); // Compressed!
      expect(tree[0].children[1]?.name).toBe("components");
    }
  });

  it("should sort folders first, then files alphabetically", () => {
    const files: FileEntry[] = [
      { path: "b-file.ts", name: "b-file.ts", blobSha: "1", size: 10, language: null, kind: "source" },
      { path: "a-folder/file.ts", name: "file.ts", blobSha: "2", size: 10, language: null, kind: "source" },
      { path: "a-file.ts", name: "a-file.ts", blobSha: "3", size: 10, language: null, kind: "source" },
      { path: "b-folder/file.ts", name: "file.ts", blobSha: "4", size: 10, language: null, kind: "source" },
    ];
    const tree = buildFileTree(files);
    
    expect(tree.map((t) => t.name)).toEqual(["a-folder", "b-folder", "a-file.ts", "b-file.ts"]);
  });

  it("should handle empty input", () => {
    const tree = buildFileTree([]);
    expect(tree).toEqual([]);
  });
});
