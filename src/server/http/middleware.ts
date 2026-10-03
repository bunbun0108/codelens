import { NextResponse } from "next/server";
import { AppError, ERROR_CODE_TO_HTTP } from "../../shared/types/errors";
import { ErrorEnvelopeSchema } from "../../shared/schemas/index";
import { randomUUID } from "crypto";

// Basic structured logger (pino is externalized)
export const logger = {
  info: (msg: string, meta?: any) => console.log(JSON.stringify({ level: "info", msg, ...meta })),
  error: (msg: string, meta?: any) => console.error(JSON.stringify({ level: "error", msg, ...meta })),
  warn: (msg: string, meta?: any) => console.warn(JSON.stringify({ level: "warn", msg, ...meta })),
};

/**
 * Wraps a route handler to provide standard error mapping, request IDs, and logging.
 */
export function withErrorHandler(
  handler: (req: Request, requestId: string, props?: any) => Promise<NextResponse>,
) {
  return async (req: Request, props?: any): Promise<NextResponse> => {
    const requestId = randomUUID();
    const start = performance.now();
    const url = new URL(req.url);

    try {
      const response = await handler(req, requestId, props);
      
      const duration = Math.round(performance.now() - start);
      logger.info(`[${req.method}] ${url.pathname}`, {
        requestId,
        status: response.status,
        durationMs: duration,
      });

      return response;
    } catch (err: unknown) {
      const duration = Math.round(performance.now() - start);
      
      let appError: AppError;
      if (err instanceof AppError) {
        appError = err;
      } else {
        appError = new AppError("INTERNAL", "An unexpected error occurred.", true);
        logger.error("Unhandled exception", {
          requestId,
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        });
      }

      const status = ERROR_CODE_TO_HTTP[appError.code] ?? 500;
      
      // Log internal details
      logger.error(`[${req.method}] ${url.pathname} - ${appError.code}`, {
        requestId,
        status,
        durationMs: duration,
        details: appError.details,
      });

      // Construct standard error envelope
      const envelope = {
        error: {
          code: appError.code,
          message: appError.message,
          retryable: appError.retryable,
          // We intentionally don't expose internal details to the client
        },
        requestId,
      };

      // Ensure it matches the schema contract
      ErrorEnvelopeSchema.parse(envelope);

      const headers = new Headers({
        "Content-Type": "application/json",
      });

      // Add Retry-After for rate limits
      if (appError.code === "RATE_LIMITED" || appError.code === "UPSTREAM_RATE_LIMITED") {
        if (appError.details?.resetAt) {
          const resetTime = new Date(appError.details.resetAt as string).getTime();
          const seconds = Math.max(1, Math.ceil((resetTime - Date.now()) / 1000));
          headers.set("Retry-After", seconds.toString());
        } else {
          headers.set("Retry-After", "60");
        }
      }

      return NextResponse.json(envelope, { status, headers });
    }
  };
}

/**
 * Super simple in-memory rate limiter for M1.
 * Not for production use with multiple instances!
 */
const rateLimits = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(ip: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const record = rateLimits.get(ip);

  if (!record || now > record.resetAt) {
    rateLimits.set(ip, { count: 1, resetAt: now + windowMs });
    return;
  }

  if (record.count >= limit) {
    throw new AppError(
      "RATE_LIMITED",
      "Too many requests. Please try again later.",
      true,
      { resetAt: new Date(record.resetAt).toISOString() }
    );
  }

  record.count++;
}
