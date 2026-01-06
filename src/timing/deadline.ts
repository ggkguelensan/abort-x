/**
 * Deadline-based abort signals
 */

import { abortSignalTimeout, abortSignalAbort, createTimeoutError } from '../core/polyfills';

/**
 * Create a signal that aborts at a specific date/time.
 * Unlike timeout() which is relative, deadline() is absolute.
 *
 * @param date - The date/time when the signal should abort
 * @returns An AbortSignal that aborts at the specified time
 *
 * @example
 * ```typescript
 * // Abort at end of day
 * const endOfDay = new Date();
 * endOfDay.setHours(23, 59, 59, 999);
 * const signal = deadline(endOfDay);
 *
 * // Abort at specific timestamp
 * const signal = deadline(new Date('2024-12-31T23:59:59'));
 * ```
 */
export function deadline(date: Date): AbortSignal {
  const ms = date.getTime() - Date.now();

  if (ms <= 0) {
    // Already past the deadline
    return abortSignalAbort(
      createTimeoutError(0)
    );
  }

  return abortSignalTimeout(ms);
}

/**
 * Create a signal that aborts at a specific timestamp.
 *
 * @param timestamp - Unix timestamp in milliseconds
 * @returns An AbortSignal that aborts at the specified time
 */
export function deadlineAt(timestamp: number): AbortSignal {
  return deadline(new Date(timestamp));
}

/**
 * Create a signal with both timeout and deadline.
 * Aborts when either the timeout expires or deadline is reached.
 *
 * @param options - Configuration options
 * @returns An AbortSignal
 *
 * @example
 * ```typescript
 * const signal = withDeadline({
 *   timeout: 5000,           // 5 seconds max
 *   deadline: endOfDay,      // but also before end of day
 * });
 * ```
 */
export function withDeadline(options: {
  timeout?: number;
  deadline?: Date;
  signal?: AbortSignal;
}): AbortSignal {
  const signals: AbortSignal[] = [];

  if (options.timeout !== undefined && options.timeout > 0) {
    signals.push(abortSignalTimeout(options.timeout));
  }

  if (options.deadline) {
    signals.push(deadline(options.deadline));
  }

  if (options.signal) {
    signals.push(options.signal);
  }

  if (signals.length === 0) {
    return new AbortController().signal;
  }

  if (signals.length === 1) {
    return signals[0]!;
  }

  // Combine all signals
  const controller = new AbortController();

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }

    signal.addEventListener(
      'abort',
      () => {
        controller.abort(signal.reason);
      },
      { once: true }
    );
  }

  return controller.signal;
}

/**
 * Create a signal that aborts after a duration from a start time.
 * Useful when you want to measure from a specific point in time.
 *
 * @param startTime - The start time (Date or timestamp)
 * @param durationMs - Duration in milliseconds
 * @returns An AbortSignal
 *
 * @example
 * ```typescript
 * const requestStarted = Date.now();
 * // ... some time passes ...
 * // Create signal for remaining time of 5 second budget
 * const signal = fromStart(requestStarted, 5000);
 * ```
 */
export function fromStart(
  startTime: Date | number,
  durationMs: number
): AbortSignal {
  const start = typeof startTime === 'number' ? startTime : startTime.getTime();
  const endTime = start + durationMs;
  return deadlineAt(endTime);
}

/**
 * Create a signal that aborts at the start of next interval.
 * Useful for operations that should complete within a time window.
 *
 * @param intervalMs - Interval duration in milliseconds
 * @param options - Configuration options
 * @returns An AbortSignal
 *
 * @example
 * ```typescript
 * // Abort at the start of next minute
 * const signal = nextInterval(60000);
 *
 * // Abort at start of next hour
 * const signal = nextInterval(3600000);
 * ```
 */
export function nextInterval(
  intervalMs: number,
  options?: { offset?: number }
): AbortSignal {
  const now = Date.now();
  const offset = options?.offset ?? 0;
  const nextIntervalStart =
    Math.ceil((now - offset) / intervalMs) * intervalMs + offset;

  return deadlineAt(nextIntervalStart);
}
