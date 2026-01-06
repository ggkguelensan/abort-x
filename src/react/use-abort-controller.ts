/**
 * React hook for AbortController
 */

import { useRef, useEffect, useCallback } from 'react';

/**
 * React hook that creates an AbortController that automatically aborts on unmount.
 *
 * @returns AbortController instance
 *
 * @example
 * ```tsx
 * function UserProfile({ userId }) {
 *   const controller = useAbortController();
 *
 *   useEffect(() => {
 *     fetchUser(userId, controller.signal);
 *   }, [userId, controller.signal]);
 *
 *   return (
 *     <button onClick={() => controller.abort()}>
 *       Cancel
 *     </button>
 *   );
 * }
 * ```
 */
export function useAbortController(): AbortController {
  const controllerRef = useRef<AbortController | null>(null);

  // Create controller lazily
  if (controllerRef.current === null) {
    controllerRef.current = new AbortController();
  }

  // Abort on unmount
  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
    };
  }, []);

  return controllerRef.current;
}

/**
 * React hook that creates an AbortController that resets when dependencies change.
 *
 * @param deps - Dependencies that trigger a new controller
 * @returns AbortController instance
 *
 * @example
 * ```tsx
 * function UserProfile({ userId }) {
 *   const controller = useAbortControllerEffect([userId]);
 *
 *   useEffect(() => {
 *     fetchUser(userId, controller.signal);
 *   }, [userId, controller]);
 *
 *   return <div>...</div>;
 * }
 * ```
 */
export function useAbortControllerEffect(
  deps: React.DependencyList
): AbortController {
  const controllerRef = useRef<AbortController | null>(null);

  // Create new controller when deps change
  useEffect(() => {
    // Abort previous
    if (controllerRef.current) {
      controllerRef.current.abort();
    }

    // Create new
    controllerRef.current = new AbortController();

    return () => {
      controllerRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // Initialize on first render
  if (controllerRef.current === null) {
    controllerRef.current = new AbortController();
  }

  return controllerRef.current;
}

/**
 * React hook that provides an abort signal that auto-aborts on unmount.
 *
 * @returns AbortSignal
 *
 * @example
 * ```tsx
 * function DataFetcher() {
 *   const signal = useAbortSignal();
 *
 *   useEffect(() => {
 *     fetch('/api/data', { signal });
 *   }, [signal]);
 * }
 * ```
 */
export function useAbortSignal(): AbortSignal {
  const controller = useAbortController();
  return controller.signal;
}

/**
 * React hook that provides abort signal that resets with dependencies.
 *
 * @param deps - Dependencies that trigger a new signal
 * @returns AbortSignal
 */
export function useAbortSignalEffect(
  deps: React.DependencyList
): AbortSignal {
  const controller = useAbortControllerEffect(deps);
  return controller.signal;
}

/**
 * Creates a manual abort trigger function.
 *
 * @returns [signal, abort] tuple
 *
 * @example
 * ```tsx
 * function SearchForm() {
 *   const [signal, abort] = useAbortTrigger();
 *
 *   const search = async (query: string) => {
 *     abort(); // Cancel previous search
 *     await fetch(`/search?q=${query}`, { signal });
 *   };
 *
 *   return <input onChange={e => search(e.target.value)} />;
 * }
 * ```
 */
export function useAbortTrigger(): [AbortSignal, (reason?: unknown) => void] {
  const controllerRef = useRef<AbortController>(new AbortController());

  const abort = useCallback((reason?: unknown) => {
    controllerRef.current.abort(reason);
    controllerRef.current = new AbortController();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      controllerRef.current.abort();
    };
  }, []);

  return [controllerRef.current.signal, abort];
}
