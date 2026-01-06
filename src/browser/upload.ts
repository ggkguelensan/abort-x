/**
 * File upload with abort support and progress tracking
 *
 * Solves:
 * - Case #22: File upload with progress - lots of boilerplate with XMLHttpRequest
 */

import { onAbort } from '../combinators/tap';

export interface UploadProgress {
  /** Bytes uploaded */
  loaded: number;
  /** Total bytes */
  total: number;
  /** Progress percentage (0-100) */
  percentage: number;
  /** Estimated time remaining in ms */
  estimatedTimeRemaining: number | null;
  /** Upload speed in bytes/sec */
  speed: number;
}

export interface UploadOptions {
  /** Abort signal */
  signal?: AbortSignal;
  /** HTTP method */
  method?: 'POST' | 'PUT' | 'PATCH';
  /** Request headers */
  headers?: Record<string, string>;
  /** Progress callback */
  onProgress?: (progress: UploadProgress) => void;
  /** Upload start callback */
  onStart?: () => void;
  /** Form field name for file */
  fieldName?: string;
  /** Additional form data */
  formData?: Record<string, string | Blob>;
  /** Timeout in milliseconds */
  timeout?: number;
}

export interface UploadResult<TResponse = unknown> {
  /** HTTP status code */
  status: number;
  /** Response data */
  data: TResponse;
  /** Response headers */
  headers: Record<string, string>;
}

export interface AbortableUpload<TResponse = unknown> {
  /** Promise that resolves when upload completes */
  promise: Promise<UploadResult<TResponse>>;
  /** Abort the upload */
  abort: (reason?: string) => void;
  /** Get current progress */
  getProgress: () => UploadProgress | null;
  /** Whether upload was aborted */
  readonly aborted: boolean;
}

/**
 * Create an abortable file upload with progress tracking
 *
 * @example
 * ```ts
 * const { promise, abort, getProgress } = createAbortableUpload<{ url: string }>(
 *   file,
 *   '/api/upload',
 *   {
 *     onProgress: (progress) => {
 *       console.log(`${progress.percentage}% uploaded`);
 *       console.log(`Speed: ${(progress.speed / 1024).toFixed(1)} KB/s`);
 *     },
 *   }
 * );
 *
 * // In UI
 * <button onClick={() => abort('user_cancelled')}>Cancel Upload</button>
 * <progress value={getProgress()?.percentage ?? 0} max={100} />
 *
 * try {
 *   const result = await promise;
 *   console.log('Uploaded:', result.data.url);
 * } catch (error) {
 *   if (error.name === 'AbortError') {
 *     console.log('Upload cancelled');
 *   }
 * }
 * ```
 */
export function createAbortableUpload<TResponse = unknown>(
  file: File | Blob,
  url: string,
  options: UploadOptions = {}
): AbortableUpload<TResponse> {
  const {
    signal,
    method = 'POST',
    headers = {},
    onProgress,
    onStart,
    fieldName = 'file',
    formData: additionalFormData,
    timeout,
  } = options;

  const controller = new AbortController();
  let aborted = false;
  let currentProgress: UploadProgress | null = null;
  let startTime: number;

  // Link to external signal
  if (signal) {
    if (signal.aborted) {
      aborted = true;
      controller.abort(signal.reason);
    } else {
      onAbort(signal, () => {
        aborted = true;
        controller.abort(signal.reason);
      });
    }
  }

  const promise = new Promise<UploadResult<TResponse>>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    // Track upload start
    startTime = Date.now();
    onStart?.();

    // Handle progress
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        const elapsed = Date.now() - startTime;
        const speed = event.loaded / (elapsed / 1000);
        const remaining = event.total - event.loaded;
        const estimatedTimeRemaining = speed > 0 ? (remaining / speed) * 1000 : null;

        currentProgress = {
          loaded: event.loaded,
          total: event.total,
          percentage: Math.round((event.loaded / event.total) * 100),
          speed,
          estimatedTimeRemaining,
        };

        onProgress?.(currentProgress);
      }
    });

    // Handle completion
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        let data: TResponse;
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          data = xhr.responseText as unknown as TResponse;
        }

        const responseHeaders: Record<string, string> = {};
        xhr
          .getAllResponseHeaders()
          .split('\r\n')
          .forEach((line) => {
            const parts = line.split(': ');
            const key = parts[0];
            const value = parts[1] ?? '';
            if (key) responseHeaders[key.toLowerCase()] = value;
          });

        resolve({
          status: xhr.status,
          data,
          headers: responseHeaders,
        });
      } else {
        reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
      }
    });

    // Handle errors
    xhr.addEventListener('error', () => {
      reject(new Error('Upload failed: Network error'));
    });

    xhr.addEventListener('timeout', () => {
      const error = new Error('Upload failed: Timeout');
      error.name = 'TimeoutError';
      reject(error);
    });

    // Handle abort
    xhr.addEventListener('abort', () => {
      const error = new Error('Upload aborted');
      error.name = 'AbortError';
      reject(error);
    });

    // Listen to our controller
    controller.signal.addEventListener('abort', () => {
      aborted = true;
      xhr.abort();
    });

    // Build form data
    const formData = new FormData();
    formData.append(fieldName, file);

    if (additionalFormData) {
      for (const [key, value] of Object.entries(additionalFormData)) {
        formData.append(key, value);
      }
    }

    // Open and configure request
    xhr.open(method, url);

    if (timeout) {
      xhr.timeout = timeout;
    }

    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }

    // Send request
    xhr.send(formData);
  });

  return {
    promise,
    abort: (reason?: string) => {
      aborted = true;
      controller.abort(reason);
    },
    getProgress: () => currentProgress,
    get aborted() {
      return aborted;
    },
  };
}

/**
 * Upload multiple files with combined progress
 *
 * @example
 * ```ts
 * const { promise, abort, getProgress } = createMultiUpload(
 *   files,
 *   '/api/upload',
 *   {
 *     onProgress: (progress) => {
 *       console.log(`Overall: ${progress.overall.percentage}%`);
 *       console.log(`File 1: ${progress.files[0]?.percentage}%`);
 *     },
 *     parallel: 2, // Upload 2 files at a time
 *   }
 * );
 * ```
 */
export interface MultiUploadProgress {
  overall: UploadProgress;
  files: (UploadProgress | null)[];
  completed: number;
  total: number;
}

export interface MultiUploadOptions extends Omit<UploadOptions, 'onProgress'> {
  onProgress?: (progress: MultiUploadProgress) => void;
  /** Max parallel uploads */
  parallel?: number;
}

export interface MultiUploadResult<TResponse = unknown> {
  results: UploadResult<TResponse>[];
  errors: Error[];
}

export interface AbortableMultiUpload<TResponse = unknown> {
  /** Promise that resolves when all uploads complete */
  promise: Promise<MultiUploadResult<TResponse>>;
  /** Abort all uploads */
  abort: (reason?: string) => void;
  /** Get combined progress */
  getProgress: () => UploadProgress | null;
  /** Whether uploads were aborted */
  readonly aborted: boolean;
}

export function createMultiUpload<TResponse = unknown>(
  files: File[],
  url: string,
  options: MultiUploadOptions = {}
): AbortableMultiUpload<TResponse> {
  const { parallel = 3, onProgress, signal, ...restOptions } = options;

  const controller = new AbortController();
  let aborted = false;

  // Link to external signal
  if (signal) {
    if (signal.aborted) {
      aborted = true;
      controller.abort(signal.reason);
    } else {
      onAbort(signal, () => {
        aborted = true;
        controller.abort(signal.reason);
      });
    }
  }

  const fileProgress: (UploadProgress | null)[] = files.map(() => null);
  let completedCount = 0;

  const updateProgress = () => {
    const totalLoaded = fileProgress.reduce((sum, p) => sum + (p?.loaded ?? 0), 0);
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);

    const overall: UploadProgress = {
      loaded: totalLoaded,
      total: totalSize,
      percentage: totalSize > 0 ? Math.round((totalLoaded / totalSize) * 100) : 0,
      speed: fileProgress.reduce((sum, p) => sum + (p?.speed ?? 0), 0),
      estimatedTimeRemaining: null,
    };

    onProgress?.({
      overall,
      files: fileProgress,
      completed: completedCount,
      total: files.length,
    });
  };

  const promise = new Promise<MultiUploadResult<TResponse>>(async (resolve, reject) => {
    const results: UploadResult<TResponse>[] = [];
    const errors: Error[] = [];

    // Process files in batches
    for (let i = 0; i < files.length; i += parallel) {
      if (controller.signal.aborted) {
        const error = new Error('Upload aborted');
        error.name = 'AbortError';
        reject(error);
        return;
      }

      const batch = files.slice(i, i + parallel);
      const batchPromises = batch.map((file, batchIndex) => {
        const fileIndex = i + batchIndex;

        return createAbortableUpload<TResponse>(file, url, {
          ...restOptions,
          signal: controller.signal,
          onProgress: (progress) => {
            fileProgress[fileIndex] = progress;
            updateProgress();
          },
        }).promise.then(
          (result) => {
            completedCount++;
            updateProgress();
            return { success: true as const, result };
          },
          (error) => {
            completedCount++;
            updateProgress();
            return { success: false as const, error };
          }
        );
      });

      const batchResults = await Promise.all(batchPromises);

      for (const result of batchResults) {
        if (result.success) {
          results.push(result.result);
        } else {
          errors.push(result.error);
        }
      }
    }

    resolve({ results, errors });
  });

  return {
    promise,
    abort: (reason?: string) => {
      aborted = true;
      controller.abort(reason);
    },
    getProgress: () => {
      const totalLoaded = fileProgress.reduce((sum, p) => sum + (p?.loaded ?? 0), 0);
      const totalSize = files.reduce((sum, f) => sum + f.size, 0);

      return {
        loaded: totalLoaded,
        total: totalSize,
        percentage: totalSize > 0 ? Math.round((totalLoaded / totalSize) * 100) : 0,
        speed: fileProgress.reduce((sum, p) => sum + (p?.speed ?? 0), 0),
        estimatedTimeRemaining: null,
      };
    },
    get aborted() {
      return aborted;
    },
  };
}

/**
 * Download file with progress and abort support
 */
export interface DownloadProgress {
  loaded: number;
  total: number | null;
  percentage: number | null;
}

export interface AbortableDownload {
  promise: Promise<Blob>;
  abort: (reason?: string) => void;
  getProgress: () => DownloadProgress | null;
  readonly aborted: boolean;
}

export function createAbortableDownload(
  url: string,
  options: {
    signal?: AbortSignal;
    onProgress?: (progress: DownloadProgress) => void;
    headers?: Record<string, string>;
  } = {}
): AbortableDownload {
  const { signal, onProgress, headers } = options;

  const controller = new AbortController();
  let aborted = false;
  let currentProgress: DownloadProgress | null = null;

  if (signal) {
    if (signal.aborted) {
      aborted = true;
      controller.abort(signal.reason);
    } else {
      onAbort(signal, () => {
        aborted = true;
        controller.abort(signal.reason);
      });
    }
  }

  const promise = (async () => {
    const fetchOptions: RequestInit = {
      signal: controller.signal,
    };
    if (headers) {
      fetchOptions.headers = headers;
    }
    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }

    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : null;

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body not readable');
    }

    const chunks: Uint8Array[] = [];
    let loaded = 0;

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      chunks.push(value);
      loaded += value.length;

      currentProgress = {
        loaded,
        total,
        percentage: total ? Math.round((loaded / total) * 100) : null,
      };

      onProgress?.(currentProgress);
    }

    return new Blob(chunks as BlobPart[]);
  })();

  return {
    promise,
    abort: (reason?: string) => {
      aborted = true;
      controller.abort(reason);
    },
    getProgress: () => currentProgress,
    get aborted() {
      return aborted;
    },
  };
}
