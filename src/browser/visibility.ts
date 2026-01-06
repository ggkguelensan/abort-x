/**
 * Page visibility-based abort signals
 */

export interface VisibilitySignalOptions {
  /** Abort when page becomes hidden (default: true) */
  abortOnHidden?: boolean;
  /** Abort when page becomes visible (default: false) */
  abortOnVisible?: boolean;
}

/**
 * Create a signal that aborts when the page visibility changes.
 *
 * @param options - Configuration options
 * @returns An AbortSignal
 *
 * @example
 * ```typescript
 * // Abort background tasks when tab is hidden
 * const signal = visibilitySignal();
 *
 * // Pause video processing when tab is hidden
 * await processVideo(url, { signal });
 * ```
 */
export function visibilitySignal(
  options?: VisibilitySignalOptions
): AbortSignal {
  const controller = new AbortController();
  const abortOnHidden = options?.abortOnHidden ?? true;
  const abortOnVisible = options?.abortOnVisible ?? false;

  if (typeof document === 'undefined') {
    return controller.signal;
  }

  // Check current state
  if (document.hidden && abortOnHidden) {
    controller.abort({
      type: 'page_hidden',
      visibilityState: document.visibilityState,
    });
    return controller.signal;
  }

  if (!document.hidden && abortOnVisible) {
    controller.abort({
      type: 'page_visible',
      visibilityState: document.visibilityState,
    });
    return controller.signal;
  }

  const handler = () => {
    if (document.hidden && abortOnHidden) {
      controller.abort({
        type: 'page_hidden',
        visibilityState: document.visibilityState,
        timestamp: Date.now(),
      });
    } else if (!document.hidden && abortOnVisible) {
      controller.abort({
        type: 'page_visible',
        visibilityState: document.visibilityState,
        timestamp: Date.now(),
      });
    }
  };

  document.addEventListener('visibilitychange', handler);

  controller.signal.addEventListener(
    'abort',
    () => {
      document.removeEventListener('visibilitychange', handler);
    },
    { once: true }
  );

  return controller.signal;
}

/**
 * Create a signal that aborts when the tab becomes hidden.
 * Convenience wrapper for visibilitySignal({ abortOnHidden: true }).
 */
export function hiddenSignal(): AbortSignal {
  return visibilitySignal({ abortOnHidden: true, abortOnVisible: false });
}

/**
 * Create a signal that aborts when the tab becomes visible.
 * Useful for resuming paused operations.
 */
export function visibleSignal(): AbortSignal {
  return visibilitySignal({ abortOnHidden: false, abortOnVisible: true });
}

/**
 * Wait for the page to become visible.
 *
 * @param signal - Optional abort signal
 * @returns Promise that resolves when visible
 */
export async function waitForVisible(signal?: AbortSignal): Promise<void> {
  if (typeof document === 'undefined') {
    return;
  }

  if (!document.hidden) {
    return;
  }

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }

    const visibilityHandler = () => {
      if (!document.hidden) {
        cleanup();
        resolve();
      }
    };

    const abortHandler = () => {
      cleanup();
      reject(signal?.reason);
    };

    const cleanup = () => {
      document.removeEventListener('visibilitychange', visibilityHandler);
      signal?.removeEventListener('abort', abortHandler);
    };

    document.addEventListener('visibilitychange', visibilityHandler);
    signal?.addEventListener('abort', abortHandler, { once: true });
  });
}

/**
 * Check if the page is currently visible
 */
export function isVisible(): boolean {
  if (typeof document === 'undefined') {
    return true;
  }
  return !document.hidden;
}

/**
 * Get the current visibility state
 */
export function getVisibilityState(): DocumentVisibilityState | 'unknown' {
  if (typeof document === 'undefined') {
    return 'unknown';
  }
  return document.visibilityState;
}
