import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry, retryable, withRetryResult } from '../../src/patterns/retry';

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const result = await withRetry(fn);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success');

    const promise = withRetry(fn, {
      attempts: 3,
      backoff: 'fixed',
      initialDelay: 100,
    });

    // First attempt fails immediately
    await vi.advanceTimersByTimeAsync(0);

    // Wait for retry delays
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(100);

    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws after all attempts exhausted', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));

    const promise = withRetry(fn, {
      attempts: 2,
      backoff: 'fixed',
      initialDelay: 100,
    });

    // Allow first attempt to fail
    await vi.advanceTimersByTimeAsync(0);
    // Wait for retry delay
    await vi.advanceTimersByTimeAsync(100);
    // Allow second attempt to run and fail
    await vi.advanceTimersByTimeAsync(0);

    await expect(promise).rejects.toThrow('always fails');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('uses exponential backoff', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('success');

    const promise = withRetry(fn, {
      attempts: 3,
      backoff: 'exponential',
      initialDelay: 100,
    });

    // First retry after 100ms
    await vi.advanceTimersByTimeAsync(100);
    // Second retry after 200ms (100 * 2^1)
    await vi.advanceTimersByTimeAsync(200);

    const result = await promise;
    expect(result).toBe('success');
  });

  it('respects maxDelay', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('success');

    const promise = withRetry(fn, {
      attempts: 2,
      backoff: 'exponential',
      initialDelay: 1000,
      maxDelay: 500, // max is less than initial * 2
    });

    // Should use maxDelay
    await vi.advanceTimersByTimeAsync(500);

    const result = await promise;
    expect(result).toBe('success');
  });

  it('calls onRetry callback', async () => {
    const onRetry = vi.fn();
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('success');

    const promise = withRetry(fn, {
      attempts: 2,
      backoff: 'fixed',
      initialDelay: 100,
      onRetry,
    });

    await vi.advanceTimersByTimeAsync(100);
    await promise;

    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error), 100);
  });

  it('respects shouldRetry predicate', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('non-retryable'));

    const promise = withRetry(fn, {
      attempts: 3,
      shouldRetry: (error) => !error.message.includes('non-retryable'),
    });

    await expect(promise).rejects.toThrow('non-retryable');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('aborts when signal is aborted', async () => {
    const controller = new AbortController();
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    const promise = withRetry(fn, {
      attempts: 3,
      initialDelay: 1000,
      signal: controller.signal,
    });

    controller.abort();

    await expect(promise).rejects.toThrow();
  });

  it('throws if attempts < 1', async () => {
    await expect(withRetry(vi.fn(), { attempts: 0 })).rejects.toThrow();
  });
});

describe('retryable', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a retryable version of function', async () => {
    let calls = 0;
    const fn = vi.fn(async (signal: AbortSignal, x: number) => {
      calls++;
      if (calls < 2) throw new Error('fail');
      return x * 2;
    });

    const retryableFn = retryable(fn, {
      attempts: 3,
      backoff: 'fixed',
      initialDelay: 100,
    });

    const controller = new AbortController();
    const promise = retryableFn(controller.signal, 5);

    await vi.advanceTimersByTimeAsync(100);
    const result = await promise;

    expect(result).toBe(10);
  });
});

describe('withRetryResult', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns detailed result with attempt count', async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls < 2) throw new Error('fail');
      return 'success';
    });

    const promise = withRetryResult(fn, {
      attempts: 3,
      backoff: 'fixed',
      initialDelay: 100,
    });

    await vi.advanceTimersByTimeAsync(100);
    const result = await promise;

    expect(result.value).toBe('success');
    expect(result.attempts).toBe(2);
    expect(result.totalTime).toBeGreaterThanOrEqual(0);
  });
});
