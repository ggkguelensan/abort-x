/**
 * Utilities to ensure signal state
 */

import { createAbortError } from '../core/polyfills';

/**
 * Execute a function only if the signal is not aborted.
 * If the signal aborts during execution, the returned promise will reject.
 *
 * @param signal - The signal to check
 * @param fn - The function to execute
 * @returns The result of the function
 * @throws AbortError if signal is already aborted or aborts during execution
 *
 * @example
 * ```typescript
 * await ensure(signal, async () => {
 *   // This will only execute if signal is not aborted
 *   await doSomething();
 * });
 * ```
 */
export async function ensure<T>(
  signal: AbortSignal,
  fn: () => T | Promise<T>
): Promise<T> {
  // Check if already aborted
  if (signal.aborted) {
    throw signal.reason ?? createAbortError('Signal already aborted');
  }

  return new Promise<T>((resolve, reject) => {
    let completed = false;

    const abortHandler = () => {
      if (!completed) {
        reject(signal.reason ?? createAbortError());
      }
    };

    signal.addEventListener('abort', abortHandler, { once: true });

    Promise.resolve()
      .then(() => fn())
      .then((result) => {
        completed = true;
        signal.removeEventListener('abort', abortHandler);
        resolve(result);
      })
      .catch((error) => {
        completed = true;
        signal.removeEventListener('abort', abortHandler);
        reject(error);
      });
  });
}

/**
 * Assert that a signal is not aborted.
 * Throws if the signal is aborted.
 *
 * @param signal - The signal to check
 * @param message - Optional custom error message
 * @throws AbortError if signal is aborted
 *
 * @example
 * ```typescript
 * function doWork(signal: AbortSignal) {
 *   assertNotAborted(signal);
 *   // ... do work
 *   assertNotAborted(signal);
 *   // ... more work
 * }
 * ```
 */
export function assertNotAborted(
  signal: AbortSignal,
  message?: string
): asserts signal is AbortSignal & { aborted: false } {
  if (signal.aborted) {
    throw signal.reason ?? createAbortError(message ?? 'Signal is aborted');
  }
}

/**
 * Throw if aborted - inline check version
 *
 * @param signal - The signal to check
 * @throws AbortError if signal is aborted
 *
 * @example
 * ```typescript
 * for (const item of items) {
 *   throwIfAborted(signal);
 *   await processItem(item);
 * }
 * ```
 */
export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw signal.reason ?? createAbortError();
  }
}

/**
 * Run a function with abort checking at intervals
 *
 * @param signal - The signal to check
 * @param fn - Generator function that yields periodically
 * @returns The final result
 *
 * @example
 * ```typescript
 * const result = await runWithAbortCheck(signal, async function* () {
 *   for (const item of items) {
 *     yield; // Check for abort here
 *     await processItem(item);
 *   }
 *   return 'done';
 * });
 * ```
 */
export async function runWithAbortCheck<T>(
  signal: AbortSignal,
  fn: () => AsyncGenerator<void, T, unknown>
): Promise<T> {
  const generator = fn();

  while (true) {
    throwIfAborted(signal);

    const result = await generator.next();

    if (result.done) {
      return result.value;
    }
  }
}

/**
 * Create an abort-aware wrapper for iterables
 *
 * @param signal - The signal to check
 * @param iterable - The iterable to wrap
 * @returns An async iterable that throws on abort
 *
 * @example
 * ```typescript
 * for await (const item of abortable(signal, items)) {
 *   await processItem(item);
 * }
 * ```
 */
export async function* abortable<T>(
  signal: AbortSignal,
  iterable: Iterable<T> | AsyncIterable<T>
): AsyncGenerator<T, void, unknown> {
  const isAsync = Symbol.asyncIterator in iterable;

  if (isAsync) {
    for await (const item of iterable as AsyncIterable<T>) {
      throwIfAborted(signal);
      yield item;
    }
  } else {
    for (const item of iterable as Iterable<T>) {
      throwIfAborted(signal);
      yield item;
    }
  }
}
