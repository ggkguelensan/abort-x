/**
 * Abort scope management
 */

import { createAbortError } from '../core/polyfills';
import type { CleanupFn } from '../core/types';

/**
 * An abort scope that can have children and auto-cleanup.
 * Useful for managing hierarchical cancellation.
 *
 * @example
 * ```typescript
 * const scope = new AbortScope();
 *
 * // Auto-cleanup on completion or error
 * await scope.run(async (signal) => {
 *   const user = await fetch('/user', { signal });
 *   const posts = await fetch('/posts', { signal });
 *   return { user, posts };
 * });
 *
 * // Nested scopes
 * const childScope = scope.child();
 *
 * // Cleanup all
 * scope.dispose();
 * ```
 */
export class AbortScope {
  private controller: AbortController;
  private children = new Set<AbortScope>();
  private parent?: AbortScope;
  private cleanupFns: CleanupFn[] = [];
  private disposed = false;

  constructor(parentSignal?: AbortSignal) {
    this.controller = new AbortController();

    if (parentSignal) {
      if (parentSignal.aborted) {
        this.controller.abort(parentSignal.reason);
      } else {
        parentSignal.addEventListener(
          'abort',
          () => {
            this.abort(parentSignal.reason);
          },
          { once: true }
        );
      }
    }
  }

  /**
   * The AbortSignal for this scope
   */
  get signal(): AbortSignal {
    return this.controller.signal;
  }

  /**
   * Whether the scope has been aborted
   */
  get aborted(): boolean {
    return this.controller.signal.aborted;
  }

  /**
   * The abort reason (if aborted)
   */
  get reason(): unknown {
    return this.controller.signal.reason;
  }

  /**
   * Create a child scope that aborts when this scope aborts
   */
  child(): AbortScope {
    if (this.disposed) {
      throw new Error('Cannot create child of disposed scope');
    }

    const child = new AbortScope(this.signal);
    child.parent = this;
    this.children.add(child);

    // Remove child when it aborts
    child.signal.addEventListener(
      'abort',
      () => {
        this.children.delete(child);
      },
      { once: true }
    );

    return child;
  }

  /**
   * Execute a function with automatic abort on error
   */
  async run<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const childScope = this.child();

    try {
      return await fn(childScope.signal);
    } catch (error) {
      // Abort on error (if not already aborted)
      if (!childScope.aborted) {
        childScope.abort({
          type: 'error',
          error,
        });
      }
      throw error;
    } finally {
      childScope.dispose();
    }
  }

  /**
   * Execute multiple functions in parallel with shared signal
   */
  async all<T extends readonly unknown[]>(
    fns: { [K in keyof T]: (signal: AbortSignal) => Promise<T[K]> }
  ): Promise<T> {
    const childScope = this.child();

    try {
      const results = await Promise.all(
        fns.map((fn) => fn(childScope.signal))
      );
      return results as unknown as T;
    } catch (error) {
      if (!childScope.aborted) {
        childScope.abort({
          type: 'error',
          error,
        });
      }
      throw error;
    } finally {
      childScope.dispose();
    }
  }

  /**
   * Execute functions in sequence with shared signal
   */
  async sequence<T>(
    fns: Array<(signal: AbortSignal) => Promise<T>>
  ): Promise<T[]> {
    const childScope = this.child();
    const results: T[] = [];

    try {
      for (const fn of fns) {
        if (childScope.aborted) {
          throw childScope.reason ?? createAbortError();
        }
        results.push(await fn(childScope.signal));
      }
      return results;
    } catch (error) {
      if (!childScope.aborted) {
        childScope.abort({
          type: 'error',
          error,
        });
      }
      throw error;
    } finally {
      childScope.dispose();
    }
  }

  /**
   * Register a cleanup function to be called on dispose
   */
  onDispose(fn: CleanupFn): CleanupFn {
    if (this.disposed) {
      fn();
      return () => {};
    }

    this.cleanupFns.push(fn);

    return () => {
      const index = this.cleanupFns.indexOf(fn);
      if (index !== -1) {
        this.cleanupFns.splice(index, 1);
      }
    };
  }

  /**
   * Abort this scope and all children
   */
  abort(reason?: unknown): void {
    if (this.controller.signal.aborted) return;

    this.controller.abort(reason);

    // Abort all children
    for (const child of this.children) {
      child.abort(reason);
    }
    this.children.clear();

    // Remove from parent
    if (this.parent) {
      this.parent.children.delete(this);
    }
  }

  /**
   * Dispose this scope (abort with standard reason)
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.abort(createAbortError('Scope disposed'));

    // Run cleanup functions
    for (const fn of this.cleanupFns) {
      try {
        fn();
      } catch {
        // Ignore cleanup errors
      }
    }
    this.cleanupFns.length = 0;
  }

  /**
   * Create a scope from an existing signal
   */
  static from(signal: AbortSignal): AbortScope {
    return new AbortScope(signal);
  }
}

/**
 * Run a function with automatic abort scope
 */
export async function withScope<T>(
  fn: (scope: AbortScope) => Promise<T>,
  parentSignal?: AbortSignal
): Promise<T> {
  const scope = new AbortScope(parentSignal);

  try {
    return await fn(scope);
  } finally {
    scope.dispose();
  }
}

/**
 * Create a simple scope that auto-disposes after function completes
 */
export async function runScoped<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  parentSignal?: AbortSignal
): Promise<T> {
  const scope = new AbortScope(parentSignal);

  try {
    return await fn(scope.signal);
  } finally {
    scope.dispose();
  }
}
