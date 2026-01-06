/**
 * AbortRegistry - Global tracking and management of abort controllers
 *
 * Solves:
 * - Case #4: Cannot cancel specific request from a group
 * - Case #12: Cascade cancellation of dependent queries
 * - Case #30: No global way to cancel all requests
 */

import { linkedController } from '../core/controller';

export interface RegistryEntry {
  controller: AbortController;
  tags: Set<string>;
  createdAt: number;
  metadata?: Record<string, unknown>;
}

export interface RegisterOptions {
  /** Tags for grouping (e.g., ['user:123', 'posts']) */
  tags?: string[];
  /** Link to parent signal - auto-abort when parent aborts */
  parent?: AbortSignal;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

export interface AbortOptions {
  /** Reason for cancellation */
  reason?: unknown;
  /** Only abort entries older than this timestamp */
  olderThan?: number;
  /** Only abort entries matching all these tags */
  matchAllTags?: boolean;
}

/**
 * Registry for tracking and managing multiple AbortControllers
 *
 * @example
 * ```ts
 * const registry = new AbortRegistry();
 *
 * // Register requests with tags
 * const signal1 = registry.register('req-1', { tags: ['user:123', 'posts'] });
 * const signal2 = registry.register('req-2', { tags: ['user:123', 'comments'] });
 * const signal3 = registry.register('req-3', { tags: ['user:456', 'posts'] });
 *
 * // Cancel all requests for user 123
 * registry.abortByTag('user:123');
 *
 * // Cancel specific request
 * registry.abort('req-1');
 *
 * // Cancel all
 * registry.abortAll();
 *
 * // Use with React Query
 * useQuery({
 *   queryKey: ['posts', userId],
 *   queryFn: () => {
 *     const signal = registry.register(`posts-${userId}`, {
 *       tags: [`user:${userId}`, 'posts'],
 *     });
 *     return fetchPosts(userId, signal);
 *   },
 * });
 * ```
 */
export class AbortRegistry {
  private entries = new Map<string, RegistryEntry>();
  private tagIndex = new Map<string, Set<string>>();

  /**
   * Register a new abort controller
   *
   * @param id - Unique identifier for this request
   * @param options - Registration options
   * @returns AbortSignal to use in the request
   */
  register(id: string, options: RegisterOptions = {}): AbortSignal {
    // Abort existing with same ID
    this.abort(id);

    const { tags = [], parent, metadata } = options;

    // Create controller, optionally linked to parent
    const controller = parent
      ? linkedController(parent)
      : new AbortController();

    const entry: RegistryEntry = {
      controller,
      tags: new Set(tags),
      createdAt: Date.now(),
    };
    if (metadata) {
      entry.metadata = metadata;
    }

    this.entries.set(id, entry);

    // Update tag index
    for (const tag of tags) {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag)!.add(id);
    }

    // Auto-cleanup on abort
    controller.signal.addEventListener('abort', () => {
      this.unregister(id);
    });

    return controller.signal;
  }

  /**
   * Unregister without aborting
   */
  unregister(id: string): boolean {
    const entry = this.entries.get(id);
    if (!entry) return false;

    // Remove from tag index
    for (const tag of entry.tags) {
      this.tagIndex.get(tag)?.delete(id);
      if (this.tagIndex.get(tag)?.size === 0) {
        this.tagIndex.delete(tag);
      }
    }

    this.entries.delete(id);
    return true;
  }

  /**
   * Abort a specific request by ID
   */
  abort(id: string, reason?: unknown): boolean {
    const entry = this.entries.get(id);
    if (!entry) return false;

    entry.controller.abort(reason);
    return true;
  }

  /**
   * Abort all requests with a specific tag
   */
  abortByTag(tag: string, options: AbortOptions = {}): number {
    const { reason, olderThan } = options;
    const ids = this.tagIndex.get(tag);
    if (!ids) return 0;

    let count = 0;
    for (const id of ids) {
      const entry = this.entries.get(id);
      if (!entry) continue;

      // Check olderThan filter
      if (olderThan && entry.createdAt >= olderThan) continue;

      entry.controller.abort(reason);
      count++;
    }

    return count;
  }

  /**
   * Abort all requests matching multiple tags
   */
  abortByTags(
    tags: string[],
    options: AbortOptions & { matchAll?: boolean } = {}
  ): number {
    const { matchAll = false, ...abortOptions } = options;

    if (matchAll) {
      // Must match ALL tags
      const matchingIds = new Set<string>();

      for (const [id, entry] of this.entries) {
        if (tags.every((tag) => entry.tags.has(tag))) {
          matchingIds.add(id);
        }
      }

      let count = 0;
      for (const id of matchingIds) {
        if (this.abort(id, abortOptions.reason)) count++;
      }
      return count;
    } else {
      // Match ANY tag
      const abortedIds = new Set<string>();
      let count = 0;

      for (const tag of tags) {
        const ids = this.tagIndex.get(tag);
        if (!ids) continue;

        for (const id of ids) {
          if (abortedIds.has(id)) continue;
          if (this.abort(id, abortOptions.reason)) {
            abortedIds.add(id);
            count++;
          }
        }
      }

      return count;
    }
  }

  /**
   * Abort all registered requests
   */
  abortAll(reason?: unknown): number {
    let count = 0;
    for (const [id] of this.entries) {
      if (this.abort(id, reason)) count++;
    }
    return count;
  }

  /**
   * Abort all requests older than a timestamp
   */
  abortOlderThan(timestamp: number, reason?: unknown): number {
    let count = 0;
    for (const [id, entry] of this.entries) {
      if (entry.createdAt < timestamp) {
        if (this.abort(id, reason)) count++;
      }
    }
    return count;
  }

  /**
   * Get signal for an existing registration
   */
  getSignal(id: string): AbortSignal | undefined {
    return this.entries.get(id)?.controller.signal;
  }

  /**
   * Check if a request is registered and not aborted
   */
  isActive(id: string): boolean {
    const entry = this.entries.get(id);
    return entry !== undefined && !entry.controller.signal.aborted;
  }

  /**
   * Get all active IDs
   */
  getActiveIds(): string[] {
    return Array.from(this.entries.keys()).filter((id) => this.isActive(id));
  }

  /**
   * Get all IDs with a specific tag
   */
  getIdsByTag(tag: string): string[] {
    return Array.from(this.tagIndex.get(tag) ?? []);
  }

  /**
   * Get count of active requests
   */
  get size(): number {
    return this.entries.size;
  }

  /**
   * Clear all entries (without aborting)
   */
  clear(): void {
    this.entries.clear();
    this.tagIndex.clear();
  }
}

/**
 * Global default registry instance
 */
export const globalRegistry = new AbortRegistry();

/**
 * Register with global registry
 */
export function registerAbort(
  id: string,
  options?: RegisterOptions
): AbortSignal {
  return globalRegistry.register(id, options);
}

/**
 * Abort from global registry
 */
export function abortRegistered(id: string, reason?: unknown): boolean {
  return globalRegistry.abort(id, reason);
}

/**
 * Abort by tag from global registry
 */
export function abortByTag(tag: string, reason?: unknown): number {
  return globalRegistry.abortByTag(tag, { reason });
}
