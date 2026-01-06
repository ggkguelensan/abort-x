/**
 * Retry with exponential backoff
 */

import { abortSignalAny, abortSignalTimeout, createAbortError } from '../core/polyfills';
import { isAborted } from '../guards/is-aborted';

export type BackoffStrategy = 'exponential' | 'linear' | 'fixed';

export interface RetryOptions {
  /** Maximum number of attempts (default: 3) */
  attempts?: number;
  /** Backoff strategy (default: 'exponential') */
  backoff?: BackoffStrategy;
  /** Initial delay in ms (default: 1000) */
  initialDelay?: number;
  /** Maximum delay in ms (default: 30000) */
  maxDelay?: number;
  /** Timeout per attempt in ms (optional) */
  attemptTimeout?: number;
  /** External signal to abort all retries */
  signal?: AbortSignal;
  /** Callback called before each retry */
  onRetry?: (attempt: number, error: Error, nextDelay: number) => void;
  /** Predicate to determine if error should trigger retry */
  shouldRetry?: (error: Error) => boolean;
  /** Jitter factor (0-1) to randomize delays (default: 0) */
  jitter?: number;
}

export interface RetryResult<T> {
  value: T;
  attempts: number;
  totalTime: number;
}

/**
 * Calculate delay for a given attempt
 */
function calculateDelay(
  attempt: number,
  backoff: BackoffStrategy,
  initialDelay: number,
  maxDelay: number,
  jitter: number
): number {
  let delay: number;

  switch (backoff) {
    case 'exponential':
      delay = initialDelay * Math.pow(2, attempt);
      break;
    case 'linear':
      delay = initialDelay * (attempt + 1);
      break;
    case 'fixed':
    default:
      delay = initialDelay;
  }

  // Apply jitter
  if (jitter > 0) {
    const jitterAmount = delay * jitter * Math.random();
    delay = delay + jitterAmount - (jitterAmount / 2);
  }

  return Math.min(delay, maxDelay);
}

/**
 * Sleep with abort support
 */
async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    throw signal.reason ?? createAbortError();
  }

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(resolve, ms);

    if (signal) {
      const abortHandler = () => {
        clearTimeout(timeoutId);
        reject(signal.reason ?? createAbortError());
      };

      signal.addEventListener('abort', abortHandler, { once: true });

      // Cleanup listener when timeout fires
      const originalResolve = resolve;
      resolve = () => {
        signal.removeEventListener('abort', abortHandler);
        originalResolve();
      };
    }
  });
}

/**
 * Execute a function with retry logic and exponential backoff.
 *
 * @param fn - Function to execute (receives abort signal)
 * @param options - Retry configuration
 * @returns The function result
 *
 * @example
 * ```typescript
 * const data = await withRetry(
 *   (signal) => fetch('/api/data', { signal }).then(r => r.json()),
 *   {
 *     attempts: 3,
 *     backoff: 'exponential',
 *     initialDelay: 1000,
 *     onRetry: (attempt, error) => {
 *       console.log(`Retry ${attempt}:`, error.message);
 *     }
 *   }
 * );
 * ```
 */
export async function withRetry<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    attempts = 3,
    backoff = 'exponential',
    initialDelay = 1000,
    maxDelay = 30000,
    attemptTimeout,
    signal,
    onRetry,
    shouldRetry = () => true,
    jitter = 0,
  } = options;

  if (attempts < 1) {
    throw new Error('attempts must be at least 1');
  }

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < attempts; attempt++) {
    // Check if already aborted
    if (signal?.aborted) {
      throw signal.reason ?? createAbortError('Retry aborted');
    }

    try {
      // Create signal for this attempt
      let attemptSignal: AbortSignal;

      if (attemptTimeout && signal) {
        attemptSignal = abortSignalAny([
          signal,
          abortSignalTimeout(attemptTimeout),
        ]);
      } else if (attemptTimeout) {
        attemptSignal = abortSignalTimeout(attemptTimeout);
      } else if (signal) {
        attemptSignal = signal;
      } else {
        attemptSignal = new AbortController().signal;
      }

      return await fn(attemptSignal);

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry if:
      // 1. It's an abort error from external signal
      // 2. shouldRetry returns false
      // 3. This was the last attempt
      if (signal?.aborted) {
        throw error;
      }

      if (isAborted(error) && !attemptTimeout) {
        // Only re-throw abort if it wasn't from our timeout
        throw error;
      }

      if (!shouldRetry(lastError)) {
        throw error;
      }

      if (attempt < attempts - 1) {
        // Calculate delay for next retry
        const delay = calculateDelay(
          attempt,
          backoff,
          initialDelay,
          maxDelay,
          jitter
        );

        // Notify callback
        onRetry?.(attempt + 1, lastError, delay);

        // Wait before retry
        await sleep(delay, signal);
      }
    }
  }

  throw lastError ?? new Error('Retry failed');
}

/**
 * Create a retryable version of a function
 */
export function retryable<TArgs extends unknown[], TResult>(
  fn: (signal: AbortSignal, ...args: TArgs) => Promise<TResult>,
  options: RetryOptions = {}
): (signal: AbortSignal, ...args: TArgs) => Promise<TResult> {
  return (signal: AbortSignal, ...args: TArgs) =>
    withRetry(
      (attemptSignal) => fn(attemptSignal, ...args),
      { ...options, signal }
    );
}

/**
 * Retry with detailed result including attempt count and timing
 */
export async function withRetryResult<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const startTime = Date.now();
  let attemptCount = 0;

  const originalOnRetry = options.onRetry;

  const value = await withRetry(fn, {
    ...options,
    onRetry: (attempt, error, delay) => {
      attemptCount = attempt;
      originalOnRetry?.(attempt, error, delay);
    },
  });

  return {
    value,
    attempts: attemptCount + 1,
    totalTime: Date.now() - startTime,
  };
}
