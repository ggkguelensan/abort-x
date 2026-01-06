/**
 * Timing module - time-based abort signals
 *
 * @packageDocumentation
 */

// Timeout
export { timeout } from './timeout';

// Deadline
export {
  deadline,
  deadlineAt,
  withDeadline,
  fromStart,
  nextInterval,
} from './deadline';

// Idle
export {
  idleTimeout,
  onIdle,
  whenIdle,
} from './idle';
export type {
  IdleTimeoutOptions,
  IdleTimeoutResult,
} from './idle';
