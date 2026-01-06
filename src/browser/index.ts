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

// WebSocket
export {
  createAbortableWebSocket,
  createWebSocketWithSignals,
} from './websocket';
export type {
  AbortableWebSocketOptions,
  AbortableWebSocket,
} from './websocket';

// File Upload/Download
export {
  createAbortableUpload,
  createMultiUpload,
  createAbortableDownload,
} from './upload';
export type {
  UploadProgress,
  UploadOptions,
  UploadResult,
  AbortableUpload,
  MultiUploadProgress,
  MultiUploadOptions,
  MultiUploadResult,
  DownloadProgress,
  AbortableDownload,
} from './upload';
