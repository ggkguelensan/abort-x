/**
 * Combinators module - signal composition and transformation
 *
 * These functions work like Array methods but for AbortSignals:
 * - any/race - like Promise.race, first signal wins
 * - all - like Promise.all, wait for all signals
 * - map - transform abort reasons
 * - filter - selectively pass through aborts
 * - tap - side effects without modification
 * - delay - time-based transformations
 * - pipe - compose multiple transformations
 *
 * @packageDocumentation
 */

// Any/Race - first signal wins
export { any, race, combine } from './any';

// All - wait for all signals
export { all, atLeast } from './all';
export type { AllAbortedReason } from './all';

// Map - transform reasons
export {
  mapReason,
  enrichReason,
  tagReason,
  mapReasonAsync,
} from './map';

// Filter - selective abort
export {
  filter,
  filterByType,
  exclude,
  excludeByType,
  take,
  skipIf,
} from './filter';

// Tap - side effects
export {
  tap,
  tapAsync,
  tapAll,
  tapIf,
  debug,
  onAbort,
} from './tap';

// Delay - timing transformations
export {
  delay,
  delayWithCancel,
  debounceSignal,
  minDelay,
  maxDelay,
} from './delay';

// Pipe - composition
export {
  pipe,
  pipeline,
  compose,
  when,
  whenFn,
  identity,
  branch,
  fork,
} from './pipe';
export type { SignalOperator } from './pipe';
