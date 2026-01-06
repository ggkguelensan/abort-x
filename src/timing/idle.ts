/**
 * Idle timeout - abort when user becomes inactive
 */

import type { CleanupFn } from '../core/types';

export interface IdleTimeoutOptions {
  /** Events that reset the idle timer */
  events?: string[];
  /** Element to listen on (default: document) */
  target?: EventTarget;
  /** Whether to start in idle state if no activity */
  startIdle?: boolean;
}

export interface IdleTimeoutResult {
  /** The abort signal */
  signal: AbortSignal;
  /** Reset the idle timer */
  reset: () => void;
  /** Cleanup and stop monitoring */
  dispose: () => void;
  /** Check if currently idle */
  isIdle: () => boolean;
}

const DEFAULT_EVENTS = [
  'mousemove',
  'mousedown',
  'keydown',
  'touchstart',
  'scroll',
  'wheel',
];

/**
 * Create a signal that aborts when user becomes idle.
 * Resets on user activity.
 *
 * @param ms - Idle timeout in milliseconds
 * @param options - Configuration options
 * @returns Object with signal, reset, and dispose functions
 *
 * @example
 * ```typescript
 * const { signal, reset, dispose } = idleTimeout(30000);
 *
 * // Use signal for auto-logout
 * signal.addEventListener('abort', () => {
 *   logout('Session expired due to inactivity');
 * });
 *
 * // Manually reset on important actions
 * saveButton.addEventListener('click', reset);
 *
 * // Cleanup when done
 * dispose();
 * ```
 */
export function idleTimeout(
  ms: number,
  options?: IdleTimeoutOptions
): IdleTimeoutResult {
  const events = options?.events ?? DEFAULT_EVENTS;
  const target = options?.target ?? (typeof document !== 'undefined' ? document : undefined);
  const startIdle = options?.startIdle ?? false;

  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let idle = startIdle;

  const cleanup = () => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  };

  const reset = () => {
    if (disposed || controller.signal.aborted) return;

    idle = false;
    cleanup();

    timeoutId = setTimeout(() => {
      if (!disposed) {
        idle = true;
        controller.abort({
          type: 'idle_timeout',
          duration: ms,
        });
      }
    }, ms);
  };

  const activityHandler = () => {
    reset();
  };

  // Attach event listeners
  if (target) {
    for (const event of events) {
      target.addEventListener(event, activityHandler, { passive: true });
    }
  }

  // Start the timer
  if (!startIdle) {
    reset();
  } else {
    // Immediately abort if starting idle
    controller.abort({
      type: 'idle_timeout',
      duration: 0,
      startedIdle: true,
    });
  }

  const dispose = () => {
    disposed = true;
    cleanup();

    if (target) {
      for (const event of events) {
        target.removeEventListener(event, activityHandler);
      }
    }
  };

  // Auto-cleanup on abort
  controller.signal.addEventListener('abort', () => {
    if (target) {
      for (const event of events) {
        target.removeEventListener(event, activityHandler);
      }
    }
  }, { once: true });

  return {
    signal: controller.signal,
    reset,
    dispose,
    isIdle: () => idle,
  };
}

/**
 * Create a signal that aborts when there's no activity for specified duration.
 * Unlike idleTimeout, this creates a new signal each time activity occurs.
 *
 * @param ms - Activity timeout in milliseconds
 * @param callback - Called each time activity is detected
 * @returns Cleanup function
 */
export function onIdle(
  ms: number,
  callback: () => void,
  options?: IdleTimeoutOptions
): CleanupFn {
  const { signal, dispose } = idleTimeout(ms, options);

  signal.addEventListener('abort', callback, { once: true });

  return dispose;
}

/**
 * Create a signal that aborts when the browser's requestIdleCallback fires.
 * Uses setTimeout fallback for browsers without requestIdleCallback.
 *
 * @param options - Configuration options
 * @returns An AbortSignal
 */
export function whenIdle(options?: {
  timeout?: number;
}): AbortSignal {
  const controller = new AbortController();
  const timeout = options?.timeout;

  if (typeof requestIdleCallback !== 'undefined') {
    const idleOptions = timeout !== undefined ? { timeout } : undefined;

    requestIdleCallback(
      (deadline) => {
        controller.abort({
          type: 'browser_idle',
          didTimeout: deadline.didTimeout,
          timeRemaining: deadline.timeRemaining(),
        });
      },
      idleOptions
    );
  } else {
    // Fallback for environments without requestIdleCallback
    setTimeout(() => {
      controller.abort({
        type: 'browser_idle',
        didTimeout: false,
        timeRemaining: 0,
      });
    }, timeout ?? 0);
  }

  return controller.signal;
}
