/**
 * Combine signals - abort when ANY signal aborts
 */

import { abortSignalAny } from '../core/polyfills';

/**
 * Combine multiple signals - aborts when ANY of them abort.
 * This is equivalent to `AbortSignal.any()` with polyfill support.
 *
 * @param signals - Signals to combine
 * @returns A signal that aborts when any input signal aborts
 *
 * @example
 * ```typescript
 * const signal = any([
 *   timeout(5000),
 *   userController.signal,
 *   parentSignal,
 * ]);
 * ```
 */
export function any(signals: Iterable<AbortSignal>): AbortSignal {
  return abortSignalAny(signals);
}

/**
 * Race signals - first to abort wins.
 * Alias for `any()` with variadic arguments.
 *
 * @param signals - Signals to race
 * @returns A signal that aborts when the first input signal aborts
 *
 * @example
 * ```typescript
 * const signal = race(timeout(5000), userSignal);
 * ```
 */
export function race(...signals: AbortSignal[]): AbortSignal {
  return abortSignalAny(signals);
}

/**
 * Combine signals with optional additional signals.
 * Useful when you have a base signal and want to add more.
 *
 * @param base - The base signal
 * @param additional - Additional signals to combine
 * @returns A combined signal
 *
 * @example
 * ```typescript
 * const signal = combine(baseSignal, timeout(5000), userSignal);
 * ```
 */
export function combine(
  base: AbortSignal,
  ...additional: AbortSignal[]
): AbortSignal {
  if (additional.length === 0) {
    return base;
  }
  return abortSignalAny([base, ...additional]);
}
