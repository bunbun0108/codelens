import type { FileEntry, TreeNode, TreeDirectory } from "./schemas/index";

/**
 * Builds a client-side tree from a flat, sorted list of FileEntry objects.
 *
 * - Pure function: no I/O
 * - Directories appear before files at each level
 * - Within each group: case-insensitive name order
 * - Paths are repo-root-relative; subpath scoping is done by the caller
 */
export function buildTree(files: FileEntry[], subpath: string): TreeNode[] {
  // Filter to files under the subpath (if any)
  const prefix = subpath ? subpath + "/" : "";
  const relevant = subpath
    ? files.filter((f) => f.path.startsWith(prefix))
    : files;

  // Build the tree recursively
  return buildLevel(relevant, prefix);
}

function buildLevel(files: FileEntry[], prefix: string): TreeNode[] {
  const directChildren: Map<string, FileEntry[]> = new Map();
  const fileNodes: TreeNode[] = [];
  const dirNames = new Set<string>();

  for (const file of files) {
    const relative = file.path.slice(prefix.length);
    const slashIdx = relative.indexOf("/");

    if (slashIdx === -1) {
      // Direct file child
      fileNodes.push({
        kind: "file",
        name: file.name,
        path: file.path,
        entry: file,
      });
    } else {
      // Nested under a directory
      const dirName = relative.slice(0, slashIdx);
      if (!directChildren.has(dirName)) {
        directChildren.set(dirName, []);
        dirNames.add(dirName);
      }
      directChildren.get(dirName)!.push(file);
    }
  }

  // Build directory nodes
  const dirNodes: TreeDirectory[] = [];
  for (const dirName of Array.from(dirNames)) {
    const children = directChildren.get(dirName) ?? [];
    const dirPath = prefix + dirName;
    dirNodes.push({
      kind: "directory",
      name: dirName,
      path: dirPath,
      children: buildLevel(children, dirPath + "/"),
    });
  }

  // Sort: directories first, then files; each group case-insensitive by name
  const sortedDirs = dirNodes.sort((a, b) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
  );
  const sortedFiles = fileNodes.sort((a, b) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
  );

  return [...sortedDirs, ...sortedFiles];
}
