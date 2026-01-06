# abort-x: Fluent API Library - Implementation Plan

## Browser Support Context

### AbortSignal Static Methods Support

| Method | Chrome | Firefox | Safari | Edge | Node.js |
|--------|--------|---------|--------|------|---------|
| `AbortSignal.timeout()` | 103+ | 100+ | 16+ | 103+ | 17.3+ |
| `AbortSignal.any()` | 116+ | 124+ | 17.4+ | 116+ | 20+ |
| `AbortSignal.abort()` | 93+ | 88+ | 15+ | 93+ | 15+ |

**Вывод**: Нужны полифиллы с feature detection для старых браузеров.

---

## 1. Анализ предложенного API

### Сильные стороны

| Аспект | Оценка | Комментарий |
|--------|--------|-------------|
| Fluent API | ✅ | Builder pattern хорошо подходит |
| Type Safety | ✅ | TypedAbortController - отличная идея |
| Scope Management | ✅ | AbortScope с child() - полезно для React/Vue |
| Retry Logic | ✅ | Покрывает основные сценарии |

### Проблемы и улучшения

#### 1.1 Проблема: Circular dependency в timeout

```typescript
// ❌ Текущая реализация - рекурсивный вызов
static timeout(ms: number): AbortSignal {
  if ('timeout' in AbortSignal) {
    return (AbortSignal as any).timeout(ms);
  }
  // ... fallback
}

// ✅ Нужно: отдельная функция полифилла
export function abortSignalTimeout(ms: number): AbortSignal {
  // native check + fallback
}
```

#### 1.2 Проблема: Memory leaks в combine

```typescript
// ❌ Event listeners не очищаются
signal.addEventListener('abort', () => {
  controller.abort(signal.reason);
}, { once: true });

// ✅ Нужна очистка при abort
```

#### 1.3 Проблема: Debounce не принимает signal

```typescript
// ❌ Текущая сигнатура
const search = debounce(
  async (query: string, signal: AbortSignal) => { ... },
  300
);

// ✅ Нужно: signal должен приходить автоматически
const search = debounce(
  async (query: string, { signal }) => { ... },
  300,
  { signal: externalSignal }
);
```

---

## 2. Iterator-like Methods для Signals

### Философия

Как Array методы работают с коллекциями, так abort-x методы работают с **сигналами и асинхронными операциями**.

### 2.1 Mapping & Transformation

```typescript
// Array: map(fn) -> transforms each element
// Signal: map(signal, fn) -> transforms abort reason

export function mapReason<T, U>(
  signal: AbortSignal,
  fn: (reason: T) => U
): AbortSignal {
  const controller = new AbortController();

  if (signal.aborted) {
    controller.abort(fn(signal.reason as T));
    return controller.signal;
  }

  signal.addEventListener('abort', () => {
    controller.abort(fn(signal.reason as T));
  }, { once: true });

  return controller.signal;
}

// Использование
const signal = mapReason(timeoutSignal, (reason) => ({
  ...reason,
  context: 'user-fetch',
  timestamp: Date.now()
}));
```

### 2.2 Filtering

```typescript
// Array: filter(predicate) -> keeps matching elements
// Signal: filter(signal, predicate) -> aborts only if predicate matches

export function filter(
  signal: AbortSignal,
  predicate: (reason: any) => boolean
): AbortSignal {
  const controller = new AbortController();

  signal.addEventListener('abort', () => {
    if (predicate(signal.reason)) {
      controller.abort(signal.reason);
    }
  }, { once: true });

  return controller.signal;
}

// Использование: игнорировать timeout, реагировать только на user cancel
const userOnlySignal = filter(combinedSignal, (reason) =>
  reason?.type === 'user_cancelled'
);
```

### 2.3 Reduce / Fold

```typescript
// Array: reduce(fn, initial) -> accumulates to single value
// Signal: reduceSignals(signals, fn) -> combines reasons

export function reduceSignals<T>(
  signals: AbortSignal[],
  reducer: (reasons: any[]) => T,
  options?: { waitAll?: boolean }
): AbortSignal {
  const controller = new AbortController();
  const reasons: any[] = [];
  let abortedCount = 0;

  if (options?.waitAll) {
    // Wait for ALL signals to abort
    signals.forEach((signal, index) => {
      signal.addEventListener('abort', () => {
        reasons[index] = signal.reason;
        abortedCount++;
        if (abortedCount === signals.length) {
          controller.abort(reducer(reasons));
        }
      }, { once: true });
    });
  } else {
    // Abort on first (like any())
    signals.forEach(signal => {
      signal.addEventListener('abort', () => {
        reasons.push(signal.reason);
        controller.abort(reducer(reasons));
      }, { once: true });
    });
  }

  return controller.signal;
}
```

### 2.4 Take / TakeUntil

```typescript
// Array: take(n) -> first n elements
// Signal: takeUntil(signal, predicate) -> abort when condition met

export function takeUntil(
  signal: AbortSignal,
  condition: () => boolean | Promise<boolean>,
  checkInterval = 100
): AbortSignal {
  const controller = new AbortController();

  const check = async () => {
    if (await condition()) {
      controller.abort({ type: 'condition_met' });
      return;
    }
    if (!signal.aborted && !controller.signal.aborted) {
      setTimeout(check, checkInterval);
    }
  };

  signal.addEventListener('abort', () => {
    controller.abort(signal.reason);
  }, { once: true });

  check();

  return controller.signal;
}

// Использование: abort когда память превысит лимит
const memoryLimitSignal = takeUntil(
  baseSignal,
  () => performance.memory?.usedJSHeapSize > 500_000_000
);
```

### 2.5 Delay / Debounce (как throttle в RxJS)

```typescript
// Delay abort by specified time
export function delay(
  signal: AbortSignal,
  ms: number
): AbortSignal {
  const controller = new AbortController();

  signal.addEventListener('abort', () => {
    setTimeout(() => {
      controller.abort(signal.reason);
    }, ms);
  }, { once: true });

  return controller.signal;
}

// Использование: дать время на "undo"
const delayedAbort = delay(userCancelSignal, 3000);
```

### 2.6 Race & All (как Promise.race / Promise.all)

```typescript
// Race - first signal wins (уже есть как any())
export const race = abortSignalAny;

// All - wait for all signals to abort
export function all(signals: AbortSignal[]): AbortSignal {
  return reduceSignals(signals, (reasons) => ({
    type: 'all_aborted',
    reasons
  }), { waitAll: true });
}
```

### 2.7 Tap / Inspect (side effects)

```typescript
// Array: forEach - side effect on each element
// Signal: tap - side effect on abort

export function tap(
  signal: AbortSignal,
  fn: (reason: any) => void
): AbortSignal {
  signal.addEventListener('abort', () => {
    fn(signal.reason);
  }, { once: true });

  return signal; // passthrough
}

// Использование: logging
const loggedSignal = tap(signal, (reason) => {
  analytics.track('operation_aborted', reason);
});
```

### 2.8 Pipe / Compose

```typescript
// Compose multiple transformations
export function pipe<T extends AbortSignal>(
  signal: T,
  ...fns: Array<(s: AbortSignal) => AbortSignal>
): AbortSignal {
  return fns.reduce((s, fn) => fn(s), signal as AbortSignal);
}

// Использование
const finalSignal = pipe(
  baseSignal,
  s => mapReason(s, enrichReason),
  s => filter(s, isNotTimeout),
  s => tap(s, logAbort),
  s => delay(s, 1000)
);
```

---

## 3. Дополнительные Use Cases

### 3.1 Deadline (абсолютное время)

```typescript
export function deadline(date: Date): AbortSignal {
  const ms = date.getTime() - Date.now();
  if (ms <= 0) {
    return abortSignalAbort(new DOMException('Deadline passed', 'TimeoutError'));
  }
  return abortSignalTimeout(ms);
}

// Использование
const signal = deadline(new Date('2024-12-31T23:59:59'));
```

### 3.2 Idle Timeout (отмена при бездействии)

```typescript
export function idleTimeout(
  ms: number,
  options?: { events?: string[] }
): { signal: AbortSignal; reset: () => void } {
  const events = options?.events ?? ['mousemove', 'keydown', 'scroll', 'touchstart'];
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout>;

  const reset = () => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      controller.abort({ type: 'idle_timeout', duration: ms });
    }, ms);
  };

  events.forEach(event => {
    document.addEventListener(event, reset, { passive: true });
  });

  reset();

  // Cleanup on abort
  controller.signal.addEventListener('abort', () => {
    clearTimeout(timeoutId);
    events.forEach(event => {
      document.removeEventListener(event, reset);
    });
  }, { once: true });

  return { signal: controller.signal, reset };
}

// Использование
const { signal, reset } = idleTimeout(30000);
// reset() при важных действиях пользователя
```

### 3.3 Network Status Signal

```typescript
export function onlineSignal(): AbortSignal {
  const controller = new AbortController();

  if (!navigator.onLine) {
    controller.abort({ type: 'offline' });
    return controller.signal;
  }

  const handler = () => {
    controller.abort({ type: 'went_offline' });
  };

  window.addEventListener('offline', handler, { once: true });

  controller.signal.addEventListener('abort', () => {
    window.removeEventListener('offline', handler);
  }, { once: true });

  return controller.signal;
}

// Использование: abort fetch when offline
const signal = abortSignalAny([
  timeout(5000),
  onlineSignal()
]);
```

### 3.4 Visibility Signal (tab hidden)

```typescript
export function visibilitySignal(
  options?: { abortOnHidden?: boolean }
): AbortSignal {
  const controller = new AbortController();
  const abortOnHidden = options?.abortOnHidden ?? true;

  if (document.hidden && abortOnHidden) {
    controller.abort({ type: 'tab_hidden' });
    return controller.signal;
  }

  const handler = () => {
    if (document.hidden && abortOnHidden) {
      controller.abort({ type: 'tab_hidden' });
    }
  };

  document.addEventListener('visibilitychange', handler);

  controller.signal.addEventListener('abort', () => {
    document.removeEventListener('visibilitychange', handler);
  }, { once: true });

  return controller.signal;
}
```

### 3.5 Storage Quota Signal

```typescript
export async function storageQuotaSignal(
  threshold = 0.9 // 90% usage
): Promise<AbortSignal> {
  const controller = new AbortController();

  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const check = async () => {
      const { usage, quota } = await navigator.storage.estimate();
      if (usage && quota && usage / quota > threshold) {
        controller.abort({
          type: 'storage_quota_exceeded',
          usage,
          quota,
          percentage: usage / quota
        });
      }
    };

    await check();

    // Periodic check
    const intervalId = setInterval(check, 5000);
    controller.signal.addEventListener('abort', () => {
      clearInterval(intervalId);
    }, { once: true });
  }

  return controller.signal;
}
```

### 3.6 Memory Pressure Signal

```typescript
export function memoryPressureSignal(): AbortSignal {
  const controller = new AbortController();

  if ('memory' in performance) {
    const check = () => {
      const memory = (performance as any).memory;
      const usageRatio = memory.usedJSHeapSize / memory.jsHeapSizeLimit;

      if (usageRatio > 0.9) {
        controller.abort({
          type: 'memory_pressure',
          used: memory.usedJSHeapSize,
          limit: memory.jsHeapSizeLimit
        });
      }
    };

    const intervalId = setInterval(check, 1000);
    controller.signal.addEventListener('abort', () => {
      clearInterval(intervalId);
    }, { once: true });
  }

  return controller.signal;
}
```

### 3.7 Batch Operations with Shared Signal

```typescript
export function batch<T, R>(
  items: T[],
  fn: (item: T, signal: AbortSignal) => Promise<R>,
  options?: {
    concurrency?: number;
    signal?: AbortSignal;
    stopOnError?: boolean;
  }
): Promise<PromiseSettledResult<R>[]> {
  const { concurrency = 5, signal, stopOnError = false } = options ?? {};
  const controller = new AbortController();

  if (signal) {
    signal.addEventListener('abort', () => {
      controller.abort(signal.reason);
    }, { once: true });
  }

  const results: PromiseSettledResult<R>[] = [];
  let currentIndex = 0;

  const runNext = async (): Promise<void> => {
    if (controller.signal.aborted) return;

    const index = currentIndex++;
    if (index >= items.length) return;

    try {
      const result = await fn(items[index], controller.signal);
      results[index] = { status: 'fulfilled', value: result };
    } catch (error) {
      results[index] = { status: 'rejected', reason: error };
      if (stopOnError) {
        controller.abort({ type: 'batch_error', error });
      }
    }

    await runNext();
  };

  const workers = Array(Math.min(concurrency, items.length))
    .fill(null)
    .map(() => runNext());

  return Promise.all(workers).then(() => results);
}
```

### 3.8 Circuit Breaker Pattern

```typescript
export class CircuitBreaker {
  private failures = 0;
  private lastFailure?: Date;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private options: {
      threshold: number;      // failures before open
      resetTimeout: number;   // ms before half-open
      signal?: AbortSignal;
    }
  ) {}

  async execute<T>(
    fn: (signal: AbortSignal) => Promise<T>
  ): Promise<T> {
    if (this.state === 'open') {
      if (this.shouldReset()) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    const controller = new AbortController();
    const signal = this.options.signal
      ? abortSignalAny([this.options.signal, controller.signal])
      : controller.signal;

    try {
      const result = await fn(signal);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure() {
    this.failures++;
    this.lastFailure = new Date();

    if (this.failures >= this.options.threshold) {
      this.state = 'open';
    }
  }

  private shouldReset(): boolean {
    if (!this.lastFailure) return true;
    return Date.now() - this.lastFailure.getTime() > this.options.resetTimeout;
  }
}
```

### 3.9 Progress Tracking

```typescript
export interface ProgressSignal extends AbortSignal {
  readonly progress: number; // 0-1
  onProgress(callback: (progress: number) => void): () => void;
}

export function withProgress(
  signal: AbortSignal,
  options: {
    total?: number;
    interval?: number;
  }
): {
  signal: ProgressSignal;
  update: (current: number) => void;
  increment: (delta?: number) => void;
} {
  const controller = new AbortController();
  const { total = 100, interval = 100 } = options;

  let current = 0;
  let progress = 0;
  const callbacks = new Set<(p: number) => void>();

  // Forward abort
  signal.addEventListener('abort', () => {
    controller.abort(signal.reason);
  }, { once: true });

  const progressSignal = Object.assign(controller.signal, {
    get progress() { return progress; },
    onProgress(cb: (p: number) => void) {
      callbacks.add(cb);
      return () => callbacks.delete(cb);
    }
  }) as ProgressSignal;

  const notify = () => {
    callbacks.forEach(cb => cb(progress));
  };

  return {
    signal: progressSignal,
    update(value: number) {
      current = value;
      progress = Math.min(current / total, 1);
      notify();
    },
    increment(delta = 1) {
      current += delta;
      progress = Math.min(current / total, 1);
      notify();
    }
  };
}
```

---

## 4. Module Structure (Tree-Shakeable)

```
abort-x/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Main entry - re-exports all
│   │
│   ├── core/                 # Core primitives
│   │   ├── index.ts
│   │   ├── polyfills.ts      # abortSignalTimeout, abortSignalAny, abortSignalAbort
│   │   ├── controller.ts     # TypedAbortController
│   │   └── types.ts          # Shared types
│   │
│   ├── combinators/          # Signal combinators (iterator-like)
│   │   ├── index.ts
│   │   ├── any.ts            # race/any - uses polyfill
│   │   ├── all.ts            # wait for all
│   │   ├── map.ts            # mapReason
│   │   ├── filter.ts         # filter by predicate
│   │   ├── tap.ts            # side effects
│   │   ├── delay.ts          # delay abort
│   │   ├── pipe.ts           # compose transformations
│   │   └── reduce.ts         # reduceSignals
│   │
│   ├── timing/               # Time-based signals
│   │   ├── index.ts
│   │   ├── timeout.ts        # timeout - uses polyfill
│   │   ├── deadline.ts       # absolute time
│   │   ├── idle.ts           # idle timeout
│   │   └── interval.ts       # periodic checking
│   │
│   ├── browser/              # Browser-specific signals
│   │   ├── index.ts
│   │   ├── online.ts         # network status
│   │   ├── visibility.ts     # tab visibility
│   │   ├── storage.ts        # storage quota
│   │   └── memory.ts         # memory pressure
│   │
│   ├── patterns/             # Higher-level patterns
│   │   ├── index.ts
│   │   ├── scope.ts          # AbortScope
│   │   ├── retry.ts          # withRetry
│   │   ├── debounce.ts       # debounce
│   │   ├── throttle.ts       # throttle
│   │   ├── batch.ts          # batch operations
│   │   ├── queue.ts          # TaskQueue
│   │   └── circuit-breaker.ts
│   │
│   ├── guards/               # Type guards & utilities
│   │   ├── index.ts
│   │   ├── is-aborted.ts
│   │   ├── is-timeout.ts
│   │   ├── ensure.ts
│   │   └── assert.ts
│   │
│   ├── builder/              # Builder pattern
│   │   ├── index.ts
│   │   └── abort-x-builder.ts
│   │
│   └── react/                # React integration (separate entry)
│       ├── index.ts
│       ├── use-abort-controller.ts
│       ├── use-abort-signal.ts
│       ├── use-abortable-async.ts
│       └── use-abort-scope.ts
│
├── dist/
│   ├── index.js              # ESM bundle
│   ├── index.cjs             # CommonJS
│   ├── index.d.ts            # Types
│   ├── react/
│   │   ├── index.js
│   │   └── index.d.ts
│   └── [subpath exports]
│
└── tests/
    └── [mirrors src structure]
```

### Package.json Exports

```json
{
  "name": "abort-x",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    },
    "./core": {
      "import": "./dist/core/index.js",
      "require": "./dist/core/index.cjs",
      "types": "./dist/core/index.d.ts"
    },
    "./combinators": {
      "import": "./dist/combinators/index.js",
      "require": "./dist/combinators/index.cjs",
      "types": "./dist/combinators/index.d.ts"
    },
    "./timing": {
      "import": "./dist/timing/index.js",
      "require": "./dist/timing/index.cjs",
      "types": "./dist/timing/index.d.ts"
    },
    "./browser": {
      "import": "./dist/browser/index.js",
      "require": "./dist/browser/index.cjs",
      "types": "./dist/browser/index.d.ts"
    },
    "./patterns": {
      "import": "./dist/patterns/index.js",
      "require": "./dist/patterns/index.cjs",
      "types": "./dist/patterns/index.d.ts"
    },
    "./guards": {
      "import": "./dist/guards/index.js",
      "require": "./dist/guards/index.cjs",
      "types": "./dist/guards/index.d.ts"
    },
    "./react": {
      "import": "./dist/react/index.js",
      "require": "./dist/react/index.cjs",
      "types": "./dist/react/index.d.ts"
    }
  },
  "sideEffects": false,
  "peerDependencies": {
    "react": ">=16.8.0"
  },
  "peerDependenciesMeta": {
    "react": {
      "optional": true
    }
  }
}
```

---

## 5. Core Polyfills Implementation

### 5.1 src/core/polyfills.ts

```typescript
// ============================================
// Feature Detection
// ============================================

export const supportsAbortSignalTimeout =
  typeof AbortSignal !== 'undefined' &&
  'timeout' in AbortSignal;

export const supportsAbortSignalAny =
  typeof AbortSignal !== 'undefined' &&
  'any' in AbortSignal;

export const supportsAbortSignalAbort =
  typeof AbortSignal !== 'undefined' &&
  'abort' in AbortSignal;

// ============================================
// AbortSignal.timeout() Polyfill
// ============================================

/**
 * Creates an AbortSignal that automatically aborts after specified milliseconds.
 * Uses native AbortSignal.timeout() when available.
 */
export function abortSignalTimeout(ms: number): AbortSignal {
  if (ms < 0) {
    throw new RangeError('timeout must be non-negative');
  }

  // Use native if available
  if (supportsAbortSignalTimeout) {
    return AbortSignal.timeout(ms);
  }

  // Polyfill implementation
  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort(createTimeoutError(ms));
  }, ms);

  // Prevent memory leak if signal is never used
  controller.signal.addEventListener('abort', () => {
    clearTimeout(timeoutId);
  }, { once: true });

  return controller.signal;
}

// ============================================
// AbortSignal.any() Polyfill
// ============================================

/**
 * Creates an AbortSignal that aborts when ANY of the provided signals abort.
 * Uses native AbortSignal.any() when available.
 */
export function abortSignalAny(signals: AbortSignal[]): AbortSignal {
  if (!Array.isArray(signals)) {
    throw new TypeError('signals must be an array');
  }

  if (signals.length === 0) {
    // Return a signal that never aborts
    return new AbortController().signal;
  }

  if (signals.length === 1) {
    return signals[0];
  }

  // Use native if available
  if (supportsAbortSignalAny) {
    return AbortSignal.any(signals);
  }

  // Polyfill implementation
  const controller = new AbortController();

  // Check if any signal is already aborted
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
  }

  // Track cleanup functions
  const cleanupFns: Array<() => void> = [];

  const onAbort = (signal: AbortSignal) => () => {
    if (!controller.signal.aborted) {
      controller.abort(signal.reason);
      // Cleanup all listeners
      cleanupFns.forEach(fn => fn());
    }
  };

  for (const signal of signals) {
    const handler = onAbort(signal);
    signal.addEventListener('abort', handler, { once: true });
    cleanupFns.push(() => signal.removeEventListener('abort', handler));
  }

  return controller.signal;
}

// ============================================
// AbortSignal.abort() Polyfill
// ============================================

/**
 * Creates an already-aborted AbortSignal with the given reason.
 * Uses native AbortSignal.abort() when available.
 */
export function abortSignalAbort(reason?: any): AbortSignal {
  // Use native if available
  if (supportsAbortSignalAbort) {
    return AbortSignal.abort(reason);
  }

  // Polyfill implementation
  const controller = new AbortController();
  controller.abort(reason ?? createAbortError());
  return controller.signal;
}

// ============================================
// Error Factories
// ============================================

export function createTimeoutError(ms?: number): DOMException {
  const message = ms !== undefined
    ? `The operation timed out after ${ms}ms`
    : 'The operation timed out';
  return new DOMException(message, 'TimeoutError');
}

export function createAbortError(message = 'The operation was aborted'): DOMException {
  return new DOMException(message, 'AbortError');
}

// ============================================
// Type Augmentation for older TS versions
// ============================================

declare global {
  interface AbortSignalConstructor {
    timeout?(ms: number): AbortSignal;
    any?(signals: AbortSignal[]): AbortSignal;
    abort?(reason?: any): AbortSignal;
  }
}
```

### 5.2 Использование polyfills

```typescript
// Пользователь импортирует из core
import { abortSignalTimeout, abortSignalAny } from 'abort-x/core';

// Или использует обёртки из основного API
import { timeout, any } from 'abort-x';

// Внутри библиотеки - всегда используем polyfills
// src/timing/timeout.ts
import { abortSignalTimeout } from '../core/polyfills';

export { abortSignalTimeout as timeout };
```

---

## 6. Implementation Priority

### Phase 1: Core (Week 1)
1. ✅ Project setup (tsconfig, package.json, build)
2. ✅ `src/core/polyfills.ts` - timeout, any, abort
3. ✅ `src/core/types.ts` - shared types
4. ✅ `src/core/controller.ts` - TypedAbortController
5. ✅ `src/guards/*` - isAborted, isTimeout, ensure

### Phase 2: Combinators (Week 2)
1. `src/combinators/any.ts` - race
2. `src/combinators/all.ts` - wait all
3. `src/combinators/map.ts` - mapReason
4. `src/combinators/filter.ts`
5. `src/combinators/tap.ts`
6. `src/combinators/delay.ts`
7. `src/combinators/pipe.ts`

### Phase 3: Timing & Browser (Week 3)
1. `src/timing/timeout.ts`
2. `src/timing/deadline.ts`
3. `src/timing/idle.ts`
4. `src/browser/online.ts`
5. `src/browser/visibility.ts`

### Phase 4: Patterns (Week 4)
1. `src/patterns/scope.ts` - AbortScope
2. `src/patterns/retry.ts` - withRetry
3. `src/patterns/debounce.ts`
4. `src/patterns/throttle.ts`
5. `src/patterns/batch.ts`

### Phase 5: Builder & React (Week 5)
1. `src/builder/abort-x-builder.ts`
2. `src/react/*` - all hooks

### Phase 6: Advanced (Week 6)
1. `src/patterns/queue.ts` - TaskQueue
2. `src/patterns/circuit-breaker.ts`
3. Progress tracking
4. Documentation & examples

---

## 7. API Summary

### Основные exports из 'abort-x'

```typescript
// Core (всегда доступны)
export {
  abortSignalTimeout as timeout,
  abortSignalAny as any,
  abortSignalAbort as abort,
} from './core/polyfills';

export { TypedAbortController } from './core/controller';

// Combinators
export {
  race,      // alias for any
  all,       // wait for all signals
  mapReason, // transform reason
  filter,    // filter by predicate
  tap,       // side effects
  delay,     // delay abort
  pipe,      // compose
} from './combinators';

// Timing
export {
  timeout,   // re-export
  deadline,  // absolute time
  idleTimeout,
} from './timing';

// Browser
export {
  onlineSignal,
  visibilitySignal,
  storageQuotaSignal,
  memoryPressureSignal,
} from './browser';

// Patterns
export {
  AbortScope,
  withRetry,
  debounce,
  throttle,
  batch,
  TaskQueue,
  CircuitBreaker,
} from './patterns';

// Guards
export {
  isAborted,
  isTimeout,
  ensure,
  assertNotAborted,
} from './guards';

// Builder
export { AbortX } from './builder';
```

---

## 8. Testing Strategy

```typescript
// Тестирование полифиллов с/без native support
describe('abortSignalTimeout', () => {
  it('creates signal that aborts after specified time', async () => {
    const signal = abortSignalTimeout(100);
    expect(signal.aborted).toBe(false);

    await sleep(150);

    expect(signal.aborted).toBe(true);
    expect(signal.reason.name).toBe('TimeoutError');
  });

  it('works without native support', () => {
    // Temporarily remove native
    const original = AbortSignal.timeout;
    delete (AbortSignal as any).timeout;

    const signal = abortSignalTimeout(100);
    expect(signal).toBeInstanceOf(AbortSignal);

    // Restore
    (AbortSignal as any).timeout = original;
  });
});
```

---

## 9. Bundle Size Targets

| Import | Target Size (minified + gzip) |
|--------|------------------------------|
| `abort-x/core` | < 1 KB |
| `abort-x/combinators` | < 1.5 KB |
| `abort-x/timing` | < 1 KB |
| `abort-x/patterns` | < 3 KB |
| `abort-x/react` | < 2 KB |
| Full bundle | < 8 KB |

---

## 10. Совместимость с Web Standards

### Полная совместимость с:
- `AbortController` / `AbortSignal` API
- `fetch()` API
- `addEventListener` options ({ signal })
- Streams API (`ReadableStream`, `WritableStream`)
- `EventTarget` patterns

### Расширения (не ломают стандарты):
- `TypedAbortSignal<T>` - extends AbortSignal
- `ProgressSignal` - extends AbortSignal
- Custom reason types

```typescript
// Всё работает со стандартными API
const signal = timeout(5000);

// fetch
await fetch('/api', { signal });

// addEventListener
element.addEventListener('click', handler, { signal });

// Streams
const stream = new ReadableStream({
  // ...
}, { signal });

// Custom APIs that accept AbortSignal
myCustomFunction({ signal });
```
