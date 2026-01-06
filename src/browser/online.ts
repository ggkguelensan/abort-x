/**
 * Network status-based abort signals
 */

/**
 * Create a signal that aborts when the browser goes offline.
 *
 * @returns An AbortSignal that aborts when offline
 *
 * @example
 * ```typescript
 * const signal = onlineSignal();
 *
 * // Combine with timeout for network-aware fetch
 * const combinedSignal = any([
 *   timeout(5000),
 *   onlineSignal(),
 * ]);
 *
 * await fetch('/api', { signal: combinedSignal });
 * ```
 */
export function onlineSignal(): AbortSignal {
  const controller = new AbortController();

  // Check if we're in a browser environment
  if (typeof navigator === 'undefined' || typeof window === 'undefined') {
    // Non-browser environment, return signal that never aborts
    return controller.signal;
  }

  // Already offline
  if (!navigator.onLine) {
    controller.abort({
      type: 'offline',
      online: false,
    });
    return controller.signal;
  }

  const handler = () => {
    controller.abort({
      type: 'went_offline',
      online: false,
      timestamp: Date.now(),
    });
  };

  window.addEventListener('offline', handler, { once: true });

  // Cleanup on abort
  controller.signal.addEventListener(
    'abort',
    () => {
      window.removeEventListener('offline', handler);
    },
    { once: true }
  );

  return controller.signal;
}

/**
 * Create a signal that aborts when the browser comes back online.
 * Useful for pausing operations until network is restored.
 *
 * @returns An AbortSignal that aborts when online
 */
export function offlineSignal(): AbortSignal {
  const controller = new AbortController();

  if (typeof navigator === 'undefined' || typeof window === 'undefined') {
    return controller.signal;
  }

  // Already online
  if (navigator.onLine) {
    controller.abort({
      type: 'online',
      online: true,
    });
    return controller.signal;
  }

  const handler = () => {
    controller.abort({
      type: 'came_online',
      online: true,
      timestamp: Date.now(),
    });
  };

  window.addEventListener('online', handler, { once: true });

  controller.signal.addEventListener(
    'abort',
    () => {
      window.removeEventListener('online', handler);
    },
    { once: true }
  );

  return controller.signal;
}

/**
 * Create a signal that aborts on network status change (either direction).
 *
 * @returns An AbortSignal that aborts on any network status change
 */
export function networkChangeSignal(): AbortSignal {
  const controller = new AbortController();

  if (typeof navigator === 'undefined' || typeof window === 'undefined') {
    return controller.signal;
  }

  const handler = () => {
    controller.abort({
      type: 'network_change',
      online: navigator.onLine,
      timestamp: Date.now(),
    });
  };

  window.addEventListener('online', handler, { once: true });
  window.addEventListener('offline', handler, { once: true });

  controller.signal.addEventListener(
    'abort',
    () => {
      window.removeEventListener('online', handler);
      window.removeEventListener('offline', handler);
    },
    { once: true }
  );

  return controller.signal;
}

/**
 * Wait for network to be online before proceeding.
 * Resolves immediately if already online.
 *
 * @param signal - Optional abort signal to cancel waiting
 * @returns Promise that resolves when online
 *
 * @example
 * ```typescript
 * await waitForOnline();
 * await fetch('/api'); // Network is available
 * ```
 */
export async function waitForOnline(signal?: AbortSignal): Promise<void> {
  if (typeof navigator === 'undefined') {
    return;
  }

  if (navigator.onLine) {
    return;
  }

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }

    const onlineHandler = () => {
      cleanup();
      resolve();
    };

    const abortHandler = () => {
      cleanup();
      reject(signal?.reason);
    };

    const cleanup = () => {
      window.removeEventListener('online', onlineHandler);
      signal?.removeEventListener('abort', abortHandler);
    };

    window.addEventListener('online', onlineHandler, { once: true });
    signal?.addEventListener('abort', abortHandler, { once: true });
  });
}

/**
 * Check if currently online
 */
export function isOnline(): boolean {
  if (typeof navigator === 'undefined') {
    return true; // Assume online in non-browser environments
  }
  return navigator.onLine;
}
