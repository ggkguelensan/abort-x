/**
 * Debounce and throttle with abort support
 */

import { createAbortError } from '../core/polyfills';

/**
 * Debounced function interface
 */
export interface DebouncedFunction<TArgs extends unknown[], TResult> {
  /** Call the debounced function */
  (...args: TArgs): Promise<TResult>;
  /** Cancel pending execution */
  cancel: () => void;
  /** Execute immediately if pending */
  flush: () => Promise<TResult | undefined>;
  /** Check if there's a pending execution */
  pending: () => boolean;
}

/**
 * Debounce options
 */
export interface DebounceOptions {
  /** External signal to cancel all pending */
  signal?: AbortSignal;
  /** Execute on leading edge (default: false) */
  leading?: boolean;
  /** Execute on trailing edge (default: true) */
  trailing?: boolean;
  /** Maximum wait time before forced execution */
  maxWait?: number;
}

/**
 * Create a debounced version of an async function.
 * Later calls cancel earlier pending calls.
 *
 * @param fn - The function to debounce
 * @param ms - Debounce delay in milliseconds
 * @param options - Configuration options
 * @returns A debounced function
 *
 * @example
 * ```typescript
 * const search = debounce(
 *   async (query: string, signal: AbortSignal) => {
 *     const response = await fetch(`/search?q=${query}`, { signal });
 *     return response.json();
 *   },
 *   300
 * );
 *
 * // Later calls cancel earlier ones
 * search('h');      // cancelled
 * search('he');     // cancelled
 * search('hello');  // executes after 300ms
 *
 * // Cancel all pending
 * search.cancel();
 * ```
 */
export function debounce<TArgs extends unknown[], TResult>(
  fn: (...args: [...TArgs, AbortSignal]) => Promise<TResult>,
  ms: number,
  options: DebounceOptions = {}
): DebouncedFunction<TArgs, TResult> {
  const { signal: externalSignal, leading = false, trailing = true, maxWait } = options;

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let maxTimeoutId: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let pendingArgs: TArgs | undefined;
  let pendingResolve: ((value: TResult) => void) | undefined;
  let pendingReject: ((error: unknown) => void) | undefined;
  let lastCallTime: number | undefined;
  let lastInvokeTime = 0;
  let leadingInvoked = false;

  const cleanup = () => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
    if (maxTimeoutId !== undefined) {
      clearTimeout(maxTimeoutId);
      maxTimeoutId = undefined;
    }
  };

  const invoke = async (args: TArgs): Promise<TResult> => {
    lastInvokeTime = Date.now();
    controller = new AbortController();

    // Combine with external signal
    const signal = externalSignal
      ? combineSignals(externalSignal, controller.signal)
      : controller.signal;

    try {
      return await fn(...args, signal);
    } finally {
      controller = undefined;
    }
  };

  const trailingEdge = async () => {
    cleanup();

    if (trailing && pendingArgs !== undefined) {
      const args = pendingArgs;
      const resolve = pendingResolve;
      const reject = pendingReject;

      pendingArgs = undefined;
      pendingResolve = undefined;
      pendingReject = undefined;
      leadingInvoked = false;

      try {
        const result = await invoke(args);
        resolve?.(result);
      } catch (error) {
        reject?.(error);
      }
    }
  };

  const debounced = ((...args: TArgs): Promise<TResult> => {
    const now = Date.now();
    const isInvoking = shouldInvoke(now);
    lastCallTime = now;

    // Cancel previous pending call
    if (controller) {
      controller.abort(createAbortError('Debounced'));
    }

    // Reject previous promise
    if (pendingReject && pendingArgs !== undefined) {
      pendingReject(createAbortError('Debounced'));
    }

    return new Promise<TResult>((resolve, reject) => {
      pendingArgs = args;
      pendingResolve = resolve;
      pendingReject = reject;

      // Leading edge
      if (isInvoking && leading && !leadingInvoked) {
        leadingInvoked = true;
        invoke(args)
          .then(resolve)
          .catch(reject)
          .finally(() => {
            pendingArgs = undefined;
            pendingResolve = undefined;
            pendingReject = undefined;
          });
        return;
      }

      // Set up trailing edge timer
      cleanup();

      timeoutId = setTimeout(trailingEdge, ms);

      // Set up max wait timer
      if (maxWait !== undefined && maxTimeoutId === undefined) {
        const remaining = maxWait - (now - lastInvokeTime);
        if (remaining > 0) {
          maxTimeoutId = setTimeout(trailingEdge, remaining);
        }
      }
    });
  }) as DebouncedFunction<TArgs, TResult>;

  const shouldInvoke = (time: number): boolean => {
    const timeSinceLastCall = lastCallTime === undefined
      ? 0
      : time - lastCallTime;
    const timeSinceLastInvoke = time - lastInvokeTime;

    return (
      lastCallTime === undefined ||
      timeSinceLastCall >= ms ||
      timeSinceLastCall < 0 ||
      (maxWait !== undefined && timeSinceLastInvoke >= maxWait)
    );
  };

  debounced.cancel = () => {
    cleanup();

    if (controller) {
      controller.abort(createAbortError('Cancelled'));
      controller = undefined;
    }

    if (pendingReject) {
      pendingReject(createAbortError('Cancelled'));
    }

    pendingArgs = undefined;
    pendingResolve = undefined;
    pendingReject = undefined;
    leadingInvoked = false;
  };

  debounced.flush = async (): Promise<TResult | undefined> => {
    if (pendingArgs === undefined) {
      return undefined;
    }

    cleanup();

    const args = pendingArgs;
    const resolve = pendingResolve;
    const reject = pendingReject;

    pendingArgs = undefined;
    pendingResolve = undefined;
    pendingReject = undefined;
    leadingInvoked = false;

    try {
      const result = await invoke(args);
      resolve?.(result);
      return result;
    } catch (error) {
      reject?.(error);
      throw error;
    }
  };

  debounced.pending = (): boolean => {
    return pendingArgs !== undefined || timeoutId !== undefined;
  };

  // Cancel on external signal abort
  if (externalSignal) {
    externalSignal.addEventListener(
      'abort',
      () => {
        debounced.cancel();
      },
      { once: true }
    );
  }

  return debounced;
}

/**
 * Combine two signals (simplified version to avoid import)
 */
function combineSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  if (a.aborted) return a;
  if (b.aborted) return b;

  const controller = new AbortController();

  const abort = (signal: AbortSignal) => () => {
    controller.abort(signal.reason);
  };

  a.addEventListener('abort', abort(a), { once: true });
  b.addEventListener('abort', abort(b), { once: true });

  return controller.signal;
}

/**
 * Throttled function interface
 */
export interface ThrottledFunction<TArgs extends unknown[], TResult> {
  (...args: TArgs): Promise<TResult>;
  cancel: () => void;
  pending: () => boolean;
}

/**
 * Throttle options
 */
export interface ThrottleOptions {
  /** External signal to cancel */
  signal?: AbortSignal;
  /** Execute on leading edge (default: true) */
  leading?: boolean;
  /** Execute on trailing edge (default: true) */
  trailing?: boolean;
}

/**
 * Create a throttled version of an async function.
 * Executes at most once per time window.
 *
 * @param fn - The function to throttle
 * @param ms - Minimum time between executions
 * @param options - Configuration options
 * @returns A throttled function
 *
 * @example
 * ```typescript
 * const saveProgress = throttle(
 *   async (data: Data, signal: AbortSignal) => {
 *     await api.save(data, { signal });
 *   },
 *   1000 // At most once per second
 * );
 * ```
 */
export function throttle<TArgs extends unknown[], TResult>(
  fn: (...args: [...TArgs, AbortSignal]) => Promise<TResult>,
  ms: number,
  options: ThrottleOptions = {}
): ThrottledFunction<TArgs, TResult> {
  const { signal, leading = true, trailing = true } = options;

  // Build debounce options, only including signal if defined
  const debounceOptions: DebounceOptions = {
    leading,
    trailing,
    maxWait: ms,
  };
  if (signal) {
    debounceOptions.signal = signal;
  }

  // Throttle is debounce with maxWait = ms and specific leading/trailing
  const debounced = debounce(fn, ms, debounceOptions);

  // Create a proper throttled function that forwards calls
  const throttled = ((...args: TArgs) => debounced(...args)) as ThrottledFunction<TArgs, TResult>;
  throttled.pending = debounced.pending;
  throttled.cancel = debounced.cancel;

  return throttled;
}
