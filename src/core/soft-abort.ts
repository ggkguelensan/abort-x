/**
 * Soft/Hard cancellation support
 *
 * Solves:
 * - Case #2: No control over "soft" vs "hard" cancellation
 * - Case #7: Optimistic updates and cancelled mutations (soft abort = don't rollback)
 * - Case #15: Stale data after refetch cancel (soft abort = keep fetching in background)
 */

import { createAbortError } from './polyfills';

/**
 * Cancellation priority levels
 */
export type CancellationPriority = 'soft' | 'hard';

/**
 * Extended abort reason with priority
 */
export interface AbortReasonWithPriority<TReason = unknown> {
  reason: TReason;
  priority: CancellationPriority;
  timestamp: number;
}

/**
 * Signal that distinguishes between soft and hard aborts
 */
export interface SoftAbortSignal extends AbortSignal {
  /** Whether this is a soft abort (can be ignored/continued) */
  readonly isSoftAbort: boolean;
  /** Whether this is a hard abort (must stop immediately) */
  readonly isHardAbort: boolean;
  /** The cancellation priority */
  readonly priority: CancellationPriority | null;
  /** Original abort reason */
  readonly abortReason: unknown;
}

/**
 * Controller that supports both soft and hard cancellation
 *
 * @example
 * ```ts
 * const controller = new SoftAbortController();
 *
 * // In your fetch function
 * async function fetchData(signal: SoftAbortSignal) {
 *   const response = await fetch('/api', { signal });
 *
 *   if (signal.isSoftAbort) {
 *     // Soft abort - can continue processing for cache
 *     console.log('Soft abort - caching result anyway');
 *     return response.json();
 *   }
 *
 *   return response.json();
 * }
 *
 * // Soft abort - "nice to cancel, but okay if continues"
 * controller.softAbort('user_navigated');
 *
 * // Hard abort - "must stop now"
 * controller.hardAbort('timeout');
 * ```
 */
export class SoftAbortController<TReason = unknown> {
  private _controller: AbortController;
  private _priority: CancellationPriority | null = null;
  private _reason: TReason | undefined;
  private _softAborted = false;

  constructor() {
    this._controller = new AbortController();
  }

  /**
   * The abort signal with soft/hard abort info
   */
  get signal(): SoftAbortSignal {
    const signal = this._controller.signal as SoftAbortSignal;

    // Add soft abort properties
    Object.defineProperties(signal, {
      isSoftAbort: {
        get: () => this._softAborted && !signal.aborted,
        enumerable: true,
      },
      isHardAbort: {
        get: () => signal.aborted && this._priority === 'hard',
        enumerable: true,
      },
      priority: {
        get: () => this._priority,
        enumerable: true,
      },
      abortReason: {
        get: () => this._reason,
        enumerable: true,
      },
    });

    return signal;
  }

  /**
   * Soft abort - signals that cancellation is requested but not mandatory.
   * The operation can continue if needed (e.g., for caching).
   * Does NOT trigger the abort event.
   */
  softAbort(reason?: TReason): void {
    if (this._controller.signal.aborted) return;

    this._softAborted = true;
    this._priority = 'soft';
    this._reason = reason;

    // Dispatch custom event for soft abort listeners
    const event = new CustomEvent('softabort', {
      detail: { reason, priority: 'soft' },
    });
    this._controller.signal.dispatchEvent(event);
  }

  /**
   * Hard abort - signals that the operation must stop immediately.
   * Triggers the standard abort event.
   */
  hardAbort(reason?: TReason): void {
    this._priority = 'hard';
    this._reason = reason;
    this._controller.abort(createAbortError(reason as string | undefined));
  }

  /**
   * Standard abort (defaults to hard)
   */
  abort(reason?: TReason): void {
    this.hardAbort(reason);
  }

  /**
   * Check if soft abort was requested
   */
  get isSoftAborted(): boolean {
    return this._softAborted;
  }

  /**
   * Check if hard abort was triggered
   */
  get isHardAborted(): boolean {
    return this._controller.signal.aborted;
  }

  /**
   * Upgrade soft abort to hard abort
   */
  escalate(reason?: TReason): void {
    if (this._softAborted && !this._controller.signal.aborted) {
      this.hardAbort(reason ?? this._reason);
    }
  }
}

/**
 * Create a soft abort controller
 */
export function createSoftAbortController<TReason = unknown>(): SoftAbortController<TReason> {
  return new SoftAbortController<TReason>();
}

/**
 * Check if a signal is soft aborted
 */
export function isSoftAborted(signal: AbortSignal): boolean {
  return (signal as SoftAbortSignal).isSoftAbort === true;
}

/**
 * Check if a signal is hard aborted
 */
export function isHardAborted(signal: AbortSignal): boolean {
  return signal.aborted && (signal as SoftAbortSignal).priority === 'hard';
}

/**
 * Listen for soft abort events
 */
export function onSoftAbort(
  signal: AbortSignal,
  callback: (reason: unknown) => void
): () => void {
  const handler = (event: Event) => {
    const customEvent = event as CustomEvent;
    callback(customEvent.detail?.reason);
  };

  signal.addEventListener('softabort', handler);
  return () => signal.removeEventListener('softabort', handler);
}

/**
 * Create a signal that only triggers on hard abort
 *
 * Useful when you want to ignore soft aborts completely
 */
export function hardAbortOnly(signal: SoftAbortSignal): AbortSignal {
  const controller = new AbortController();

  signal.addEventListener('abort', () => {
    if (signal.isHardAbort) {
      controller.abort(signal.reason);
    }
  });

  return controller.signal;
}
