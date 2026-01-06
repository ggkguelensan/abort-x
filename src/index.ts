/**
 * abort-x - Fluent API for AbortController/AbortSignal
 *
 * A type-safe, tree-shakeable library for managing async cancellation
 * with full compatibility with Web Standards.
 *
 * @packageDocumentation
 *
 * @example
 * ```typescript
 * // Simple timeout
 * import { timeout } from 'abort-x';
 * await fetch('/api', { signal: timeout(5000) });
 *
 * // Combine signals
 * import { any, timeout } from 'abort-x';
 * const signal = any([timeout(5000), userController.signal]);
 *
 * // Fluent builder
 * import { AbortX } from 'abort-x';
 * const signal = AbortX.create()
 *   .timeout(5000)
 *   .with(userSignal)
 *   .onAbort(() => console.log('Cancelled'))
 *   .build();
 *
 * // Retry with backoff
 * import { withRetry } from 'abort-x';
 * const data = await withRetry(
 *   (signal) => fetch('/api', { signal }),
 *   { attempts: 3, backoff: 'exponential' }
 * );
 * ```
 */

// =============================================================================
// Core - Polyfills & Primitives
// =============================================================================

export {
  // Feature detection
  supportsAbortSignalTimeout,
  supportsAbortSignalAny,
  supportsAbortSignalAbort,
  // Polyfill functions
  abortSignalTimeout,
  abortSignalAny,
  abortSignalAbort,
  // Error factories
  createTimeoutError,
  createAbortError,
  // Aliases
  timeout,
  any,
  race,
  abort,
  // Controller
  TypedAbortController,
  linkedController,
  typedLinkedController,
  // Soft/Hard abort
  SoftAbortController,
  createSoftAbortController,
  isSoftAborted,
  isHardAborted,
  onSoftAbort,
  hardAbortOnly,
} from './core';

export type {
  TypedAbortSignal,
  AbortOptions,
  AbortCallback,
  TimeoutReason,
  UserCancelledReason,
  ErrorReason,
  DisposedReason,
  CommonAbortReason,
  AbortableFunction,
  CleanupFn,
  ProgressCallback,
  ProgressSignal,
  CancellationPriority,
  AbortReasonWithPriority,
  SoftAbortSignal,
} from './core';

// =============================================================================
// Combinators - Signal Composition
// =============================================================================

export {
  // Any/Race
  combine,
  // All
  all,
  atLeast,
  // Map
  mapReason,
  enrichReason,
  tagReason,
  mapReasonAsync,
  // Filter
  filter,
  filterByType,
  exclude,
  excludeByType,
  take,
  skipIf,
  // Tap
  tap,
  tapAsync,
  tapAll,
  tapIf,
  debug,
  onAbort,
  // Delay
  delay,
  delayWithCancel,
  debounceSignal,
  minDelay,
  maxDelay,
  // Pipe
  pipe,
  pipeline,
  compose,
  when,
  whenFn,
  identity,
  branch,
  fork,
} from './combinators';

export type { SignalOperator, AllAbortedReason } from './combinators';

// =============================================================================
// Timing - Time-based Signals
// =============================================================================

export {
  deadline,
  deadlineAt,
  withDeadline,
  fromStart,
  nextInterval,
  idleTimeout,
  onIdle,
  whenIdle,
} from './timing';

export type { IdleTimeoutOptions, IdleTimeoutResult } from './timing';

// =============================================================================
// Browser - Browser-specific Signals
// =============================================================================

export {
  // Online/Offline
  onlineSignal,
  offlineSignal,
  networkChangeSignal,
  waitForOnline,
  isOnline,
  // Visibility
  visibilitySignal,
  hiddenSignal,
  visibleSignal,
  waitForVisible,
  isVisible,
  getVisibilityState,
  // Storage
  storageQuotaSignal,
  getStorageInfo,
  isStorageNearQuota,
  // Memory
  memoryPressureSignal,
  getMemoryInfo,
  isMemoryPressure,
  isMemoryApiSupported,
  // WebSocket
  createAbortableWebSocket,
  createWebSocketWithSignals,
  // Upload/Download
  createAbortableUpload,
  createMultiUpload,
  createAbortableDownload,
} from './browser';

export type {
  VisibilitySignalOptions,
  StorageQuotaInfo,
  MemoryInfo,
  AbortableWebSocketOptions,
  AbortableWebSocket,
  UploadProgress,
  UploadOptions,
  UploadResult,
  AbortableUpload,
  MultiUploadProgress,
  MultiUploadOptions,
  MultiUploadResult,
  DownloadProgress,
  AbortableDownload,
} from './browser';

// =============================================================================
// Patterns - Higher-level Patterns
// =============================================================================

export {
  // Scope
  AbortScope,
  withScope,
  runScoped,
  // Retry
  withRetry,
  retryable,
  withRetryResult,
  // Debounce/Throttle
  debounce,
  throttle,
  // Batch
  batch,
  sequence,
  parallel,
  mapAsync,
  filterAsync,
  findAsync,
  // Registry
  AbortRegistry,
  globalRegistry,
  registerAbort,
  abortRegistered,
  abortByTag,
} from './patterns';

export type {
  RetryOptions,
  RetryResult,
  BackoffStrategy,
  DebouncedFunction,
  ThrottledFunction,
  DebounceOptions,
  ThrottleOptions,
  BatchOptions,
  BatchResult,
  RegistryEntry,
  RegisterOptions,
  AbortOptions as RegistryAbortOptions,
} from './patterns';

// =============================================================================
// Guards - Type Guards & Utilities
// =============================================================================

export {
  isAborted,
  isTimeout,
  isAbortRelated,
  isSignalAborted,
  isReasonType,
  ensure,
  assertNotAborted,
  throwIfAborted,
  runWithAbortCheck,
  abortable,
} from './guards';

// =============================================================================
// Builder - Fluent API
// =============================================================================

export { AbortX, AbortXBuilder } from './builder';

// =============================================================================
// Integrations - TanStack Query helpers
// =============================================================================

export {
  createCancellableQuery,
  createCancellableMutation,
  withQueryTimeout,
  isAbortRelatedError,
  skipAbortRetry,
  throwOnErrorIgnoreAbort,
  createMutationOptions,
  createInfiniteQueryRegistry,
} from './integrations';

export type {
  QueryFnContext,
  MutationContext,
  QueryFn,
  MutationFn,
  CancellableQueryOptions,
  CancellableMutationOptions,
  CancellableQueryResult,
  CancellableMutationResult,
} from './integrations';
