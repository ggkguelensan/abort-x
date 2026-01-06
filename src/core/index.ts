/**
 * Core module - fundamental primitives and polyfills
 *
 * @packageDocumentation
 */

// Types
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
  AbortableFunctionWithOptions,
  CleanupFn,
  ProgressCallback,
  ProgressSignal,
} from './types';

// Polyfills
export {
  // Feature detection
  supportsAbortSignalTimeout,
  supportsAbortSignalAny,
  supportsAbortSignalAbort,
  // Functions
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
} from './polyfills';

// Controller
export {
  TypedAbortController,
  linkedController,
  typedLinkedController,
} from './controller';

// Soft/Hard abort
export {
  SoftAbortController,
  createSoftAbortController,
  isSoftAborted,
  isHardAborted,
  onSoftAbort,
  hardAbortOnly,
} from './soft-abort';
export type {
  CancellationPriority,
  AbortReasonWithPriority,
  SoftAbortSignal,
} from './soft-abort';
