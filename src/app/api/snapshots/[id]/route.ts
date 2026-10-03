import { NextResponse } from "next/server";
import { withErrorHandler } from "../../../../server/http/middleware";
import { snapshotStore } from "../../../../server/container";
import { AppError } from "../../../../shared/types/errors";

export const GET = withErrorHandler(async (req: Request, requestId: string, props?: any) => {
  // Use a fallback for dynamic route params extraction to handle Next.js changes
  let id = "";
  if (props && props.params && props.params.id) {
     id = props.params.id;
  } else {
     // Extract from URL manually if props.params isn't available
     const url = new URL(req.url);
     const parts = url.pathname.split('/');
     id = parts[parts.length - 1]!;
  }

  const snapshot = await snapshotStore.get(id);
  if (!snapshot) {
    throw new AppError("SNAPSHOT_NOT_FOUND", "Snapshot not found or expired. Please reload to re-ingest.", false);
  }

  return NextResponse.json(snapshot);
});
