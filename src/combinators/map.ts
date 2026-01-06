/**
 * Transform abort reasons - like Array.map() for signals
 */

/**
 * Transform the abort reason of a signal.
 * Like `Array.map()` - transforms each abort event.
 *
 * @param signal - The source signal
 * @param fn - Function to transform the reason
 * @returns A new signal with transformed reason
 *
 * @example
 * ```typescript
 * const signal = mapReason(timeoutSignal, (reason) => ({
 *   ...reason,
 *   context: 'user-fetch',
 *   timestamp: Date.now(),
 * }));
 * ```
 */
export function mapReason<TIn, TOut>(
  signal: AbortSignal,
  fn: (reason: TIn) => TOut
): AbortSignal {
  const controller = new AbortController();

  if (signal.aborted) {
    controller.abort(fn(signal.reason as TIn));
    return controller.signal;
  }

  signal.addEventListener(
    'abort',
    () => {
      controller.abort(fn(signal.reason as TIn));
    },
    { once: true }
  );

  return controller.signal;
}

/**
 * Enrich abort reason with additional context.
 * Convenience wrapper around mapReason.
 *
 * @param signal - The source signal
 * @param context - Additional context to add
 * @returns A new signal with enriched reason
 *
 * @example
 * ```typescript
 * const signal = enrichReason(baseSignal, {
 *   operation: 'fetchUser',
 *   userId: 123,
 * });
 * ```
 */
export function enrichReason<TContext extends Record<string, unknown>>(
  signal: AbortSignal,
  context: TContext
): AbortSignal {
  return mapReason(signal, (reason) => ({
    originalReason: reason,
    ...context,
    timestamp: Date.now(),
  }));
}

/**
 * Wrap the abort reason in a typed container.
 *
 * @param signal - The source signal
 * @param type - The type identifier
 * @returns A new signal with typed reason
 *
 * @example
 * ```typescript
 * const signal = tagReason(timeoutSignal, 'api_timeout');
 * // reason will be { type: 'api_timeout', originalReason: ... }
 * ```
 */
export function tagReason<T extends string>(
  signal: AbortSignal,
  type: T
): AbortSignal {
  return mapReason(signal, (reason) => ({
    type,
    originalReason: reason,
  }));
}

/**
 * Map async - transform reason with async function.
 * Note: The transformation happens after abort, so the signal
 * aborts with a pending promise that resolves to the transformed reason.
 *
 * @param signal - The source signal
 * @param fn - Async function to transform the reason
 * @returns A new signal (aborts synchronously, reason is a promise)
 */
export function mapReasonAsync<TIn, TOut>(
  signal: AbortSignal,
  fn: (reason: TIn) => Promise<TOut>
): AbortSignal {
  const controller = new AbortController();

  if (signal.aborted) {
    // Start transformation immediately
    const reasonPromise = fn(signal.reason as TIn);
    controller.abort(reasonPromise);
    return controller.signal;
  }

  signal.addEventListener(
    'abort',
    () => {
      const reasonPromise = fn(signal.reason as TIn);
      controller.abort(reasonPromise);
    },
    { once: true }
  );

  return controller.signal;
}
