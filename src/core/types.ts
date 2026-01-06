/**
 * Core types for abort-x library
 */

/**
 * A typed version of AbortSignal with known reason type
 */
export interface TypedAbortSignal<TReason = unknown> extends AbortSignal {
  readonly reason: TReason;
}

/**
 * Options for abort operations
 */
export interface AbortOptions {
  /** External signal to combine with */
  signal?: AbortSignal;
}

/**
 * Callback for abort events
 */
export type AbortCallback<TReason = unknown> = (reason: TReason) => void;

/**
 * Standard abort reason types
 */
export interface TimeoutReason {
  readonly type: 'timeout';
  readonly duration: number;
}

export interface UserCancelledReason {
  readonly type: 'user_cancelled';
}

export interface ErrorReason {
  readonly type: 'error';
  readonly error: Error;
}

export interface DisposedReason {
  readonly type: 'disposed';
}

/**
 * Union of common abort reasons
 */
export type CommonAbortReason =
  | TimeoutReason
  | UserCancelledReason
  | ErrorReason
  | DisposedReason;

/**
 * Function that can be aborted
 */
export type AbortableFunction<TArgs extends unknown[], TResult> = (
  signal: AbortSignal,
  ...args: TArgs
) => Promise<TResult>;

/**
 * Function that receives signal as part of options
 */
export type AbortableFunctionWithOptions<TArgs extends unknown[], TResult, TOptions extends AbortOptions> = (
  options: TOptions,
  ...args: TArgs
) => Promise<TResult>;

/**
 * Cleanup function returned by listeners
 */
export type CleanupFn = () => void;

/**
 * Progress callback
 */
export type ProgressCallback = (progress: number) => void;

/**
 * Signal with progress tracking
 */
export interface ProgressSignal extends AbortSignal {
  readonly progress: number;
  onProgress(callback: ProgressCallback): CleanupFn;
}

// Type augmentation for older TypeScript versions
declare global {
  interface AbortSignalConstructor {
    /**
     * Returns an AbortSignal that will automatically abort after a specified time.
     * @param ms The number of milliseconds to wait before aborting.
     */
    timeout?(ms: number): AbortSignal;

    /**
     * Returns an AbortSignal that aborts when any of the given signals abort.
     * @param signals An array of AbortSignal objects.
     */
    any?(signals: AbortSignal[]): AbortSignal;

    /**
     * Returns an AbortSignal that is already aborted.
     * @param reason The reason for aborting.
     */
    abort?(reason?: unknown): AbortSignal;
  }
}
