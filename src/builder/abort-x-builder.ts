/**
 * Fluent builder pattern for complex abort scenarios
 */

import {
  abortSignalTimeout,
  abortSignalAny,
  abortSignalAbort,
} from '../core/polyfills';
import type { CleanupFn, ProgressCallback, ProgressSignal } from '../core/types';

/**
 * Builder for constructing complex abort signals
 */
export class AbortXBuilder {
  private signals: AbortSignal[] = [];
  private timeoutMs?: number;
  private abortCallbacks: Array<(reason: unknown) => void> = [];
  private _progressInterval = 100;

  /**
   * Add a timeout
   */
  timeout(ms: number): this {
    if (ms <= 0) {
      throw new RangeError('Timeout must be positive');
    }
    this.timeoutMs = ms;
    return this;
  }

  /**
   * Combine with additional signals
   */
  with(...signals: AbortSignal[]): this {
    this.signals.push(...signals);
    return this;
  }

  /**
   * Add callback to be called on abort
   */
  onAbort(callback: (reason: unknown) => void): this {
    this.abortCallbacks.push(callback);
    return this;
  }

  /**
   * Enable progress tracking
   */
  withProgress(intervalMs = 100): this {
    this._progressInterval = intervalMs;
    return this;
  }

  /**
   * Build the final signal
   */
  build(): AbortSignal {
    const allSignals: AbortSignal[] = [...this.signals];

    // Add timeout signal if specified
    if (this.timeoutMs !== undefined) {
      allSignals.push(abortSignalTimeout(this.timeoutMs));
    }

    // Combine all signals
    let signal: AbortSignal;

    if (allSignals.length === 0) {
      signal = new AbortController().signal;
    } else if (allSignals.length === 1) {
      signal = allSignals[0]!;
    } else {
      signal = abortSignalAny(allSignals);
    }

    // Attach callbacks
    for (const callback of this.abortCallbacks) {
      signal.addEventListener(
        'abort',
        () => {
          try {
            callback(signal.reason);
          } catch {
            // Ignore callback errors
          }
        },
        { once: true }
      );
    }

    return signal;
  }

  /**
   * Build with progress tracking
   */
  buildWithProgress(): {
    signal: ProgressSignal;
    update: (progress: number) => void;
  } {
    const signal = this.build();
    let currentProgress = 0;
    const callbacks = new Set<ProgressCallback>();

    // Create progress signal with proper getter
    Object.defineProperty(signal, 'progress', {
      get() {
        return currentProgress;
      },
      enumerable: true,
      configurable: true,
    });

    Object.defineProperty(signal, 'onProgress', {
      value(callback: ProgressCallback): CleanupFn {
        callbacks.add(callback);
        return () => callbacks.delete(callback);
      },
      enumerable: true,
      configurable: true,
    });

    const progressSignal = signal as ProgressSignal;

    const update = (progress: number) => {
      currentProgress = Math.max(0, Math.min(1, progress));
      callbacks.forEach((cb) => {
        try {
          cb(currentProgress);
        } catch {
          // Ignore
        }
      });
    };

    return { signal: progressSignal, update };
  }

  /**
   * Build with auto-progress based on timeout
   */
  buildWithAutoProgress(): {
    signal: ProgressSignal;
    stop: () => void;
  } {
    if (this.timeoutMs === undefined) {
      throw new Error('Auto progress requires timeout()');
    }

    const { signal, update } = this.buildWithProgress();
    const startTime = Date.now();
    const duration = this.timeoutMs;

    const intervalId = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      update(progress);

      if (progress >= 1 || signal.aborted) {
        clearInterval(intervalId);
      }
    }, this._progressInterval);

    signal.addEventListener(
      'abort',
      () => {
        clearInterval(intervalId);
      },
      { once: true }
    );

    return {
      signal,
      stop: () => clearInterval(intervalId),
    };
  }
}

/**
 * Main entry point for fluent API
 */
export class AbortX {
  /**
   * Create a new builder for complex scenarios
   */
  static create(): AbortXBuilder {
    return new AbortXBuilder();
  }

  /**
   * Create a timeout signal
   */
  static timeout(ms: number): AbortSignal {
    return abortSignalTimeout(ms);
  }

  /**
   * Combine multiple signals (any aborts all)
   */
  static any(...signals: AbortSignal[]): AbortSignal {
    return abortSignalAny(signals);
  }

  /**
   * Alias for any()
   */
  static combine(...signals: AbortSignal[]): AbortSignal {
    return abortSignalAny(signals);
  }

  /**
   * Alias for any()
   */
  static race(...signals: AbortSignal[]): AbortSignal {
    return abortSignalAny(signals);
  }

  /**
   * Create an already-aborted signal
   */
  static abort(reason?: unknown): AbortSignal {
    return abortSignalAbort(reason);
  }

  /**
   * Create a signal that never aborts
   */
  static never(): AbortSignal {
    return new AbortController().signal;
  }

  /**
   * Start fluent chain with timeout
   */
  static withTimeout(ms: number): AbortXBuilder {
    return new AbortXBuilder().timeout(ms);
  }

  /**
   * Start fluent chain with signals
   */
  static from(...signals: AbortSignal[]): AbortXBuilder {
    return new AbortXBuilder().with(...signals);
  }
}
