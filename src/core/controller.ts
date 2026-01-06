/**
 * Typed AbortController with type-safe reason
 */

import type { TypedAbortSignal, AbortCallback, CleanupFn } from './types';

/**
 * A type-safe version of AbortController that enforces a specific reason type.
 *
 * @typeParam TReason - The type of the abort reason
 *
 * @example
 * ```typescript
 * type MyReason =
 *   | { type: 'timeout'; duration: number }
 *   | { type: 'user_cancelled' }
 *   | { type: 'error'; error: Error };
 *
 * const controller = new TypedAbortController<MyReason>();
 *
 * controller.abort({ type: 'timeout', duration: 5000 });
 *
 * if (controller.signal.aborted) {
 *   const reason = controller.signal.reason;
 *   if (reason.type === 'timeout') {
 *     console.log(reason.duration); // type-safe!
 *   }
 * }
 * ```
 */
export class TypedAbortController<TReason = unknown> {
  private readonly controller: AbortController;
  private readonly callbacks: Set<AbortCallback<TReason>> = new Set();
  private _reason: TReason | undefined;

  constructor() {
    this.controller = new AbortController();
  }

  /**
   * The AbortSignal associated with this controller
   */
  get signal(): TypedAbortSignal<TReason> {
    return this.controller.signal as TypedAbortSignal<TReason>;
  }

  /**
   * Whether the signal has been aborted
   */
  get aborted(): boolean {
    return this.controller.signal.aborted;
  }

  /**
   * The reason for aborting (if aborted)
   */
  get reason(): TReason | undefined {
    return this._reason;
  }

  /**
   * Abort the signal with the given reason
   *
   * @param reason - The reason for aborting
   */
  abort(reason: TReason): void {
    if (this.controller.signal.aborted) {
      return;
    }

    this._reason = reason;
    this.controller.abort(reason);

    // Notify all registered callbacks
    this.callbacks.forEach((callback) => {
      try {
        callback(reason);
      } catch {
        // Ignore errors in callbacks
      }
    });
  }

  /**
   * Register a callback to be called when aborted
   *
   * @param callback - Function to call with the abort reason
   * @returns Cleanup function to unregister the callback
   */
  onAbort(callback: AbortCallback<TReason>): CleanupFn {
    // If already aborted, call immediately
    if (this.controller.signal.aborted && this._reason !== undefined) {
      try {
        callback(this._reason);
      } catch {
        // Ignore errors
      }
      return () => {};
    }

    this.callbacks.add(callback);

    return () => {
      this.callbacks.delete(callback);
    };
  }

  /**
   * Create a new TypedAbortController that aborts when any of the given signals abort
   */
  static from<TReason>(
    ...signals: Array<AbortSignal | TypedAbortSignal<TReason>>
  ): TypedAbortController<TReason> {
    const controller = new TypedAbortController<TReason>();

    for (const signal of signals) {
      if (signal.aborted) {
        controller.abort(signal.reason as TReason);
        return controller;
      }

      signal.addEventListener(
        'abort',
        () => {
          controller.abort(signal.reason as TReason);
        },
        { once: true }
      );
    }

    return controller;
  }
}

/**
 * Create a linked controller that aborts when the parent signal aborts
 *
 * @param parentSignal - The parent signal to link to
 * @returns A new AbortController linked to the parent
 */
export function linkedController(
  parentSignal?: AbortSignal
): AbortController {
  const controller = new AbortController();

  if (parentSignal) {
    if (parentSignal.aborted) {
      controller.abort(parentSignal.reason);
    } else {
      parentSignal.addEventListener(
        'abort',
        () => {
          controller.abort(parentSignal.reason);
        },
        { once: true }
      );
    }
  }

  return controller;
}

/**
 * Create a typed linked controller
 */
export function typedLinkedController<TReason>(
  parentSignal?: AbortSignal | TypedAbortSignal<TReason>
): TypedAbortController<TReason> {
  const controller = new TypedAbortController<TReason>();

  if (parentSignal) {
    if (parentSignal.aborted) {
      controller.abort(parentSignal.reason as TReason);
    } else {
      parentSignal.addEventListener(
        'abort',
        () => {
          controller.abort(parentSignal.reason as TReason);
        },
        { once: true }
      );
    }
  }

  return controller;
}
