/**
 * WebSocket abort adapter
 *
 * Solves:
 * - Case #21: WebSocket and AbortController - AbortController doesn't work with WebSocket
 */

import { onAbort } from '../combinators/tap';

export interface AbortableWebSocketOptions {
  /** Abort signal */
  signal?: AbortSignal;
  /** WebSocket protocols */
  protocols?: string | string[];
  /** Auto-reconnect on abort (soft abort scenario) */
  reconnectOnAbort?: boolean;
  /** Reconnect delay in ms */
  reconnectDelay?: number;
  /** Max reconnect attempts */
  maxReconnects?: number;
}

export interface AbortableWebSocket {
  /** The WebSocket instance */
  ws: WebSocket;
  /** Close the connection */
  close: (code?: number, reason?: string) => void;
  /** Send data */
  send: (data: string | ArrayBuffer | Blob) => void;
  /** Add message listener */
  onMessage: (callback: (event: MessageEvent) => void) => () => void;
  /** Add error listener */
  onError: (callback: (event: Event) => void) => () => void;
  /** Add close listener */
  onClose: (callback: (event: CloseEvent) => void) => () => void;
  /** Add open listener */
  onOpen: (callback: (event: Event) => void) => () => void;
  /** Connection state */
  readonly state: 'connecting' | 'open' | 'closing' | 'closed';
  /** Whether connection was aborted */
  readonly aborted: boolean;
}

/**
 * Create an abort-aware WebSocket connection
 *
 * @example
 * ```ts
 * const controller = new AbortController();
 *
 * const { ws, onMessage, close } = createAbortableWebSocket(
 *   'wss://api.example.com/ws',
 *   { signal: controller.signal }
 * );
 *
 * const unsubscribe = onMessage((event) => {
 *   console.log('Message:', event.data);
 * });
 *
 * // Later: abort closes the WebSocket
 * controller.abort();
 *
 * // Or close manually
 * close(1000, 'User closed');
 * ```
 */
export function createAbortableWebSocket(
  url: string | URL,
  options: AbortableWebSocketOptions = {}
): AbortableWebSocket {
  const {
    signal,
    protocols,
    reconnectOnAbort = false,
    reconnectDelay = 1000,
    maxReconnects = 3,
  } = options;

  let ws: WebSocket;
  let aborted = false;
  let reconnectAttempts = 0;
  const messageListeners = new Set<(event: MessageEvent) => void>();
  const errorListeners = new Set<(event: Event) => void>();
  const closeListeners = new Set<(event: CloseEvent) => void>();
  const openListeners = new Set<(event: Event) => void>();

  function connect(): WebSocket {
    const socket = new WebSocket(url, protocols);

    socket.addEventListener('message', (event) => {
      messageListeners.forEach((cb) => cb(event));
    });

    socket.addEventListener('error', (event) => {
      errorListeners.forEach((cb) => cb(event));
    });

    socket.addEventListener('close', (event) => {
      closeListeners.forEach((cb) => cb(event));

      // Auto-reconnect logic
      if (
        reconnectOnAbort &&
        aborted &&
        reconnectAttempts < maxReconnects
      ) {
        reconnectAttempts++;
        setTimeout(() => {
          ws = connect();
        }, reconnectDelay * reconnectAttempts);
      }
    });

    socket.addEventListener('open', (event) => {
      reconnectAttempts = 0;
      openListeners.forEach((cb) => cb(event));
    });

    return socket;
  }

  ws = connect();

  // Handle abort signal
  if (signal) {
    if (signal.aborted) {
      aborted = true;
      ws.close(4000, 'Aborted');
    } else {
      onAbort(signal, () => {
        aborted = true;
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close(4000, 'Aborted');
        }
      });
    }
  }

  const getState = (): 'connecting' | 'open' | 'closing' | 'closed' => {
    switch (ws.readyState) {
      case WebSocket.CONNECTING:
        return 'connecting';
      case WebSocket.OPEN:
        return 'open';
      case WebSocket.CLOSING:
        return 'closing';
      case WebSocket.CLOSED:
      default:
        return 'closed';
    }
  };

  return {
    get ws() {
      return ws;
    },
    close: (code?: number, reason?: string) => {
      ws.close(code, reason);
    },
    send: (data: string | ArrayBuffer | Blob) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    },
    onMessage: (callback: (event: MessageEvent) => void) => {
      messageListeners.add(callback);
      return () => messageListeners.delete(callback);
    },
    onError: (callback: (event: Event) => void) => {
      errorListeners.add(callback);
      return () => errorListeners.delete(callback);
    },
    onClose: (callback: (event: CloseEvent) => void) => {
      closeListeners.add(callback);
      return () => closeListeners.delete(callback);
    },
    onOpen: (callback: (event: Event) => void) => {
      openListeners.add(callback);
      return () => openListeners.delete(callback);
    },
    get state() {
      return getState();
    },
    get aborted() {
      return aborted;
    },
  };
}

/**
 * Create a WebSocket that closes when any of the signals abort
 */
export function createWebSocketWithSignals(
  url: string | URL,
  signals: AbortSignal[],
  options?: Omit<AbortableWebSocketOptions, 'signal'>
): AbortableWebSocket {
  const controller = new AbortController();

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener('abort', () => {
      controller.abort(signal.reason);
    });
  }

  return createAbortableWebSocket(url, {
    ...options,
    signal: controller.signal,
  });
}
