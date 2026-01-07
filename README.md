# abort-x

**Fluent, type-safe API for AbortController/AbortSignal**

A modern, tree-shakeable library for managing async cancellation in JavaScript/TypeScript applications. Works seamlessly with fetch, streams, and any API that accepts AbortSignal.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **Zero dependencies** - Lightweight and fast
- **Tree-shakeable** - Import only what you need
- **Type-safe** - Full TypeScript support with typed abort reasons
- **Polyfills included** - Works in older browsers without native `AbortSignal.any()` or `AbortSignal.timeout()`
- **Composable** - Combine signals like you combine arrays
- **Web Standards compatible** - Works with fetch, streams, and any AbortSignal API

## Installation

```bash
npm install abort-x
```

```bash
yarn add abort-x
```

```bash
pnpm add abort-x
```


## 📦 Bundle Sizes

<!-- BUNDLE_SIZES_START -->
> Auto-generated on build. All sizes are minified.

### Modules

| Module | Minified | Gzipped |
|--------|----------|----------|
| Full bundle | 34.50 KB | 10.00 KB |
| Core | 3.88 KB | 1.23 KB |
| Combinators | 5.72 KB | 1.56 KB |
| Timing | 2.67 KB | 1.05 KB |
| Browser | 10.20 KB | 3.19 KB |
| Patterns | 9.67 KB | 3.38 KB |
| Guards | 1.42 KB | 612 B |
| React | 1.74 KB | 684 B |


### Individual Functions

| Function | Minified | Gzipped |
|----------|----------|----------|
| `timeout` | 627 B | 327 B |
| `any` | 667 B | 323 B |
| `abort` | 411 B | 209 B |
| `isAborted` | 116 B | 115 B |
| `withRetry` | 2.20 KB | 1000 B |
| `debounce` | 1.68 KB | 758 B |
| `AbortScope` | 1.89 KB | 722 B |
| `AbortX (builder)` | 2.87 KB | 1.06 KB |


### Common Use Cases

| Use Case | Minified | Gzipped |
|----------|----------|----------|
| Basic (timeout + any + isAborted) | 1.17 KB | 539 B |
| Retry with backoff | 2.24 KB | 1016 B |

<!-- BUNDLE_SIZES_END -->
## Quick Start

```typescript
import { timeout, any, withRetry } from 'abort-x';

// Simple timeout
const response = await fetch('/api/data', {
  signal: timeout(5000)
});

// Combine multiple signals
const controller = new AbortController();
const signal = any([
  timeout(5000),           // Timeout after 5s
  controller.signal,       // Manual cancellation
]);

// Cancel anytime
controller.abort();
```

---

## Table of Contents

- [Core Concepts](#core-concepts)
- [Basic Usage](#basic-usage)
- [Signal Combinators](#signal-combinators)
- [Timing Signals](#timing-signals)
- [Browser Signals](#browser-signals)
- [Patterns](#patterns)
- [Guards & Utilities](#guards--utilities)
- [Fluent Builder](#fluent-builder)
- [React Hooks](#react-hooks)
- [TypeScript](#typescript)
- [API Reference](#api-reference)

---

## Core Concepts

### The Problem

Managing async cancellation in JavaScript is tedious:

```typescript
// Without abort-x - verbose and error-prone
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 5000);

try {
  const response = await fetch('/api', { signal: controller.signal });
  clearTimeout(timeoutId);
  return response;
} catch (error) {
  clearTimeout(timeoutId);
  if (error.name === 'AbortError') {
    console.log('Request cancelled');
  }
  throw error;
}
```

### The Solution

```typescript
// With abort-x - clean and expressive
import { timeout, isAborted } from 'abort-x';

try {
  const response = await fetch('/api', { signal: timeout(5000) });
  return response;
} catch (error) {
  if (isAborted(error)) {
    console.log('Request cancelled or timed out');
  }
  throw error;
}
```

---

## Basic Usage

### Timeout

Create a signal that automatically aborts after a specified time:

```typescript
import { timeout } from 'abort-x';

// Abort after 5 seconds
const signal = timeout(5000);

await fetch('/api/slow-endpoint', { signal });
```

### Combining Signals

Combine multiple signals - aborts when **any** of them abort:

```typescript
import { any, timeout } from 'abort-x';

const userController = new AbortController();

// Abort on timeout OR user cancellation
const signal = any([
  timeout(5000),
  userController.signal,
]);

// User clicks "Cancel" button
cancelButton.onclick = () => userController.abort();

await fetch('/api/data', { signal });
```

### Already Aborted Signal

Create a signal that's already aborted:

```typescript
import { abort } from 'abort-x';

// Useful for conditional execution
const signal = shouldSkip ? abort('Skipped') : timeout(5000);
```

---

## Signal Combinators

Combinators are functions that transform or combine signals, similar to array methods.

### any / race

Abort when **any** signal aborts (like `Promise.race`):

```typescript
import { any, race, timeout } from 'abort-x';

// These are equivalent
const signal1 = any([timeout(5000), userSignal, parentSignal]);
const signal2 = race(timeout(5000), userSignal, parentSignal);
```

### all

Abort only when **all** signals have aborted (like `Promise.all`):

```typescript
import { all } from 'abort-x';

// Both conditions must be met
const signal = all([
  conditionA.signal,
  conditionB.signal,
]);
```

### map

Transform abort reasons (like `Array.map`):

```typescript
import { mapReason, timeout } from 'abort-x';

const signal = mapReason(timeout(5000), (reason) => ({
  ...reason,
  context: 'user-fetch',
  timestamp: Date.now(),
}));
```

### filter

Selectively pass through aborts (like `Array.filter`):

```typescript
import { filter, any, timeout } from 'abort-x';

const combined = any([timeout(5000), userSignal]);

// Only abort on user cancellation, ignore timeouts
const userOnlySignal = filter(combined, (reason) =>
  reason?.type === 'user_cancelled'
);
```

### tap

Side effects without modifying the signal (like RxJS `tap`):

```typescript
import { tap, timeout } from 'abort-x';

const signal = tap(timeout(5000), (reason) => {
  analytics.track('operation_aborted', { reason });
});
```

### delay

Delay abort propagation (useful for "undo" functionality):

```typescript
import { delay, tap } from 'abort-x';

// Give user 3 seconds to undo
const delayedSignal = delay(userCancelSignal, 3000);

tap(userCancelSignal, () => {
  showUndoToast('Action cancelled. Click to undo.');
});
```

### pipe

Compose multiple transformations:

```typescript
import { pipe, mapReason, filter, tap, delay } from 'abort-x';

const signal = pipe(
  baseSignal,
  s => mapReason(s, addContext),
  s => filter(s, isUserCancellation),
  s => tap(s, logToAnalytics),
  s => delay(s, 1000),
);
```

---

## Timing Signals

### timeout

Relative timeout from now:

```typescript
import { timeout } from 'abort-x';

const signal = timeout(5000); // 5 seconds from now
```

### deadline

Absolute time deadline:

```typescript
import { deadline } from 'abort-x';

// Abort at end of day
const endOfDay = new Date();
endOfDay.setHours(23, 59, 59, 999);

const signal = deadline(endOfDay);
```

### idleTimeout

Abort when user becomes inactive:

```typescript
import { idleTimeout } from 'abort-x';

const { signal, reset, dispose } = idleTimeout(30000, {
  events: ['mousemove', 'keydown', 'scroll', 'touchstart'],
});

// Auto-logout on idle
signal.addEventListener('abort', () => {
  logout('Session expired due to inactivity');
});

// Reset on important actions
saveButton.onclick = () => {
  reset();
  saveDocument();
};

// Cleanup when done
dispose();
```

---

## Browser Signals

### Online/Offline

Abort when network status changes:

```typescript
import { onlineSignal, any, timeout } from 'abort-x';

// Abort fetch when going offline
const signal = any([
  timeout(5000),
  onlineSignal(),
]);

await fetch('/api/data', { signal });
```

### Page Visibility

Abort when tab becomes hidden:

```typescript
import { visibilitySignal, hiddenSignal } from 'abort-x';

// Pause expensive operations when tab is hidden
const signal = hiddenSignal();

await processLargeDataset(data, { signal });
```

### Storage Quota

Abort when storage is nearly full:

```typescript
import { storageQuotaSignal } from 'abort-x';

// Abort when storage exceeds 90%
const signal = await storageQuotaSignal(0.9);

await downloadLargeFile(url, { signal });
```

### Memory Pressure

Abort when memory usage is high (Chrome only):

```typescript
import { memoryPressureSignal } from 'abort-x';

const signal = memoryPressureSignal(0.9);

await processHugeArray(data, { signal });
```

---

## Patterns

### Retry with Backoff

Automatic retry with exponential backoff:

```typescript
import { withRetry } from 'abort-x';

const data = await withRetry(
  (signal) => fetch('/api/flaky-endpoint', { signal }).then(r => r.json()),
  {
    attempts: 3,
    backoff: 'exponential',  // 'exponential' | 'linear' | 'fixed'
    initialDelay: 1000,
    maxDelay: 10000,
    onRetry: (attempt, error) => {
      console.log(`Retry ${attempt}: ${error.message}`);
    },
    shouldRetry: (error) => {
      // Don't retry 4xx errors
      return !error.message.includes('4');
    },
  }
);
```

### Abort Scope

Hierarchical cancellation with automatic cleanup:

```typescript
import { AbortScope } from 'abort-x';

const scope = new AbortScope();

// Run with auto-cleanup
const result = await scope.run(async (signal) => {
  const user = await fetch('/user', { signal });
  const posts = await fetch('/posts', { signal });
  return { user, posts };
});

// Execute in parallel (one error cancels all)
await scope.all([
  (signal) => fetchA(signal),
  (signal) => fetchB(signal),
  (signal) => fetchC(signal),
]);

// Cleanup everything
scope.dispose();
```

#### Child Scopes

Child scopes inherit cancellation from parent, but can be cancelled independently:

```typescript
const appScope = new AbortScope();

// Create isolated child scopes
const userScope = appScope.child();
const postsScope = appScope.child();
const notificationsScope = appScope.child();

// Start independent requests
fetchUser(userScope.signal);
fetchPosts(postsScope.signal);
fetchNotifications(notificationsScope.signal);

// Cancel only posts - user and notifications continue
postsScope.abort('user_scrolled_away');

// Cancel everything at once
appScope.dispose();
```

#### Error Isolation with Child Scopes

```typescript
const scope = new AbortScope();

// Each child isolates errors - one failure doesn't cancel others
const results = await Promise.allSettled([
  scope.child().run(async (signal) => fetch('/api/critical', { signal })),
  scope.child().run(async (signal) => fetch('/api/optional', { signal })),
]);

// vs scope.all() where one error cancels all
await scope.all([
  (signal) => fetch('/api/a', { signal }),
  (signal) => fetch('/api/b', { signal }), // Error here cancels /api/a
]);
```

#### Cleanup Functions

```typescript
const scope = new AbortScope();

// Register cleanup to run on dispose
scope.onDispose(() => {
  websocket.close();
  saveDraft();
});

// Later...
scope.dispose(); // All cleanup functions execute
```

### Debounce

Debounce async functions with automatic cancellation:

```typescript
import { debounce } from 'abort-x';

const search = debounce(
  async (query: string, signal: AbortSignal) => {
    const response = await fetch(`/search?q=${query}`, { signal });
    return response.json();
  },
  300
);

// Later calls cancel earlier pending calls
searchInput.oninput = async (e) => {
  const results = await search(e.target.value);
  displayResults(results);
};

// Cancel all pending
search.cancel();

// Execute immediately
search.flush();
```

### Throttle

Rate-limit async functions:

```typescript
import { throttle } from 'abort-x';

const saveProgress = throttle(
  async (data: GameState, signal: AbortSignal) => {
    await api.saveProgress(data, { signal });
  },
  1000  // At most once per second
);

// Call frequently, executes at most once per second
gameLoop.onTick = () => {
  saveProgress(gameState);
};
```

### Batch Operations

Process items with concurrency control:

```typescript
import { batch, mapAsync, filterAsync } from 'abort-x';

// Process with limited concurrency
const { results, successful, failed } = await batch(
  urls,
  async (url, signal) => {
    const response = await fetch(url, { signal });
    return response.json();
  },
  {
    concurrency: 3,
    signal: userSignal,
    stopOnError: false,
    onProgress: (done, total) => {
      console.log(`Progress: ${done}/${total}`);
    },
  }
);

// Map with abort support
const data = await mapAsync(
  ids,
  async (id, signal) => fetchItem(id, signal),
  userSignal
);

// Filter with async predicate
const activeUsers = await filterAsync(
  users,
  async (user, signal) => checkIsActive(user.id, signal),
  userSignal
);
```

---

## Guards & Utilities

### Type Guards

```typescript
import { isAborted, isTimeout, isAbortRelated } from 'abort-x';

try {
  await fetch(url, { signal });
} catch (error) {
  if (isAborted(error)) {
    // User cancelled
    return;
  }
  if (isTimeout(error)) {
    // Request timed out
    showTimeoutMessage();
    return;
  }
  // Real error
  throw error;
}
```

### Assertions

```typescript
import { assertNotAborted, throwIfAborted, ensure } from 'abort-x';

// Assert in sync code
function processStep(signal: AbortSignal) {
  assertNotAborted(signal);
  // ... do work
  assertNotAborted(signal);
  // ... more work
}

// Ensure in async code
await ensure(signal, async () => {
  // Only executes if signal is not aborted
  await doSomething();
});
```

### Abortable Iteration

```typescript
import { abortable } from 'abort-x';

// Automatically throws on abort
for await (const item of abortable(signal, asyncIterator)) {
  await processItem(item);
}
```

---

## Fluent Builder

For complex scenarios, use the fluent builder API:

```typescript
import { AbortX } from 'abort-x';

// Simple usage
const signal = AbortX.timeout(5000);

// Chain multiple options
const signal = AbortX.create()
  .timeout(5000)
  .with(userSignal)
  .with(parentSignal)
  .onAbort((reason) => {
    console.log('Aborted:', reason);
    cleanup();
  })
  .build();

// With progress tracking
const { signal, update } = AbortX.create()
  .timeout(10000)
  .buildWithProgress();

update(0.5);  // 50% progress
console.log(signal.progress);  // 0.5

// Auto-progress based on timeout
const { signal, stop } = AbortX.create()
  .timeout(10000)
  .withProgress(100)  // Update every 100ms
  .buildWithAutoProgress();

signal.onProgress((progress) => {
  progressBar.style.width = `${progress * 100}%`;
});
```

---

## React Hooks

```typescript
import {
  useAbortController,
  useAbortSignal,
  useAbortableAsync
} from 'abort-x/react';
```

### useAbortController

Auto-abort on unmount:

```typescript
function UserProfile({ userId }) {
  const controller = useAbortController();

  useEffect(() => {
    fetchUser(userId, controller.signal);
  }, [userId]);

  return (
    <button onClick={() => controller.abort()}>
      Cancel
    </button>
  );
}
```

### useAbortSignal

Simple signal that auto-aborts on unmount:

```typescript
function DataFetcher() {
  const signal = useAbortSignal();

  useEffect(() => {
    fetch('/api/data', { signal });
  }, [signal]);
}
```

### useAbortableAsync

Full async state management:

```typescript
function UserList() {
  const {
    data,
    loading,
    error,
    execute,
    abort
  } = useAbortableAsync(
    async (page: number, signal: AbortSignal) => {
      const response = await fetch(`/api/users?page=${page}`, { signal });
      return response.json();
    }
  );

  useEffect(() => {
    execute(1);
  }, []);

  if (loading) return <Spinner />;
  if (error) return <Error message={error.message} />;

  return (
    <>
      <UserTable users={data} />
      <button onClick={abort}>Cancel</button>
    </>
  );
}
```

---

## TypeScript

### Typed Abort Reasons

```typescript
import { TypedAbortController } from 'abort-x';

type MyReason =
  | { type: 'timeout'; duration: number }
  | { type: 'user_cancelled'; userId: string }
  | { type: 'error'; error: Error };

const controller = new TypedAbortController<MyReason>();

controller.abort({ type: 'timeout', duration: 5000 });

if (controller.signal.aborted) {
  const reason = controller.signal.reason;  // Fully typed!

  switch (reason.type) {
    case 'timeout':
      console.log(`Timed out after ${reason.duration}ms`);
      break;
    case 'user_cancelled':
      console.log(`Cancelled by user ${reason.userId}`);
      break;
    case 'error':
      console.error(reason.error);
      break;
  }
}
```

### Type-Safe Callbacks

```typescript
controller.onAbort((reason) => {
  // reason is MyReason, fully typed
  if (reason.type === 'timeout') {
    console.log(reason.duration);  // TypeScript knows this exists
  }
});
```

---

## API Reference

### Core

| Function | Description |
|----------|-------------|
| `timeout(ms)` | Signal that aborts after ms milliseconds |
| `any(signals)` | Signal that aborts when any input aborts |
| `race(...signals)` | Alias for `any()` with variadic args |
| `abort(reason?)` | Already-aborted signal |
| `TypedAbortController<T>` | Controller with typed reason |

### Combinators

| Function | Description |
|----------|-------------|
| `combine(base, ...signals)` | Combine base with additional signals |
| `all(signals)` | Abort when all signals have aborted |
| `mapReason(signal, fn)` | Transform abort reason |
| `filter(signal, predicate)` | Pass through only matching aborts |
| `tap(signal, fn)` | Side effect on abort |
| `delay(signal, ms)` | Delay abort propagation |
| `pipe(signal, ...operators)` | Compose transformations |

### Timing

| Function | Description |
|----------|-------------|
| `deadline(date)` | Abort at specific date/time |
| `idleTimeout(ms, options?)` | Abort on user inactivity |
| `withDeadline(options)` | Combine timeout and deadline |

### Browser

| Function | Description |
|----------|-------------|
| `onlineSignal()` | Abort when going offline |
| `hiddenSignal()` | Abort when tab hidden |
| `storageQuotaSignal(threshold)` | Abort on storage quota |
| `memoryPressureSignal(threshold)` | Abort on memory pressure |

### Patterns

| Function | Description |
|----------|-------------|
| `withRetry(fn, options)` | Retry with backoff |
| `AbortScope` | Hierarchical cancellation |
| `debounce(fn, ms, options?)` | Debounce async function |
| `throttle(fn, ms, options?)` | Throttle async function |
| `batch(items, fn, options?)` | Batch with concurrency |

### Guards

| Function | Description |
|----------|-------------|
| `isAborted(error)` | Check if AbortError |
| `isTimeout(error)` | Check if TimeoutError |
| `assertNotAborted(signal)` | Throw if aborted |
| `ensure(signal, fn)` | Run only if not aborted |
| `abortable(signal, iterable)` | Abort-aware iteration |

---

## Browser Support

| Feature | Chrome | Firefox | Safari | Edge | Node.js |
|---------|--------|---------|--------|------|---------|
| `AbortController` | 66+ | 57+ | 12.1+ | 16+ | 15+ |
| `AbortSignal.timeout()` | 103+ | 100+ | 16+ | 103+ | 17.3+ |
| `AbortSignal.any()` | 116+ | 124+ | 17.4+ | 116+ | 20+ |

**abort-x includes polyfills for `AbortSignal.timeout()` and `AbortSignal.any()`**, so these work in all browsers that support `AbortController`.

---

## License

MIT

---

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting a PR.

## Related

- [MDN: AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController)
- [MDN: AbortSignal](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal)
