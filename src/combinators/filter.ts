/**
 * Filter abort signals by predicate - like Array.filter()
 */

/**
 * Filter aborts by predicate.
 * The returned signal only aborts if the predicate returns true.
 * Like `Array.filter()` - only matching aborts pass through.
 *
 * @param signal - The source signal
 * @param predicate - Function to test the abort reason
 * @returns A new signal that only aborts if predicate matches
 *
 * @example
 * ```typescript
 * // Only abort on user cancellation, ignore timeouts
 * const userOnlySignal = filter(combinedSignal, (reason) =>
 *   reason?.type === 'user_cancelled'
 * );
 * ```
 */
export function filter(
  signal: AbortSignal,
  predicate: (reason: unknown) => boolean
): AbortSignal {
  const controller = new AbortController();

  if (signal.aborted) {
    if (predicate(signal.reason)) {
      controller.abort(signal.reason);
    }
    // If predicate fails, signal never aborts
    return controller.signal;
  }

  signal.addEventListener(
    'abort',
    () => {
      if (predicate(signal.reason)) {
        controller.abort(signal.reason);
      }
    },
    { once: true }
  );

  return controller.signal;
}

/**
 * Filter by reason type.
 * Convenience wrapper for filtering by `reason.type`.
 *
 * @param signal - The source signal
 * @param type - The type to match
 * @returns A signal that only aborts if reason.type matches
 *
 * @example
 * ```typescript
 * const timeoutOnlySignal = filterByType(signal, 'timeout');
 * ```
 */
export function filterByType<T extends string>(
  signal: AbortSignal,
  type: T
): AbortSignal {
  return filter(signal, (reason) => {
    return (
      typeof reason === 'object' &&
      reason !== null &&
      'type' in reason &&
      (reason as { type: unknown }).type === type
    );
  });
}

/**
 * Exclude aborts matching predicate.
 * Opposite of filter - aborts pass through only if predicate is false.
 *
 * @param signal - The source signal
 * @param predicate - Function to test the abort reason
 * @returns A signal that aborts only if predicate returns false
 *
 * @example
 * ```typescript
 * // Ignore timeout errors, pass through everything else
 * const noTimeoutSignal = exclude(signal, (reason) =>
 *   reason instanceof DOMException && reason.name === 'TimeoutError'
 * );
 * ```
 */
export function exclude(
  signal: AbortSignal,
  predicate: (reason: unknown) => boolean
): AbortSignal {
  return filter(signal, (reason) => !predicate(reason));
}

/**
 * Exclude by reason type.
 *
 * @param signal - The source signal
 * @param type - The type to exclude
 * @returns A signal that aborts unless reason.type matches
 *
 * @example
 * ```typescript
 * const noTimeoutSignal = excludeByType(signal, 'timeout');
 * ```
 */
export function excludeByType<T extends string>(
  signal: AbortSignal,
  type: T
): AbortSignal {
  return filter(signal, (reason) => {
    if (
      typeof reason === 'object' &&
      reason !== null &&
      'type' in reason
    ) {
      return (reason as { type: unknown }).type !== type;
    }
    return true;
  });
}

/**
 * Take first N aborts, then stop listening.
 * Useful for signals that might be used multiple times.
 *
 * Note: Standard AbortSignal can only abort once, so this is mainly
 * useful for debugging or when wrapping custom abort-like systems.
 *
 * @param signal - The source signal
 * @param count - Number of aborts to allow (default: 1)
 * @returns A signal that stops after count aborts
 */
export function take(signal: AbortSignal, count = 1): AbortSignal {
  if (count <= 0) {
    // Never aborts
    return new AbortController().signal;
  }

  // For standard AbortSignal, take(1) is the same as the original
  return signal;
}

/**
 * Skip the first abort if predicate matches.
 * Useful for ignoring initial state.
 *
 * @param signal - The source signal
 * @param predicate - Predicate to check for skip
 * @returns A signal that may skip the first abort
 */
export function skipIf(
  signal: AbortSignal,
  predicate: (reason: unknown) => boolean
): AbortSignal {
  const controller = new AbortController();
  let skipped = false;

  if (signal.aborted) {
    if (predicate(signal.reason) && !skipped) {
      skipped = true;
      // Don't abort - we skipped it
    } else {
      controller.abort(signal.reason);
    }
    return controller.signal;
  }

  signal.addEventListener(
    'abort',
    () => {
      if (predicate(signal.reason) && !skipped) {
        skipped = true;
        // Don't abort - we skipped it
      } else {
        controller.abort(signal.reason);
      }
    },
    { once: true }
  );

  return controller.signal;
}
