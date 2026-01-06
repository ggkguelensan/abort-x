/**
 * Side effects for abort signals - like Array.forEach()
 */

import type { CleanupFn } from '../core/types';

/**
 * Execute side effect on abort without modifying the signal.
 * Like `Array.forEach()` or RxJS `tap()` - observe without changing.
 *
 * @param signal - The signal to observe
 * @param fn - Side effect function
 * @returns The same signal (passthrough)
 *
 * @example
 * ```typescript
 * const signal = tap(baseSignal, (reason) => {
 *   analytics.track('operation_aborted', reason);
 * });
 * ```
 */
export function tap(
  signal: AbortSignal,
  fn: (reason: unknown) => void
): AbortSignal {
  if (signal.aborted) {
    try {
      fn(signal.reason);
    } catch {
      // Ignore errors in tap
    }
  } else {
    signal.addEventListener(
      'abort',
      () => {
        try {
          fn(signal.reason);
        } catch {
          // Ignore errors in tap
        }
      },
      { once: true }
    );
  }

  return signal;
}

/**
 * Execute async side effect on abort.
 * The side effect runs but doesn't block.
 *
 * @param signal - The signal to observe
 * @param fn - Async side effect function
 * @returns The same signal (passthrough)
 */
export function tapAsync(
  signal: AbortSignal,
  fn: (reason: unknown) => Promise<void>
): AbortSignal {
  if (signal.aborted) {
    fn(signal.reason).catch(() => {
      // Ignore errors
    });
  } else {
    signal.addEventListener(
      'abort',
      () => {
        fn(signal.reason).catch(() => {
          // Ignore errors
        });
      },
      { once: true }
    );
  }

  return signal;
}

/**
 * Log abort to console.
 * Convenience wrapper for debugging.
 *
 * @param signal - The signal to observe
 * @param label - Optional label for the log
 * @returns The same signal (passthrough)
 *
 * @example
 * ```typescript
 * const signal = debug(baseSignal, 'UserFetch');
 * // Logs: "[UserFetch] Signal aborted: ..."
 * ```
 */
export function debug(signal: AbortSignal, label?: string): AbortSignal {
  return tap(signal, (reason) => {
    const prefix = label ? `[${label}] ` : '';
    console.log(`${prefix}Signal aborted:`, reason);
  });
}

/**
 * Execute callback when signal aborts, with cleanup support.
 * Returns a cleanup function to remove the listener.
 *
 * @param signal - The signal to observe
 * @param fn - Callback function
 * @returns Cleanup function
 *
 * @example
 * ```typescript
 * const cleanup = onAbort(signal, (reason) => {
 *   console.log('Aborted:', reason);
 * });
 *
 * // Later: remove the listener
 * cleanup();
 * ```
 */
export function onAbort(
  signal: AbortSignal,
  fn: (reason: unknown) => void
): CleanupFn {
  if (signal.aborted) {
    try {
      fn(signal.reason);
    } catch {
      // Ignore
    }
    return () => {};
  }

  const handler = () => {
    try {
      fn(signal.reason);
    } catch {
      // Ignore
    }
  };

  signal.addEventListener('abort', handler, { once: true });

  return () => {
    signal.removeEventListener('abort', handler);
  };
}

/**
 * Execute multiple side effects on abort.
 *
 * @param signal - The signal to observe
 * @param fns - Array of side effect functions
 * @returns The same signal (passthrough)
 */
export function tapAll(
  signal: AbortSignal,
  fns: Array<(reason: unknown) => void>
): AbortSignal {
  if (fns.length === 0) {
    return signal;
  }

  return tap(signal, (reason) => {
    for (const fn of fns) {
      try {
        fn(reason);
      } catch {
        // Continue with other handlers
      }
    }
  });
}

/**
 * Conditionally execute side effect.
 *
 * @param signal - The signal to observe
 * @param predicate - Condition to check
 * @param fn - Side effect to execute if predicate is true
 * @returns The same signal (passthrough)
 */
export function tapIf(
  signal: AbortSignal,
  predicate: (reason: unknown) => boolean,
  fn: (reason: unknown) => void
): AbortSignal {
  return tap(signal, (reason) => {
    if (predicate(reason)) {
      fn(reason);
    }
  });
}
