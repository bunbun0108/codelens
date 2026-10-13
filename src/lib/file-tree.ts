import { FileEntry, TreeDirectory, TreeNode } from "../shared/schemas";

export function buildFileTree(files: FileEntry[]): TreeNode[] {
  const root: TreeDirectory = { kind: "directory", name: "", path: "", children: [] };

  // Build the basic tree
  for (const file of files) {
    const parts = file.path.split("/");
    let current = root;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (part === undefined) continue;

      let child = current.children.find((c) => c.kind === "directory" && c.name === part) as TreeDirectory | undefined;
      
      if (!child) {
        child = {
          kind: "directory",
          name: part,
          path: parts.slice(0, i + 1).join("/"),
          children: [],
        };
        current.children.push(child);
      }
      current = child;
    }

    const fileName = parts[parts.length - 1];
    if (fileName !== undefined) {
      current.children.push({
        kind: "file",
        name: fileName,
        path: file.path,
        entry: file,
      });
    }
  }

  // Compress empty single-child directories
  function compress(dir: TreeDirectory) {
    // recursively compress children
    for (const child of dir.children) {
      if (child.kind === "directory") {
        compress(child);
      }
    }

    // if this directory has exactly one child and it's a directory, merge it
    if (dir.children.length === 1) {
      const onlyChild = dir.children[0];
      if (onlyChild && onlyChild.kind === "directory") {
        dir.name = `${dir.name}/${onlyChild.name}`;
        dir.path = onlyChild.path;
        dir.children = onlyChild.children;
      }
    }
  }

  // We compress the children of root, but not root itself since root is virtual
  for (const child of root.children) {
    if (child.kind === "directory") {
      compress(child);
    }
  }

  // Sort children: directories first, then files, both alphabetically
  function sortTree(dir: TreeDirectory) {
    dir.children.sort((a, b) => {
      if (a.kind === "directory" && b.kind === "file") return -1;
      if (a.kind === "file" && b.kind === "directory") return 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
    for (const child of dir.children) {
      if (child.kind === "directory") {
        sortTree(child);
      }
    }
  }

  sortTree(root);
  return root.children;
}
