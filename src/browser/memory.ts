/**
 * Memory pressure-based abort signals
 */

// Type for performance.memory (Chrome-specific)
interface PerformanceMemory {
  jsHeapSizeLimit: number;
  totalJSHeapSize: number;
  usedJSHeapSize: number;
}

interface PerformanceWithMemory extends Performance {
  memory?: PerformanceMemory;
}

export interface MemoryInfo {
  used: number;
  total: number;
  limit: number;
  percentage: number;
}

/**
 * Create a signal that aborts when memory usage exceeds threshold.
 * Uses Chrome's performance.memory API (non-standard).
 *
 * @param threshold - Usage threshold (0-1, default: 0.9 = 90%)
 * @param options - Configuration options
 * @returns An AbortSignal
 *
 * @example
 * ```typescript
 * // Abort when memory usage exceeds 90%
 * const signal = memoryPressureSignal(0.9);
 *
 * // Use for memory-intensive operations
 * await processLargeDataset(data, { signal });
 * ```
 */
export function memoryPressureSignal(
  threshold = 0.9,
  options?: {
    /** Check interval in ms (default: 1000) */
    checkInterval?: number;
    /** Signal to cancel monitoring */
    signal?: AbortSignal;
  }
): AbortSignal {
  const controller = new AbortController();
  const checkInterval = options?.checkInterval ?? 1000;

  // Check if memory API is available
  const perf = typeof performance !== 'undefined'
    ? (performance as PerformanceWithMemory)
    : undefined;

  if (!perf?.memory) {
    // Not supported (Firefox, Safari, etc.)
    return controller.signal;
  }

  let intervalId: ReturnType<typeof setInterval> | undefined;

  const check = (): boolean => {
    const memory = perf.memory;
    if (!memory) return false;

    const used = memory.usedJSHeapSize;
    const limit = memory.jsHeapSizeLimit;
    const percentage = limit > 0 ? used / limit : 0;

    if (percentage >= threshold) {
      controller.abort({
        type: 'memory_pressure',
        used,
        total: memory.totalJSHeapSize,
        limit,
        percentage,
        threshold,
      });
      return true;
    }

    return false;
  };

  // Initial check
  if (check()) {
    return controller.signal;
  }

  // Periodic monitoring
  intervalId = setInterval(() => {
    check();
  }, checkInterval);

  // Cleanup on abort
  const cleanup = () => {
    if (intervalId !== undefined) {
      clearInterval(intervalId);
      intervalId = undefined;
    }
  };

  controller.signal.addEventListener('abort', cleanup, { once: true });

  // External signal can cancel monitoring
  if (options?.signal) {
    options.signal.addEventListener(
      'abort',
      () => {
        cleanup();
        controller.abort(options.signal?.reason);
      },
      { once: true }
    );
  }

  return controller.signal;
}

/**
 * Get current memory usage info (Chrome only)
 *
 * @returns Memory info or null if not supported
 */
export function getMemoryInfo(): MemoryInfo | null {
  const perf = typeof performance !== 'undefined'
    ? (performance as PerformanceWithMemory)
    : undefined;

  if (!perf?.memory) {
    return null;
  }

  const memory = perf.memory;

  return {
    used: memory.usedJSHeapSize,
    total: memory.totalJSHeapSize,
    limit: memory.jsHeapSizeLimit,
    percentage: memory.jsHeapSizeLimit > 0
      ? memory.usedJSHeapSize / memory.jsHeapSizeLimit
      : 0,
  };
}

/**
 * Check if memory is under pressure
 *
 * @param threshold - Threshold to check (0-1)
 * @returns True if memory usage exceeds threshold
 */
export function isMemoryPressure(threshold = 0.9): boolean {
  const info = getMemoryInfo();
  if (!info) return false;
  return info.percentage >= threshold;
}

/**
 * Check if memory API is supported
 */
export function isMemoryApiSupported(): boolean {
  const perf = typeof performance !== 'undefined'
    ? (performance as PerformanceWithMemory)
    : undefined;
  return perf?.memory !== undefined;
}
