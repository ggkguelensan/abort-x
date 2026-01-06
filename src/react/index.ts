/**
 * React module - React hooks for abort handling
 *
 * @packageDocumentation
 */

export {
  useAbortController,
  useAbortControllerEffect,
  useAbortSignal,
  useAbortSignalEffect,
  useAbortTrigger,
} from './use-abort-controller';

export {
  useAbortableAsync,
  useAbortableFetch,
} from './use-abortable-async';

export type {
  UseAbortableAsyncOptions,
  UseAbortableAsyncState,
  UseAbortableAsyncActions,
  UseAbortableAsyncReturn,
} from './use-abortable-async';
