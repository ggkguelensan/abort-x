/**
 * Wait for ALL signals to abort
 */

import type { CleanupFn } from '../core/types';

export interface AllAbortedReason {
  readonly type: 'all_aborted';
  readonly reasons: unknown[];
}

/**
 * Create a signal that aborts only when ALL provided signals have aborted.
 * This is the opposite of `any()` - it waits for all signals.
 *
 * @param signals - Signals to wait for
 * @returns A signal that aborts when all input signals have aborted
 *
 * @example
 * ```typescript
 * const signal = all([signal1, signal2, signal3]);
 * // Aborts only when ALL three signals have aborted
 * ```
 */
export function all(signals: Iterable<AbortSignal>): AbortSignal {
  const signalsArray = Array.from(signals);

  if (signalsArray.length === 0) {
    // No signals = immediately aborted
    const controller = new AbortController();
    controller.abort({ type: 'all_aborted', reasons: [] } satisfies AllAbortedReason);
    return controller.signal;
  }

  if (signalsArray.length === 1) {
    return signalsArray[0]!;
  }

  const controller = new AbortController();
  const reasons: unknown[] = new Array(signalsArray.length);
  let abortedCount = 0;
  const cleanupFns: CleanupFn[] = [];

  const cleanup = () => {
    cleanupFns.forEach((fn) => fn());
    cleanupFns.length = 0;
  };

  signalsArray.forEach((signal, index) => {
    if (signal.aborted) {
      reasons[index] = signal.reason;
      abortedCount++;
    } else {
      const handler = () => {
        reasons[index] = signal.reason;
        abortedCount++;

        if (abortedCount === signalsArray.length) {
          cleanup();
          controller.abort({
            type: 'all_aborted',
            reasons,
          } satisfies AllAbortedReason);
        }
      };

      signal.addEventListener('abort', handler, { once: true });
      cleanupFns.push(() => signal.removeEventListener('abort', handler));
    }
  });

  // Check if all were already aborted
  if (abortedCount === signalsArray.length) {
    cleanup();
    controller.abort({
      type: 'all_aborted',
      reasons,
    } satisfies AllAbortedReason);
  }

  return controller.signal;
}

/**
 * Create a signal that aborts when a specific number of signals have aborted.
 *
 * @param signals - Signals to monitor
 * @param count - Number of signals that must abort
 * @returns A signal that aborts when `count` signals have aborted
 *
 * @example
 * ```typescript
 * // Abort when any 2 out of 3 signals abort
 * const signal = atLeast([signal1, signal2, signal3], 2);
 * ```
 */
export function atLeast(
  signals: Iterable<AbortSignal>,
  count: number
): AbortSignal {
  const signalsArray = Array.from(signals);

  if (count <= 0) {
    // Immediately aborted
    const controller = new AbortController();
    controller.abort({ type: 'at_least', count: 0, reasons: [] });
    return controller.signal;
  }

  if (count >= signalsArray.length) {
    // Same as all()
    return all(signalsArray);
  }

  const controller = new AbortController();
  const reasons: unknown[] = [];
  const cleanupFns: CleanupFn[] = [];

  const cleanup = () => {
    cleanupFns.forEach((fn) => fn());
    cleanupFns.length = 0;
  };

  for (const signal of signalsArray) {
    if (signal.aborted) {
      reasons.push(signal.reason);
      if (reasons.length >= count) {
        cleanup();
        controller.abort({ type: 'at_least', count, reasons });
        return controller.signal;
      }
    } else {
      const handler = () => {
        reasons.push(signal.reason);
        if (reasons.length >= count) {
          cleanup();
          controller.abort({ type: 'at_least', count, reasons });
        }
      };

      signal.addEventListener('abort', handler, { once: true });
      cleanupFns.push(() => signal.removeEventListener('abort', handler));
    }
  }

  return controller.signal;
}
