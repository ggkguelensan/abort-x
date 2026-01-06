/**
 * React hook for abortable async operations
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { isAborted } from '../guards/is-aborted';

export interface UseAbortableAsyncOptions {
  /** Auto-abort when dependencies change */
  abortOnChange?: boolean;
}

export interface UseAbortableAsyncState<TResult> {
  /** Current data */
  data: TResult | undefined;
  /** Current error */
  error: Error | undefined;
  /** Loading state */
  loading: boolean;
  /** Whether the operation was aborted */
  aborted: boolean;
}

export interface UseAbortableAsyncActions<TArgs extends unknown[], TResult> {
  /** Execute the async function */
  execute: (...args: TArgs) => Promise<TResult | undefined>;
  /** Abort the current operation */
  abort: (reason?: unknown) => void;
  /** Reset state */
  reset: () => void;
}

export type UseAbortableAsyncReturn<TArgs extends unknown[], TResult> =
  UseAbortableAsyncState<TResult> & UseAbortableAsyncActions<TArgs, TResult>;

/**
 * React hook for managing abortable async operations.
 *
 * @param fn - Async function that receives an AbortSignal
 * @param options - Configuration options
 * @returns State and actions for the async operation
 *
 * @example
 * ```tsx
 * function UserProfile({ userId }) {
 *   const { data, loading, error, execute, abort } = useAbortableAsync(
 *     async (id: string, signal: AbortSignal) => {
 *       const response = await fetch(`/api/users/${id}`, { signal });
 *       return response.json();
 *     }
 *   );
 *
 *   useEffect(() => {
 *     execute(userId);
 *   }, [userId, execute]);
 *
 *   if (loading) return <div>Loading...</div>;
 *   if (error) return <div>Error: {error.message}</div>;
 *   if (data) return <div>{data.name}</div>;
 *   return null;
 * }
 * ```
 */
export function useAbortableAsync<TArgs extends unknown[], TResult>(
  fn: (...args: [...TArgs, AbortSignal]) => Promise<TResult>,
  options: UseAbortableAsyncOptions = {}
): UseAbortableAsyncReturn<TArgs, TResult> {
  const { abortOnChange = true } = options;

  const [state, setState] = useState<UseAbortableAsyncState<TResult>>({
    data: undefined,
    error: undefined,
    loading: false,
    aborted: false,
  });

  const controllerRef = useRef<AbortController | null>(null);
  const fnRef = useRef(fn);

  // Keep fn ref updated
  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  const abort = useCallback((reason?: unknown) => {
    if (controllerRef.current) {
      controllerRef.current.abort(reason);
      controllerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    abort();
    setState({
      data: undefined,
      error: undefined,
      loading: false,
      aborted: false,
    });
  }, [abort]);

  const execute = useCallback(
    async (...args: TArgs): Promise<TResult | undefined> => {
      // Abort previous if configured
      if (abortOnChange && controllerRef.current) {
        controllerRef.current.abort();
      }

      // Create new controller
      const controller = new AbortController();
      controllerRef.current = controller;

      setState((prev) => ({
        ...prev,
        loading: true,
        error: undefined,
        aborted: false,
      }));

      try {
        const result = await fnRef.current(...args, controller.signal);

        // Check if this is still the current operation
        if (controllerRef.current === controller) {
          setState({
            data: result,
            error: undefined,
            loading: false,
            aborted: false,
          });
          return result;
        }
      } catch (error) {
        // Check if this is still the current operation
        if (controllerRef.current === controller) {
          const wasAborted = isAborted(error);

          setState({
            data: undefined,
            error: wasAborted ? undefined : (error as Error),
            loading: false,
            aborted: wasAborted,
          });

          if (!wasAborted) {
            throw error;
          }
        }
      }

      return undefined;
    },
    [abortOnChange]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
    };
  }, []);

  return {
    ...state,
    execute,
    abort,
    reset,
  };
}

/**
 * Simplified version that auto-executes when deps change
 */
export function useAbortableFetch<TResult>(
  fn: (signal: AbortSignal) => Promise<TResult>,
  deps: React.DependencyList
): UseAbortableAsyncState<TResult> & { refetch: () => void } {
  const { data, loading, error, aborted, execute, abort } = useAbortableAsync(
    (signal: AbortSignal) => fn(signal)
  );

  useEffect(() => {
    execute();
    return () => abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return {
    data,
    loading,
    error,
    aborted,
    refetch: execute,
  };
}
