/**
 * Polyfills for AbortSignal static methods
 *
 * These functions provide cross-browser support for:
 * - AbortSignal.timeout() - Chrome 103+, Firefox 100+, Safari 16+
 * - AbortSignal.any() - Chrome 116+, Firefox 124+, Safari 17.4+
 * - AbortSignal.abort() - Chrome 93+, Firefox 88+, Safari 15+
 */

// ============================================
// Feature Detection
// ============================================

/** Check if native AbortSignal.timeout() is available */
export const supportsAbortSignalTimeout: boolean =
  typeof AbortSignal !== 'undefined' &&
  typeof AbortSignal.timeout === 'function';

/** Check if native AbortSignal.any() is available */
export const supportsAbortSignalAny: boolean =
  typeof AbortSignal !== 'undefined' &&
  typeof AbortSignal.any === 'function';

/** Check if native AbortSignal.abort() is available */
export const supportsAbortSignalAbort: boolean =
  typeof AbortSignal !== 'undefined' &&
  typeof AbortSignal.abort === 'function';

// ============================================
// Error Factories
// ============================================

/**
 * Creates a TimeoutError DOMException
 */
export function createTimeoutError(ms?: number): DOMException {
  const message =
    ms !== undefined
      ? `The operation timed out after ${ms}ms`
      : 'The operation timed out';
  return new DOMException(message, 'TimeoutError');
}

/**
 * Creates an AbortError DOMException
 */
export function createAbortError(
  message = 'The operation was aborted'
): DOMException {
  return new DOMException(message, 'AbortError');
}

// ============================================
// AbortSignal.timeout() Polyfill
// ============================================

/**
 * Creates an AbortSignal that automatically aborts after specified milliseconds.
 *
 * Uses native `AbortSignal.timeout()` when available, otherwise provides a polyfill.
 *
 * @param ms - The number of milliseconds before the signal aborts
 * @returns An AbortSignal that will abort with a TimeoutError after the specified time
 * @throws RangeError if ms is negative
 *
 * @example
 * ```typescript
 * const signal = abortSignalTimeout(5000);
 * await fetch('/api', { signal });
 * ```
 */
export function abortSignalTimeout(ms: number): AbortSignal {
  if (ms < 0) {
    throw new RangeError('Timeout must be a non-negative number');
  }

  // Use native implementation if available
  if (supportsAbortSignalTimeout) {
    return AbortSignal.timeout!(ms);
  }

  // Polyfill implementation
  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort(createTimeoutError(ms));
  }, ms);

  // Clean up timeout if signal is aborted externally
  // This prevents memory leaks when combining signals
  controller.signal.addEventListener(
    'abort',
    () => {
      clearTimeout(timeoutId);
    },
    { once: true }
  );

  return controller.signal;
}

// ============================================
// AbortSignal.any() Polyfill
// ============================================

/**
 * Creates an AbortSignal that aborts when ANY of the provided signals abort.
 *
 * Uses native `AbortSignal.any()` when available, otherwise provides a polyfill.
 *
 * @param signals - Array of AbortSignal objects to combine
 * @returns An AbortSignal that aborts when any input signal aborts
 *
 * @example
 * ```typescript
 * const signal = abortSignalAny([
 *   AbortSignal.timeout(5000),
 *   userController.signal,
 * ]);
 * await fetch('/api', { signal });
 * ```
 */
export function abortSignalAny(signals: Iterable<AbortSignal>): AbortSignal {
  const signalsArray = Array.from(signals);

  // Handle edge cases
  if (signalsArray.length === 0) {
    // Return a signal that never aborts
    return new AbortController().signal;
  }

  if (signalsArray.length === 1) {
    return signalsArray[0]!;
  }

  // Use native implementation if available
  if (supportsAbortSignalAny) {
    return AbortSignal.any!(signalsArray);
  }

  // Polyfill implementation
  const controller = new AbortController();

  // Check if any signal is already aborted
  for (const signal of signalsArray) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
  }

  // Track cleanup functions for proper memory management
  const cleanupFns: Array<() => void> = [];
  let hasAborted = false;

  const cleanup = () => {
    cleanupFns.forEach((fn) => fn());
    cleanupFns.length = 0;
  };

  for (const signal of signalsArray) {
    const handler = () => {
      if (hasAborted) return;
      hasAborted = true;
      controller.abort(signal.reason);
      cleanup();
    };

    signal.addEventListener('abort', handler, { once: true });
    cleanupFns.push(() => signal.removeEventListener('abort', handler));
  }

  return controller.signal;
}

// ============================================
// AbortSignal.abort() Polyfill
// ============================================

/**
 * Creates an already-aborted AbortSignal with the given reason.
 *
 * Uses native `AbortSignal.abort()` when available, otherwise provides a polyfill.
 *
 * @param reason - The reason for the abort (defaults to AbortError)
 * @returns An already-aborted AbortSignal
 *
 * @example
 * ```typescript
 * const signal = abortSignalAbort({ type: 'cancelled' });
 * console.log(signal.aborted); // true
 * console.log(signal.reason); // { type: 'cancelled' }
 * ```
 */
export function abortSignalAbort(reason?: unknown): AbortSignal {
  // Use native implementation if available
  if (supportsAbortSignalAbort) {
    return AbortSignal.abort!(reason);
  }

  // Polyfill implementation
  const controller = new AbortController();
  controller.abort(reason ?? createAbortError());
  return controller.signal;
}

// ============================================
// Convenience aliases
// ============================================

/** Alias for abortSignalTimeout */
export const timeout = abortSignalTimeout;

/** Alias for abortSignalAny */
export const any = abortSignalAny;

/** Alias for abortSignalAny (same behavior as any for signals) */
export const race = abortSignalAny;

/** Alias for abortSignalAbort */
export const abort = abortSignalAbort;
