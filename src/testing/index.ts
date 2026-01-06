/**
 * Testing utilities for abort-x
 *
 * Solves:
 * - Case #27: Mocking AbortController in tests
 * - Case #28: Race conditions in tests
 * - Case #29: Complex testing of infinite query cancellation
 */

import { createAbortError, createTimeoutError } from '../core/polyfills';

// ============================================================================
// Mock AbortController
// ============================================================================

export interface MockAbortController extends AbortController {
  /** Simulate abort after delay */
  abortAfter: (ms: number, reason?: unknown) => void;
  /** Simulate timeout */
  timeout: (ms: number) => void;
  /** Get abort history */
  readonly abortHistory: Array<{ timestamp: number; reason: unknown }>;
  /** Reset mock state */
  reset: () => void;
}

/**
 * Create a mock AbortController for testing
 *
 * @example
 * ```ts
 * test('handles abort', async () => {
 *   const controller = createMockAbortController();
 *
 *   const promise = fetchWithSignal(controller.signal);
 *
 *   // Simulate abort after 100ms
 *   controller.abortAfter(100);
 *
 *   await expect(promise).rejects.toThrow('AbortError');
 *   expect(controller.abortHistory).toHaveLength(1);
 * });
 * ```
 */
export function createMockAbortController(): MockAbortController {
  const controller = new AbortController() as MockAbortController;
  const abortHistory: Array<{ timestamp: number; reason: unknown }> = [];
  const timeouts: ReturnType<typeof setTimeout>[] = [];

  const originalAbort = controller.abort.bind(controller);

  controller.abort = function (reason?: unknown) {
    abortHistory.push({ timestamp: Date.now(), reason });
    originalAbort(reason);
  };

  controller.abortAfter = function (ms: number, reason?: unknown) {
    const timeoutId = setTimeout(() => {
      controller.abort(reason ?? createAbortError('Mock abort'));
    }, ms);
    timeouts.push(timeoutId);
  };

  controller.timeout = function (ms: number) {
    const timeoutId = setTimeout(() => {
      controller.abort(createTimeoutError(ms));
    }, ms);
    timeouts.push(timeoutId);
  };

  Object.defineProperty(controller, 'abortHistory', {
    get: () => [...abortHistory],
  });

  controller.reset = function () {
    abortHistory.length = 0;
    timeouts.forEach(clearTimeout);
    timeouts.length = 0;
  };

  return controller;
}

// ============================================================================
// Test Signal Utilities
// ============================================================================

/**
 * Create an already-aborted signal for testing error paths
 *
 * @example
 * ```ts
 * test('handles pre-aborted signal', async () => {
 *   const signal = createAbortedSignal('test reason');
 *
 *   await expect(fetchData(signal)).rejects.toThrow();
 * });
 * ```
 */
export function createAbortedSignal(reason?: unknown): AbortSignal {
  const controller = new AbortController();
  controller.abort(reason ?? createAbortError('Pre-aborted'));
  return controller.signal;
}

/**
 * Create a signal that aborts after a delay
 *
 * @example
 * ```ts
 * test('handles delayed abort', async () => {
 *   const signal = createDelayedAbortSignal(100);
 *
 *   const result = await Promise.race([
 *     fetchData(signal),
 *     new Promise((_, reject) => {
 *       signal.addEventListener('abort', () => reject(signal.reason));
 *     }),
 *   ]);
 * });
 * ```
 */
export function createDelayedAbortSignal(ms: number, reason?: unknown): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => {
    controller.abort(reason ?? createAbortError('Delayed abort'));
  }, ms);
  return controller.signal;
}

/**
 * Create a signal that times out after a delay
 */
export function createTimeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => {
    controller.abort(createTimeoutError(ms));
  }, ms);
  return controller.signal;
}

/**
 * Create a signal that never aborts (for testing happy paths)
 */
export function createNeverAbortSignal(): AbortSignal {
  return new AbortController().signal;
}

// ============================================================================
// Async Test Helpers
// ============================================================================

/**
 * Wait for abort event on signal
 *
 * @example
 * ```ts
 * test('aborts on unmount', async () => {
 *   const controller = new AbortController();
 *   const abortPromise = waitForAbort(controller.signal);
 *
 *   // Trigger unmount
 *   unmount();
 *
 *   const reason = await abortPromise;
 *   expect(reason).toBeDefined();
 * });
 * ```
 */
export function waitForAbort(signal: AbortSignal, timeout = 5000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      resolve(signal.reason);
      return;
    }

    const timeoutId = setTimeout(() => {
      reject(new Error(`Timeout waiting for abort after ${timeout}ms`));
    }, timeout);

    signal.addEventListener('abort', () => {
      clearTimeout(timeoutId);
      resolve(signal.reason);
    });
  });
}

/**
 * Assert that a signal is aborted within a timeout
 *
 * @example
 * ```ts
 * test('cancels request', async () => {
 *   const controller = new AbortController();
 *
 *   startRequest(controller.signal);
 *   controller.abort();
 *
 *   await expectAborted(controller.signal);
 * });
 * ```
 */
export async function expectAborted(
  signal: AbortSignal,
  timeout = 100
): Promise<void> {
  if (signal.aborted) return;

  await new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Expected signal to be aborted within ${timeout}ms`));
    }, timeout);

    signal.addEventListener('abort', () => {
      clearTimeout(timeoutId);
      resolve();
    });
  });
}

/**
 * Assert that a signal is NOT aborted within a timeout
 */
export async function expectNotAborted(
  signal: AbortSignal,
  timeout = 100
): Promise<void> {
  if (signal.aborted) {
    throw new Error('Expected signal to not be aborted, but it was');
  }

  await new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(resolve, timeout);

    signal.addEventListener('abort', () => {
      clearTimeout(timeoutId);
      reject(new Error(`Expected signal to not be aborted within ${timeout}ms`));
    });
  });
}

// ============================================================================
// Race Condition Testing
// ============================================================================

export interface RaceConditionTest {
  /** Start a "request" that can be aborted */
  startRequest: (id: string, signal: AbortSignal) => Promise<string>;
  /** Get completed request IDs in order */
  getCompletedOrder: () => string[];
  /** Get aborted request IDs */
  getAbortedIds: () => string[];
  /** Reset state */
  reset: () => void;
}

/**
 * Create a race condition testing harness
 *
 * @example
 * ```ts
 * test('cancels stale requests', async () => {
 *   const race = createRaceConditionTest();
 *   const controllers: AbortController[] = [];
 *
 *   // Simulate rapid requests
 *   for (let i = 0; i < 5; i++) {
 *     // Cancel previous
 *     controllers[controllers.length - 1]?.abort();
 *
 *     const controller = new AbortController();
 *     controllers.push(controller);
 *
 *     race.startRequest(`req-${i}`, controller.signal);
 *   }
 *
 *   // Wait for last request
 *   await vi.advanceTimersByTimeAsync(100);
 *
 *   expect(race.getCompletedOrder()).toEqual(['req-4']);
 *   expect(race.getAbortedIds()).toEqual(['req-0', 'req-1', 'req-2', 'req-3']);
 * });
 * ```
 */
export function createRaceConditionTest(requestDelay = 50): RaceConditionTest {
  const completedOrder: string[] = [];
  const abortedIds: string[] = [];
  const pendingRequests = new Map<string, { resolve: (value: string) => void }>();

  return {
    startRequest: (id: string, signal: AbortSignal) => {
      return new Promise<string>((resolve, reject) => {
        if (signal.aborted) {
          abortedIds.push(id);
          reject(signal.reason);
          return;
        }

        const timeoutId = setTimeout(() => {
          if (signal.aborted) {
            abortedIds.push(id);
            reject(signal.reason);
          } else {
            completedOrder.push(id);
            resolve(id);
          }
          pendingRequests.delete(id);
        }, requestDelay);

        signal.addEventListener('abort', () => {
          clearTimeout(timeoutId);
          abortedIds.push(id);
          pendingRequests.delete(id);
          reject(signal.reason);
        });

        pendingRequests.set(id, { resolve });
      });
    },
    getCompletedOrder: () => [...completedOrder],
    getAbortedIds: () => [...abortedIds],
    reset: () => {
      completedOrder.length = 0;
      abortedIds.length = 0;
      pendingRequests.clear();
    },
  };
}

// ============================================================================
// Infinite Query Testing
// ============================================================================

export interface PageRequest {
  pageParam: number;
  signal: AbortSignal;
  startTime: number;
}

export interface InfiniteQueryTestHarness {
  /** Simulate fetching a page */
  fetchPage: (pageParam: number, signal: AbortSignal) => Promise<{ data: unknown[]; nextPage: number | null }>;
  /** Get all page requests */
  getRequests: () => PageRequest[];
  /** Get aborted page numbers */
  getAbortedPages: () => number[];
  /** Get completed page numbers */
  getCompletedPages: () => number[];
  /** Set page delay */
  setPageDelay: (pageParam: number, delay: number) => void;
  /** Reset state */
  reset: () => void;
}

/**
 * Create a testing harness for infinite queries
 *
 * @example
 * ```ts
 * test('cancels specific pages', async () => {
 *   const harness = createInfiniteQueryTestHarness();
 *   harness.setPageDelay(2, 500); // Page 2 is slow
 *
 *   const controller1 = new AbortController();
 *   const controller2 = new AbortController();
 *
 *   harness.fetchPage(1, controller1.signal);
 *   harness.fetchPage(2, controller2.signal);
 *   harness.fetchPage(3, controller1.signal);
 *
 *   // Cancel page 2
 *   controller2.abort();
 *
 *   await vi.advanceTimersByTimeAsync(200);
 *
 *   expect(harness.getCompletedPages()).toEqual([1, 3]);
 *   expect(harness.getAbortedPages()).toEqual([2]);
 * });
 * ```
 */
export function createInfiniteQueryTestHarness(
  defaultDelay = 50,
  pageSize = 10
): InfiniteQueryTestHarness {
  const requests: PageRequest[] = [];
  const abortedPages: number[] = [];
  const completedPages: number[] = [];
  const pageDelays = new Map<number, number>();

  return {
    fetchPage: async (pageParam: number, signal: AbortSignal) => {
      const request: PageRequest = {
        pageParam,
        signal,
        startTime: Date.now(),
      };
      requests.push(request);

      const delay = pageDelays.get(pageParam) ?? defaultDelay;

      return new Promise((resolve, reject) => {
        if (signal.aborted) {
          abortedPages.push(pageParam);
          reject(signal.reason);
          return;
        }

        const timeoutId = setTimeout(() => {
          if (signal.aborted) {
            abortedPages.push(pageParam);
            reject(signal.reason);
          } else {
            completedPages.push(pageParam);
            resolve({
              data: Array.from({ length: pageSize }, (_, i) => ({
                id: pageParam * pageSize + i,
              })),
              nextPage: pageParam < 10 ? pageParam + 1 : null,
            });
          }
        }, delay);

        signal.addEventListener('abort', () => {
          clearTimeout(timeoutId);
          abortedPages.push(pageParam);
          reject(signal.reason);
        });
      });
    },
    getRequests: () => [...requests],
    getAbortedPages: () => [...abortedPages],
    getCompletedPages: () => [...completedPages],
    setPageDelay: (pageParam: number, delay: number) => {
      pageDelays.set(pageParam, delay);
    },
    reset: () => {
      requests.length = 0;
      abortedPages.length = 0;
      completedPages.length = 0;
      pageDelays.clear();
    },
  };
}

// ============================================================================
// MSW Integration Helpers
// ============================================================================

/**
 * Create a delay that respects abort signal (for MSW handlers)
 *
 * @example
 * ```ts
 * // In MSW handler
 * http.get('/api/data', async ({ request }) => {
 *   await abortableDelay(1000, request.signal);
 *   return HttpResponse.json({ data: 'test' });
 * });
 * ```
 */
export function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }

    const timeoutId = setTimeout(resolve, ms);

    signal?.addEventListener('abort', () => {
      clearTimeout(timeoutId);
      reject(signal.reason);
    });
  });
}

/**
 * Create a mock fetch that tracks abort signals
 *
 * @example
 * ```ts
 * const mockFetch = createAbortTrackingFetch();
 *
 * // Use in test
 * global.fetch = mockFetch.fetch;
 *
 * await fetchData(controller.signal);
 * controller.abort();
 *
 * expect(mockFetch.getAbortedUrls()).toContain('/api/data');
 * ```
 */
export function createAbortTrackingFetch() {
  const requests: Array<{ url: string; signal?: AbortSignal }> = [];
  const abortedUrls: string[] = [];

  const mockFetch = async (url: string | URL | Request, init?: RequestInit) => {
    const urlString = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    const signal = init?.signal ?? undefined;

    const request: { url: string; signal?: AbortSignal } = { url: urlString };
    if (signal) {
      request.signal = signal;
    }
    requests.push(request);

    if (signal) {
      signal.addEventListener('abort', () => {
        abortedUrls.push(urlString);
      });
    }

    // Default mock response
    return new Response(JSON.stringify({ mock: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  return {
    fetch: mockFetch,
    getRequests: () => [...requests],
    getAbortedUrls: () => [...abortedUrls],
    reset: () => {
      requests.length = 0;
      abortedUrls.length = 0;
    },
  };
}
