import { NextResponse } from "next/server";
import { withErrorHandler } from "../../../../../server/http/middleware";
import { snapshotStore, contentProvider } from "../../../../../server/container";
import { AppError } from "../../../../../shared/types/errors";

export const GET = withErrorHandler(async (req: Request, requestId: string, props?: any) => {
  // Use a fallback for dynamic route params extraction
  let id = "";
  if (props && props.params && props.params.id) {
     id = props.params.id;
  } else {
     const url = new URL(req.url);
     const parts = url.pathname.split('/');
     id = parts[parts.length - 2]!; // .../snapshots/[id]/file
  }

  const url = new URL(req.url);
  const path = url.searchParams.get("path");
  
  if (!path) {
    throw new AppError("FILE_NOT_FOUND", "Path parameter is required.", false);
  }

  const snapshot = await snapshotStore.get(id);
  if (!snapshot) {
    throw new AppError("SNAPSHOT_NOT_FOUND", "Snapshot not found or expired. Please reload to re-ingest.", false);
  }

  const content = await contentProvider.getFileContent(snapshot, path);

  return NextResponse.json(content, {
    headers: {
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff"
    }
  });
});
