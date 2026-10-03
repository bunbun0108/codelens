import { NextResponse } from "next/server";
import { withErrorHandler } from "../../../server/http/middleware";
import { ingestionService } from "../../../server/container";
import { IngestRequestSchema, IngestResponseSchema } from "../../../shared/schemas/index";
import { AppError } from "../../../shared/types/errors";

export const POST = withErrorHandler(async (req) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new AppError("INVALID_URL", "Request body must be valid JSON.");
  }

  const parsed = IngestRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError("INVALID_URL", "URL is required.");
  }

  const snapshot = await ingestionService.ingestRepository(parsed.data.url);
  
  const responseData = { snapshot };
  // Validate against contract
  IngestResponseSchema.parse(responseData);

  return NextResponse.json(responseData);
});
