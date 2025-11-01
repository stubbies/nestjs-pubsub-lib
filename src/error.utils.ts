export interface NormalizedError {
  message: string;
  stack?: string;
}

/**
 * Safely normalizes an unknown error into a structured object.
 * This prevents runtime crashes when trying to access properties on non-Error objects.
 *
 * @param error The unknown error caught in a catch block.
 * @returns A normalized error object with a message and optional stack.
 */
export function normalizeError(error: unknown): NormalizedError {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
    };
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as any).message === "string"
  ) {
    return {
      message: (error as { message: string }).message,
      stack:
        "stack" in error && typeof (error as any).stack === "string"
          ? (error as { stack: string }).stack
          : undefined,
    };
  }

  try {
    return {
      message: String(error),
    };
  } catch {
    return {
      message: "An unstringifiable error occurred",
    };
  }
}
