/** The error envelope defined in docs/api-contract.md §1.1. */
export type ApiErrorBody = {
  code: string;
  message: string;
  fields?: Record<string, string>;
};

/**
 * True when the failure is worth offering a retry button for.
 *
 * A rejected password is not worth retrying. A dropped connection, a timeout or a
 * 5xx is.
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error && error.name === "NetworkError") {
    return true;
  }
  if (error instanceof Error && error.name === "ApiError") {
    const status = (error as unknown as { status?: number }).status;
    return status === undefined || status >= 500 || status === 429;
  }
  return false;
}

/** A short, user-facing description of a failure. Never swallows the backend's message. */
export function toErrorMessage(error: unknown, fallback = "Something went wrong."): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
