/**
 * TanStack Query (React Query) integration helpers
 *
 * Solves:
 * - Case #5: Mutations don't auto-cancel on unmount
 * - Case #6: Complex manual mutation cancellation
 * - Case #7: Optimistic updates and cancelled mutations
 * - Case #8: No built-in way to link cancellation to UI
 * - Case #16: No distinction between abort and network error
 * - Case #17-18: Retry after cancellation
 * - Case #26: Logging cancelled requests
 */

import { SoftAbortController } from '../core/soft-abort';
import { AbortRegistry } from '../patterns/registry';
import { isAborted, isTimeout } from '../guards/is-aborted';
import { abortSignalTimeout, createAbortError } from '../core/polyfills';

// ============================================================================
// Types
// ============================================================================

export interface QueryFnContext {
  signal: AbortSignal;
  queryKey: readonly unknown[];
  meta?: Record<string, unknown>;
}

export interface MutationContext {
  signal?: AbortSignal;
}

export type QueryFn<TData> = (context: QueryFnContext) => Promise<TData>;
export type MutationFn<TData, TVariables> = (
  variables: TVariables,
  context: MutationContext
) => Promise<TData>;

export interface CancellableQueryOptions {
  /** Timeout in milliseconds */
  timeout?: number;
  /** Tags for registry grouping */
  tags?: string[];
  /** Registry to use (defaults to creating internal one) */
  registry?: AbortRegistry;
  /** Whether to use soft abort on component unmount */
  softAbortOnUnmount?: boolean;
}

export interface CancellableMutationOptions<TVariables = unknown> {
  /** Timeout in milliseconds */
  timeout?: number;
  /** Whether to auto-cancel on unmount */
  cancelOnUnmount?: boolean;
  /** What to do on abort: 'rollback' | 'keep' | custom function */
  onAbort?: 'rollback' | 'keep' | ((variables: TVariables) => 'rollback' | 'keep');
}

export interface CancellableQueryResult<TData> {
  /** The query function to pass to useQuery */
  queryFn: QueryFn<TData>;
  /** Cancel the current query */
  cancel: (reason?: string) => void;
  /** Soft cancel (continue but mark as cancelled) */
  softCancel: (reason?: string) => void;
  /** Check if currently cancelled */
  isCancelled: () => boolean;
}

export interface CancellableMutationResult<TData, TVariables> {
  /** The mutation function */
  mutationFn: MutationFn<TData, TVariables>;
  /** Cancel the current mutation */
  cancel: (reason?: string) => void;
  /** Get the current abort controller (for UI binding) */
  getController: () => AbortController | null;
  /** Check if currently cancelled */
  isCancelled: () => boolean;
  /** Reset state for new mutation */
  reset: () => void;
}

// ============================================================================
// Query Helpers
// ============================================================================

/**
 * Create a cancellable query function with enhanced abort support
 *
 * @example
 * ```tsx
 * const { queryFn, cancel, softCancel } = createCancellableQuery(
 *   async (signal) => {
 *     const response = await fetch('/api/users', { signal });
 *     return response.json();
 *   },
 *   { timeout: 10000, tags: ['users'] }
 * );
 *
 * // In component
 * const { data } = useQuery({
 *   queryKey: ['users'],
 *   queryFn,
 * });
 *
 * // Cancel button
 * <button onClick={() => cancel('user_cancelled')}>Cancel</button>
 *
 * // Soft cancel (e.g., on tab switch - allow background caching)
 * <button onClick={() => softCancel('tab_switch')}>Soft Cancel</button>
 * ```
 */
export function createCancellableQuery<TData>(
  fn: (signal: AbortSignal, context: QueryFnContext) => Promise<TData>,
  options: CancellableQueryOptions = {}
): CancellableQueryResult<TData> {
  const { timeout, tags, registry, softAbortOnUnmount } = options;

  let currentController: SoftAbortController | null = null;
  const internalRegistry = registry ?? new AbortRegistry();

  const queryFn: QueryFn<TData> = async (context) => {
    // Create new controller for this request
    currentController = new SoftAbortController();
    const signal = currentController.signal;

    // Combine with React Query's signal
    const combinedController = new AbortController();

    // Listen to React Query's signal
    context.signal.addEventListener('abort', () => {
      if (softAbortOnUnmount) {
        currentController?.softAbort('unmount');
      } else {
        combinedController.abort(context.signal.reason);
      }
    });

    // Listen to our signal
    signal.addEventListener('abort', () => {
      combinedController.abort(signal.reason);
    });

    // Add timeout if specified
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (timeout) {
      timeoutId = setTimeout(() => {
        combinedController.abort(createAbortError('timeout'));
      }, timeout);
    }

    // Register with tags
    const queryId = JSON.stringify(context.queryKey);
    if (tags) {
      internalRegistry.register(queryId, { tags, parent: combinedController.signal });
    }

    try {
      return await fn(combinedController.signal, context);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      currentController = null;
      if (tags) internalRegistry.unregister(queryId);
    }
  };

  return {
    queryFn,
    cancel: (reason?: string) => {
      currentController?.hardAbort(reason);
    },
    softCancel: (reason?: string) => {
      currentController?.softAbort(reason);
    },
    isCancelled: () => {
      return currentController?.signal.aborted ?? false;
    },
  };
}

/**
 * Create a query function with automatic timeout
 *
 * @example
 * ```tsx
 * useQuery({
 *   queryKey: ['data'],
 *   queryFn: withTimeout(5000, async (signal) => {
 *     return fetch('/api/data', { signal }).then(r => r.json());
 *   }),
 * });
 * ```
 */
export function withQueryTimeout<TData>(
  ms: number,
  fn: (signal: AbortSignal) => Promise<TData>
): QueryFn<TData> {
  return async ({ signal }) => {
    const timeoutSignal = abortSignalTimeout(ms);

    // Combine signals
    const controller = new AbortController();
    const combinedSignal = controller.signal;

    signal.addEventListener('abort', () => controller.abort(signal.reason));
    timeoutSignal.addEventListener('abort', () =>
      controller.abort(createAbortError('Query timeout'))
    );

    return fn(combinedSignal);
  };
}

// ============================================================================
// Mutation Helpers
// ============================================================================

/**
 * Create a cancellable mutation with enhanced abort support
 *
 * @example
 * ```tsx
 * const { mutationFn, cancel, getController } = createCancellableMutation(
 *   async (data, signal) => {
 *     const response = await fetch('/api/posts', {
 *       method: 'POST',
 *       body: JSON.stringify(data),
 *       signal,
 *     });
 *     return response.json();
 *   },
 *   { cancelOnUnmount: true, onAbort: 'rollback' }
 * );
 *
 * const mutation = useMutation({ mutationFn });
 *
 * // Cancel button in UI
 * <button onClick={cancel} disabled={!getController()}>
 *   Cancel Upload
 * </button>
 * ```
 */
export function createCancellableMutation<TData, TVariables>(
  fn: (variables: TVariables, signal: AbortSignal) => Promise<TData>,
  options: CancellableMutationOptions<TVariables> = {}
): CancellableMutationResult<TData, TVariables> {
  const { timeout, cancelOnUnmount = false } = options;

  let currentController: AbortController | null = null;

  const mutationFn: MutationFn<TData, TVariables> = async (variables, context) => {
    // Create new controller
    currentController = new AbortController();
    const signal = currentController.signal;

    // Combine with context signal if provided
    const combinedController = new AbortController();

    if (context.signal) {
      context.signal.addEventListener('abort', () => {
        if (cancelOnUnmount) {
          combinedController.abort(context.signal!.reason);
        }
      });
    }

    signal.addEventListener('abort', () => {
      combinedController.abort(signal.reason);
    });

    // Add timeout
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (timeout) {
      timeoutId = setTimeout(() => {
        combinedController.abort(createAbortError('Mutation timeout'));
      }, timeout);
    }

    try {
      return await fn(variables, combinedController.signal);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      currentController = null;
    }
  };

  return {
    mutationFn,
    cancel: (reason?: string) => {
      currentController?.abort(createAbortError(reason));
    },
    getController: () => currentController,
    isCancelled: () => currentController?.signal.aborted ?? false,
    reset: () => {
      currentController = null;
    },
  };
}

// ============================================================================
// Error Handling Helpers
// ============================================================================

/**
 * Check if error is abort-related (for filtering in onError)
 *
 * @example
 * ```tsx
 * const queryClient = new QueryClient({
 *   defaultOptions: {
 *     queries: {
 *       onError: (error) => {
 *         if (!isAbortRelatedError(error)) {
 *           logError(error);
 *         }
 *       },
 *     },
 *   },
 * });
 * ```
 */
export function isAbortRelatedError(error: unknown): boolean {
  return isAborted(error) || isTimeout(error);
}

/**
 * Retry function that skips AbortError
 *
 * @example
 * ```tsx
 * useQuery({
 *   queryKey: ['data'],
 *   queryFn: fetchData,
 *   retry: skipAbortRetry(3),
 * });
 * ```
 */
export function skipAbortRetry(
  maxRetries: number
): (failureCount: number, error: unknown) => boolean {
  return (failureCount, error) => {
    if (isAbortRelatedError(error)) return false;
    return failureCount < maxRetries;
  };
}

/**
 * Create throwOnError function that ignores AbortError
 *
 * @example
 * ```tsx
 * useQuery({
 *   queryKey: ['data'],
 *   queryFn: fetchData,
 *   throwOnError: throwOnErrorIgnoreAbort,
 * });
 * ```
 */
export function throwOnErrorIgnoreAbort(error: unknown): boolean {
  return !isAbortRelatedError(error);
}

// ============================================================================
// Hooks Utilities (for use with React)
// ============================================================================

/**
 * Options for useAbortableMutation hook wrapper
 */
export interface UseAbortableMutationOptions<TData, TVariables> {
  mutationFn: (variables: TVariables, signal: AbortSignal) => Promise<TData>;
  timeout?: number;
  onAbort?: 'rollback' | 'keep';
}

/**
 * Create mutation options with built-in cancellation support
 *
 * @example
 * ```tsx
 * // In your component
 * const [controller, setController] = useState<AbortController | null>(null);
 *
 * const mutation = useMutation({
 *   ...createMutationOptions({
 *     mutationFn: async (data, signal) => postData(data, signal),
 *     onMutate: (_, ctrl) => setController(ctrl),
 *     onSettled: () => setController(null),
 *   }),
 *   onSuccess: (data) => { ... },
 * });
 *
 * // Cancel button
 * <button onClick={() => controller?.abort()}>Cancel</button>
 * ```
 */
export function createMutationOptions<TData, TVariables, TContext = unknown>(options: {
  mutationFn: (variables: TVariables, signal: AbortSignal) => Promise<TData>;
  timeout?: number;
  onMutate?: (variables: TVariables, controller: AbortController) => Promise<TContext> | TContext;
  onSettled?: () => void;
}) {
  const { mutationFn, timeout, onMutate, onSettled } = options;

  let currentController: AbortController | null = null;

  return {
    mutationFn: async (variables: TVariables): Promise<TData> => {
      currentController = new AbortController();
      const signal = currentController.signal;

      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      if (timeout) {
        timeoutId = setTimeout(() => {
          currentController?.abort(createAbortError('Mutation timeout'));
        }, timeout);
      }

      try {
        return await mutationFn(variables, signal);
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
        currentController = null;
      }
    },
    onMutate: async (variables: TVariables) => {
      currentController = new AbortController();
      if (onMutate) {
        return onMutate(variables, currentController);
      }
      return undefined as TContext;
    },
    onSettled: () => {
      currentController = null;
      onSettled?.();
    },
  };
}

// ============================================================================
// Infinite Query Helpers
// ============================================================================

/**
 * Registry for managing infinite query page requests
 *
 * @example
 * ```tsx
 * const pageRegistry = createInfiniteQueryRegistry('posts');
 *
 * useInfiniteQuery({
 *   queryKey: ['posts'],
 *   queryFn: ({ pageParam, signal }) => {
 *     const pageSignal = pageRegistry.registerPage(pageParam);
 *     // Combine signals
 *     return fetchPosts(pageParam, combineSignals(signal, pageSignal));
 *   },
 * });
 *
 * // Cancel specific page
 * pageRegistry.cancelPage(2);
 *
 * // Cancel all pages
 * pageRegistry.cancelAll();
 * ```
 */
export function createInfiniteQueryRegistry(queryKey: string) {
  const registry = new AbortRegistry();

  return {
    registerPage: (pageParam: unknown): AbortSignal => {
      const pageId = `${queryKey}:page:${JSON.stringify(pageParam)}`;
      return registry.register(pageId, {
        tags: [queryKey, `${queryKey}:page`],
      });
    },
    cancelPage: (pageParam: unknown, reason?: string): boolean => {
      const pageId = `${queryKey}:page:${JSON.stringify(pageParam)}`;
      return registry.abort(pageId, reason);
    },
    cancelAllPages: (reason?: string): number => {
      return registry.abortByTag(`${queryKey}:page`, { reason });
    },
    cancelAll: (reason?: string): number => {
      return registry.abortByTag(queryKey, { reason });
    },
    isPageActive: (pageParam: unknown): boolean => {
      const pageId = `${queryKey}:page:${JSON.stringify(pageParam)}`;
      return registry.isActive(pageId);
    },
  };
}
