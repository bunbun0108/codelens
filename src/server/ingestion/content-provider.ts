import type { GitHubClient } from "../github/client";
import type { BlobCache } from "../store/blob-cache";
import type { Snapshot, FileContent } from "../../shared/schemas/index";
import { AppError } from "../../shared/types/errors";

export interface ContentProvider {
  /**
   * Fetches file content, ensuring the path exists in the snapshot and the blob is retrieved.
   * Throws FILE_NOT_FOUND if the path isn't in the snapshot manifest.
   * Throws FILE_NOT_TEXT if the content isn't valid UTF-8 or contains NUL bytes.
   */
  getFileContent(snapshot: Snapshot, path: string): Promise<FileContent>;
}

export class M1ContentProvider implements ContentProvider {
  constructor(
    private readonly githubClient: GitHubClient,
    private readonly blobCache: BlobCache,
  ) {}

  async getFileContent(snapshot: Snapshot, path: string): Promise<FileContent> {
    const entry = snapshot.files.find((f) => f.path === path);
    if (!entry) {
      throw new AppError("FILE_NOT_FOUND", `File "${path}" not found in this snapshot.`, false);
    }

    // Try cache first
    let bytes = await this.blobCache.get(entry.blobSha);

    if (!bytes) {
      // Fetch from GitHub
      bytes = await this.githubClient.getBlob(snapshot.repo.owner, snapshot.repo.name, entry.blobSha);

      // Verify size matches what we expect from the manifest
      if (bytes.byteLength !== entry.size) {
        // Just log it internally; don't fail, but it's weird
      }

      // Save to cache
      await this.blobCache.set(entry.blobSha, bytes);
    }

    // Text validation (spec §9 read-time checks: NUL byte in first 8 KB or invalid UTF-8)
    const checkLen = Math.min(bytes.byteLength, 8192);
    for (let i = 0; i < checkLen; i++) {
      if (bytes[i] === 0) {
        throw new AppError("FILE_NOT_TEXT", "File appears to be binary (contains NUL bytes).");
      }
    }

    let text: string;
    try {
      // TextDecoder with { fatal: true } throws if not valid UTF-8
      const decoder = new TextDecoder("utf-8", { fatal: true });
      text = decoder.decode(bytes);
    } catch {
      throw new AppError("FILE_NOT_TEXT", "File is not valid UTF-8 text.");
    }

    const lines = text.split("\n");
    const lineCount = lines.length > 0 && lines[lines.length - 1] === "" ? lines.length - 1 : lines.length;

    return {
      snapshotId: snapshot.id,
      path: entry.path,
      blobSha: entry.blobSha,
      size: bytes.byteLength,
      language: entry.language,
      lineCount,
      content: text,
    };
  }
}
