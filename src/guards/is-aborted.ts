/**
 * Type guards for abort errors
 */

/**
 * Check if an error is an AbortError (from signal.abort())
 *
 * @param error - The error to check
 * @returns true if the error is an AbortError
 *
 * @example
 * ```typescript
 * try {
 *   await fetch(url, { signal });
 * } catch (error) {
 *   if (isAborted(error)) {
 *     console.log('Request was cancelled');
 *     return;
 *   }
 *   throw error;
 * }
 * ```
 */
export function isAborted(error: unknown): error is DOMException {
  if (error instanceof DOMException) {
    return error.name === 'AbortError';
  }

  // Some environments may not use DOMException
  if (error instanceof Error) {
    return error.name === 'AbortError';
  }

  return false;
}

/**
 * Check if an error is a TimeoutError (from AbortSignal.timeout())
 *
 * @param error - The error to check
 * @returns true if the error is a TimeoutError
 *
 * @example
 * ```typescript
 * try {
 *   await fetch(url, { signal: AbortSignal.timeout(5000) });
 * } catch (error) {
 *   if (isTimeout(error)) {
 *     console.log('Request timed out');
 *     return;
 *   }
 *   throw error;
 * }
 * ```
 */
export function isTimeout(error: unknown): error is DOMException {
  if (error instanceof DOMException) {
    return error.name === 'TimeoutError';
  }

  // Some environments may not use DOMException
  if (error instanceof Error) {
    return error.name === 'TimeoutError';
  }

  return false;
}

/**
 * Check if an error is either AbortError or TimeoutError
 *
 * @param error - The error to check
 * @returns true if the error is an abort-related error
 */
export function isAbortRelated(error: unknown): error is DOMException {
  return isAborted(error) || isTimeout(error);
}

/**
 * Check if a signal is aborted
 *
 * @param signal - The signal to check (can be undefined)
 * @returns true if the signal exists and is aborted
 */
export function isSignalAborted(signal?: AbortSignal | null): boolean {
  return signal?.aborted ?? false;
}

/**
 * Check if an abort reason matches a specific type
 *
 * @param reason - The abort reason to check
 * @param type - The type to match
 * @returns true if the reason has the specified type
 *
 * @example
 * ```typescript
 * if (signal.aborted && isReasonType(signal.reason, 'timeout')) {
 *   console.log('Timed out');
 * }
 * ```
 */
export function isReasonType<T extends string>(
  reason: unknown,
  type: T
): reason is { type: T } {
  return (
    typeof reason === 'object' &&
    reason !== null &&
    'type' in reason &&
    (reason as { type: unknown }).type === type
  );
}
