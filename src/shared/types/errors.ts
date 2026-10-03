/**
 * All application error codes. Each maps to a specific HTTP status (see section 10).
 */
export type ErrorCode =
  | "INVALID_URL"
  | "UNSUPPORTED_URL_FORM"
  | "INVALID_SUBPATH"
  | "REPO_NOT_FOUND"
  | "REF_NOT_FOUND"
  | "SUBPATH_NOT_FOUND"
  | "SUBPATH_NOT_DIRECTORY"
  | "FILE_NOT_FOUND"
  | "SNAPSHOT_NOT_FOUND"
  | "REPO_EMPTY"
  | "REPO_TOO_LARGE"
  | "FILE_TOO_LARGE"
  | "FILE_NOT_TEXT"
  | "REPO_UNAVAILABLE"
  | "RATE_LIMITED"
  | "UPSTREAM_RATE_LIMITED"
  | "UPSTREAM_ERROR"
  | "UPSTREAM_TIMEOUT"
  | "INTERNAL";

/**
 * Typed application error. Services throw this; only route handlers map it to HTTP.
 */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly retryable: boolean = false,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

/**
 * Maps error codes to HTTP status codes per spec section 10.
 */
export const ERROR_CODE_TO_HTTP: Record<ErrorCode, number> = {
  INVALID_URL: 400,
  UNSUPPORTED_URL_FORM: 400,
  INVALID_SUBPATH: 400,
  REPO_NOT_FOUND: 404,
  REF_NOT_FOUND: 404,
  SUBPATH_NOT_FOUND: 404,
  FILE_NOT_FOUND: 404,
  SNAPSHOT_NOT_FOUND: 404,
  SUBPATH_NOT_DIRECTORY: 422,
  REPO_EMPTY: 422,
  REPO_TOO_LARGE: 422,
  FILE_TOO_LARGE: 413,
  FILE_NOT_TEXT: 415,
  REPO_UNAVAILABLE: 451,
  RATE_LIMITED: 429,
  UPSTREAM_RATE_LIMITED: 503,
  UPSTREAM_ERROR: 502,
  UPSTREAM_TIMEOUT: 504,
  INTERNAL: 500,
};
