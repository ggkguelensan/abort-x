/**
 * Storage quota-based abort signals
 */

export interface StorageQuotaInfo {
  usage: number;
  quota: number;
  percentage: number;
}

/**
 * Create a signal that aborts when storage usage exceeds threshold.
 *
 * @param threshold - Usage threshold (0-1, default: 0.9 = 90%)
 * @param options - Configuration options
 * @returns An AbortSignal
 *
 * @example
 * ```typescript
 * // Abort when storage is 90% full
 * const signal = await storageQuotaSignal(0.9);
 *
 * // Use for large file operations
 * await downloadLargeFile(url, { signal });
 * ```
 */
export async function storageQuotaSignal(
  threshold = 0.9,
  options?: {
    /** Check interval in ms (default: 5000) */
    checkInterval?: number;
    /** Signal to cancel monitoring */
    signal?: AbortSignal;
  }
): Promise<AbortSignal> {
  const controller = new AbortController();
  const checkInterval = options?.checkInterval ?? 5000;

  // Check if Storage API is available
  if (typeof navigator === 'undefined' || !('storage' in navigator)) {
    // Not supported, return signal that never aborts
    return controller.signal;
  }

  const storage = navigator.storage;

  if (!('estimate' in storage)) {
    return controller.signal;
  }

  let intervalId: ReturnType<typeof setInterval> | undefined;

  const check = async (): Promise<boolean> => {
    try {
      const estimate = await storage.estimate();
      const usage = estimate.usage ?? 0;
      const quota = estimate.quota ?? 0;

      if (quota === 0) return false;

      const percentage = usage / quota;

      if (percentage >= threshold) {
        controller.abort({
          type: 'storage_quota_exceeded',
          usage,
          quota,
          percentage,
          threshold,
        });
        return true;
      }
    } catch {
      // Ignore errors
    }
    return false;
  };

  // Initial check
  const exceeded = await check();
  if (exceeded) {
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
 * Get current storage usage info
 *
 * @returns Storage quota information or null if not supported
 */
export async function getStorageInfo(): Promise<StorageQuotaInfo | null> {
  if (typeof navigator === 'undefined' || !('storage' in navigator)) {
    return null;
  }

  const storage = navigator.storage;

  if (!('estimate' in storage)) {
    return null;
  }

  try {
    const estimate = await storage.estimate();
    const usage = estimate.usage ?? 0;
    const quota = estimate.quota ?? 0;

    return {
      usage,
      quota,
      percentage: quota > 0 ? usage / quota : 0,
    };
  } catch {
    return null;
  }
}

/**
 * Check if storage is near quota
 *
 * @param threshold - Threshold to check (0-1)
 * @returns True if storage usage exceeds threshold
 */
export async function isStorageNearQuota(threshold = 0.9): Promise<boolean> {
  const info = await getStorageInfo();
  if (!info) return false;
  return info.percentage >= threshold;
}
