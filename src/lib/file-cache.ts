import type { FileContent } from "../shared/schemas/index";

export const MAX_CACHE_ENTRIES = 50;

const fileContentCache = new Map<string, FileContent>();

export function getCachedFile(snapshotId: string, path: string): FileContent | undefined {
  const key = `${snapshotId}:${path}`;
  const entry = fileContentCache.get(key);
  if (entry) {
    // Refresh LRU order by deleting and re-inserting
    fileContentCache.delete(key);
    fileContentCache.set(key, entry);
  }
  return entry;
}

export function setCachedFile(snapshotId: string, path: string, content: FileContent): void {
  const key = `${snapshotId}:${path}`;
  if (fileContentCache.has(key)) {
    fileContentCache.delete(key);
  } else if (fileContentCache.size >= MAX_CACHE_ENTRIES) {
    // Evict oldest (first entry in Map)
    const oldestKey = fileContentCache.keys().next().value;
    if (oldestKey) {
      fileContentCache.delete(oldestKey);
    }
  }
  fileContentCache.set(key, content);
}

export function clearFileCache(): void {
  fileContentCache.clear();
}
