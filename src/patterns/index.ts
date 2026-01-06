/**
 * Patterns module - higher-level patterns for abort handling
 *
 * @packageDocumentation
 */

// Scope management
export { AbortScope, withScope, runScoped } from './scope';

// Retry with backoff
export {
  withRetry,
  retryable,
  withRetryResult,
} from './retry';
export type {
  RetryOptions,
  RetryResult,
  BackoffStrategy,
} from './retry';

// Debounce and throttle
export {
  debounce,
  throttle,
} from './debounce';
export type {
  DebouncedFunction,
  ThrottledFunction,
  DebounceOptions,
  ThrottleOptions,
} from './debounce';

// Batch operations
export {
  batch,
  sequence,
  parallel,
  mapAsync,
  filterAsync,
  findAsync,
} from './batch';
export type {
  BatchOptions,
  BatchResult,
} from './batch';
