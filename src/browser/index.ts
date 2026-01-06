/**
 * Browser module - browser-specific abort signals
 *
 * @packageDocumentation
 */

// Online/Offline
export {
  onlineSignal,
  offlineSignal,
  networkChangeSignal,
  waitForOnline,
  isOnline,
} from './online';

// Page Visibility
export {
  visibilitySignal,
  hiddenSignal,
  visibleSignal,
  waitForVisible,
  isVisible,
  getVisibilityState,
} from './visibility';
export type { VisibilitySignalOptions } from './visibility';

// Storage Quota
export {
  storageQuotaSignal,
  getStorageInfo,
  isStorageNearQuota,
} from './storage';
export type { StorageQuotaInfo } from './storage';

// Memory Pressure
export {
  memoryPressureSignal,
  getMemoryInfo,
  isMemoryPressure,
  isMemoryApiSupported,
} from './memory';
export type { MemoryInfo } from './memory';
