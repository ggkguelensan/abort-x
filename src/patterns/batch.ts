/**
 * Batch operations with abort support
 */

import { createAbortError } from '../core/polyfills';

export interface BatchOptions {
  /** Maximum concurrent operations (default: 5) */
  concurrency?: number;
  /** External signal to abort all */
  signal?: AbortSignal;
  /** Stop on first error (default: false) */
  stopOnError?: boolean;
  /** Called when an item completes */
  onProgress?: (completed: number, total: number) => void;
  /** Called when an item fails */
  onError?: (error: Error, index: number) => void;
}

export interface BatchResult<T> {
  results: PromiseSettledResult<T>[];
  successful: number;
  failed: number;
  aborted: boolean;
}

/**
 * Execute multiple operations with concurrency control and shared abort signal.
 *
 * @param items - Items to process
 * @param fn - Function to execute for each item
 * @param options - Batch configuration
 * @returns Results for all items
 *
 * @example
 * ```typescript
 * const results = await batch(
 *   urls,
 *   async (url, signal) => {
 *     const response = await fetch(url, { signal });
 *     return response.json();
 *   },
 *   {
 *     concurrency: 3,
 *     signal: userSignal,
 *     onProgress: (done, total) => {
 *       console.log(`Progress: ${done}/${total}`);
 *     }
 *   }
 * );
 * ```
 */
export async function batch<TItem, TResult>(
  items: TItem[],
  fn: (item: TItem, signal: AbortSignal, index: number) => Promise<TResult>,
  options: BatchOptions = {}
): Promise<BatchResult<TResult>> {
  const {
    concurrency = 5,
    signal,
    stopOnError = false,
    onProgress,
    onError,
  } = options;

  if (items.length === 0) {
    return {
      results: [],
      successful: 0,
      failed: 0,
      aborted: false,
    };
  }

  const controller = new AbortController();
  const results: PromiseSettledResult<TResult>[] = new Array(items.length);
  let currentIndex = 0;
  let completedCount = 0;
  let successCount = 0;
  let failCount = 0;
  let aborted = false;

  // Forward external abort
  if (signal) {
    if (signal.aborted) {
      aborted = true;
      return {
        results: items.map(() => ({
          status: 'rejected' as const,
          reason: signal.reason ?? createAbortError(),
        })),
        successful: 0,
        failed: items.length,
        aborted: true,
      };
    }

    signal.addEventListener(
      'abort',
      () => {
        aborted = true;
        controller.abort(signal.reason);
      },
      { once: true }
    );
  }

  const runNext = async (): Promise<void> => {
    while (!aborted && currentIndex < items.length) {
      const index = currentIndex++;
      const item = items[index]!;

      try {
        if (controller.signal.aborted) {
          results[index] = {
            status: 'rejected',
            reason: controller.signal.reason ?? createAbortError(),
          };
          failCount++;
        } else {
          const result = await fn(item, controller.signal, index);
          results[index] = { status: 'fulfilled', value: result };
          successCount++;
        }
      } catch (error) {
        results[index] = { status: 'rejected', reason: error };
        failCount++;

        onError?.(error instanceof Error ? error : new Error(String(error)), index);

        if (stopOnError) {
          aborted = true;
          controller.abort(error);
        }
      }

      completedCount++;
      onProgress?.(completedCount, items.length);
    }
  };

  // Start workers
  const workerCount = Math.min(concurrency, items.length);
  const workers = Array(workerCount)
    .fill(null)
    .map(() => runNext());

  await Promise.all(workers);

  // Fill remaining with abort errors if aborted early
  for (let i = 0; i < items.length; i++) {
    if (results[i] === undefined) {
      results[i] = {
        status: 'rejected',
        reason: createAbortError('Batch aborted'),
      };
      failCount++;
    }
  }

  return {
    results,
    successful: successCount,
    failed: failCount,
    aborted,
  };
}

/**
 * Execute operations in sequence (concurrency = 1)
 */
export async function sequence<TItem, TResult>(
  items: TItem[],
  fn: (item: TItem, signal: AbortSignal, index: number) => Promise<TResult>,
  options: Omit<BatchOptions, 'concurrency'> = {}
): Promise<BatchResult<TResult>> {
  return batch(items, fn, { ...options, concurrency: 1 });
}

/**
 * Execute operations in parallel (no concurrency limit)
 */
export async function parallel<TItem, TResult>(
  items: TItem[],
  fn: (item: TItem, signal: AbortSignal, index: number) => Promise<TResult>,
  options: Omit<BatchOptions, 'concurrency'> = {}
): Promise<BatchResult<TResult>> {
  return batch(items, fn, { ...options, concurrency: Infinity });
}

/**
 * Map over items with abort support (like Promise.all but with signal)
 */
export async function mapAsync<TItem, TResult>(
  items: TItem[],
  fn: (item: TItem, signal: AbortSignal, index: number) => Promise<TResult>,
  signal?: AbortSignal
): Promise<TResult[]> {
  const options: BatchOptions = {
    concurrency: Infinity,
    stopOnError: true,
  };
  if (signal) {
    options.signal = signal;
  }
  const { results } = await batch(items, fn, options);

  // Check for any failures
  for (const result of results) {
    if (result.status === 'rejected') {
      throw result.reason;
    }
  }

  return results.map((r) => (r as PromiseFulfilledResult<TResult>).value);
}

/**
 * Filter items with async predicate and abort support
 */
export async function filterAsync<TItem>(
  items: TItem[],
  predicate: (item: TItem, signal: AbortSignal, index: number) => Promise<boolean>,
  signal?: AbortSignal
): Promise<TItem[]> {
  const booleans = await mapAsync(items, predicate, signal);
  return items.filter((_, index) => booleans[index]);
}

/**
 * Find first item matching async predicate
 */
export async function findAsync<TItem>(
  items: TItem[],
  predicate: (item: TItem, signal: AbortSignal, index: number) => Promise<boolean>,
  signal?: AbortSignal
): Promise<TItem | undefined> {
  const controller = new AbortController();

  if (signal) {
    signal.addEventListener('abort', () => {
      controller.abort(signal.reason);
    }, { once: true });
  }

  for (let i = 0; i < items.length; i++) {
    if (controller.signal.aborted) {
      throw controller.signal.reason ?? createAbortError();
    }

    const item = items[i]!;
    if (await predicate(item, controller.signal, i)) {
      return item;
    }
  }

  return undefined;
}
