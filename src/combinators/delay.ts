/**
 * Delay and timing transformations for signals
 */

/**
 * Delay the abort by specified milliseconds.
 * Useful for "undo" functionality or grace periods.
 *
 * @param signal - The source signal
 * @param ms - Milliseconds to delay
 * @returns A new signal that aborts after delay
 *
 * @example
 * ```typescript
 * // Give user 3 seconds to undo
 * const delayedSignal = delay(userCancelSignal, 3000);
 * ```
 */
export function delay(signal: AbortSignal, ms: number): AbortSignal {
  if (ms <= 0) {
    return signal;
  }

  const controller = new AbortController();

  if (signal.aborted) {
    setTimeout(() => {
      controller.abort(signal.reason);
    }, ms);
    return controller.signal;
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  signal.addEventListener(
    'abort',
    () => {
      timeoutId = setTimeout(() => {
        controller.abort(signal.reason);
      }, ms);
    },
    { once: true }
  );

  // Allow cancelling the delayed abort
  controller.signal.addEventListener(
    'abort',
    () => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    },
    { once: true }
  );

  return controller.signal;
}

/**
 * Create a delayed abort with cancel capability.
 * Returns both the signal and a cancel function.
 *
 * @param signal - The source signal
 * @param ms - Milliseconds to delay
 * @returns Object with signal and cancel function
 *
 * @example
 * ```typescript
 * const { signal, cancel } = delayWithCancel(userSignal, 3000);
 *
 * // User clicked "undo"
 * cancel();
 * ```
 */
export function delayWithCancel(
  signal: AbortSignal,
  ms: number
): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let cancelled = false;

  const cancel = () => {
    cancelled = true;
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  };

  if (signal.aborted) {
    if (!cancelled) {
      timeoutId = setTimeout(() => {
        if (!cancelled) {
          controller.abort(signal.reason);
        }
      }, ms);
    }
    return { signal: controller.signal, cancel };
  }

  signal.addEventListener(
    'abort',
    () => {
      if (!cancelled) {
        timeoutId = setTimeout(() => {
          if (!cancelled) {
            controller.abort(signal.reason);
          }
        }, ms);
      }
    },
    { once: true }
  );

  return { signal: controller.signal, cancel };
}

/**
 * Debounce abort signals.
 * Only aborts if the signal stays aborted for the specified duration.
 * Useful for avoiding premature cancellation.
 *
 * Note: Since AbortSignal can only abort once, this effectively
 * adds a delay before the abort is propagated.
 *
 * @param signal - The source signal
 * @param ms - Debounce duration in milliseconds
 * @returns A debounced signal
 */
export function debounceSignal(signal: AbortSignal, ms: number): AbortSignal {
  // For standard AbortSignal, debounce is the same as delay
  return delay(signal, ms);
}

/**
 * Add a minimum delay before abort propagates.
 * Even if already aborted, waits for the minimum time.
 *
 * @param signal - The source signal
 * @param ms - Minimum delay in milliseconds
 * @returns A signal with minimum delay
 */
export function minDelay(signal: AbortSignal, ms: number): AbortSignal {
  const controller = new AbortController();
  const startTime = Date.now();

  const abort = () => {
    const elapsed = Date.now() - startTime;
    const remaining = ms - elapsed;

    if (remaining <= 0) {
      controller.abort(signal.reason);
    } else {
      setTimeout(() => {
        controller.abort(signal.reason);
      }, remaining);
    }
  };

  if (signal.aborted) {
    abort();
  } else {
    signal.addEventListener('abort', abort, { once: true });
  }

  return controller.signal;
}

/**
 * Add a maximum delay - abort after delay even if source hasn't aborted.
 * Combines the source signal with a timeout.
 *
 * @param signal - The source signal
 * @param ms - Maximum time before forced abort
 * @returns A signal that aborts at most after ms
 */
export function maxDelay(signal: AbortSignal, ms: number): AbortSignal {
  const controller = new AbortController();

  if (signal.aborted) {
    controller.abort(signal.reason);
    return controller.signal;
  }

  const timeoutId = setTimeout(() => {
    controller.abort({
      type: 'max_delay_exceeded',
      maxDelay: ms,
    });
  }, ms);

  signal.addEventListener(
    'abort',
    () => {
      clearTimeout(timeoutId);
      controller.abort(signal.reason);
    },
    { once: true }
  );

  controller.signal.addEventListener(
    'abort',
    () => {
      clearTimeout(timeoutId);
    },
    { once: true }
  );

  return controller.signal;
}
