import { describe, it, expect, vi } from 'vitest';
import {
  batch,
  sequence,
  parallel,
  mapAsync,
  filterAsync,
  findAsync,
} from '../../src/patterns/batch';

describe('batch', () => {
  it('processes all items successfully', async () => {
    const items = [1, 2, 3];
    const fn = vi.fn(async (item: number) => item * 2);

    const result = await batch(items, fn);

    expect(result.successful).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.aborted).toBe(false);
    expect(result.results.map(r => r.status === 'fulfilled' ? r.value : null))
      .toEqual([2, 4, 6]);
  });

  it('handles empty array', async () => {
    const result = await batch([], vi.fn());

    expect(result.results).toEqual([]);
    expect(result.successful).toBe(0);
    expect(result.failed).toBe(0);
  });

  it('handles failures without stopping', async () => {
    const items = [1, 2, 3];
    const fn = vi.fn(async (item: number) => {
      if (item === 2) throw new Error('fail');
      return item * 2;
    });

    const result = await batch(items, fn, { concurrency: 1 });

    expect(result.successful).toBe(2);
    expect(result.failed).toBe(1);
  });

  it('stops on error when stopOnError is true', async () => {
    const items = [1, 2, 3, 4, 5];
    const fn = vi.fn(async (item: number) => {
      if (item === 2) throw new Error('fail');
      return item;
    });

    const result = await batch(items, fn, {
      concurrency: 1,
      stopOnError: true,
    });

    expect(result.aborted).toBe(true);
    expect(fn).toHaveBeenCalledTimes(2); // 1 succeeded, 2 failed
  });

  it('respects concurrency limit', async () => {
    const concurrent: number[] = [];
    let maxConcurrent = 0;

    const items = [1, 2, 3, 4, 5];
    const fn = vi.fn(async (item: number) => {
      concurrent.push(item);
      maxConcurrent = Math.max(maxConcurrent, concurrent.length);
      await new Promise(r => setTimeout(r, 10));
      concurrent.splice(concurrent.indexOf(item), 1);
      return item;
    });

    await batch(items, fn, { concurrency: 2 });

    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it('calls onProgress callback', async () => {
    const onProgress = vi.fn();
    const items = [1, 2, 3];

    await batch(items, async (x) => x, {
      concurrency: 1,
      onProgress,
    });

    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenCalledWith(1, 3);
    expect(onProgress).toHaveBeenCalledWith(2, 3);
    expect(onProgress).toHaveBeenCalledWith(3, 3);
  });

  it('calls onError callback', async () => {
    const onError = vi.fn();
    const error = new Error('test error');

    await batch([1], async () => { throw error; }, { onError });

    expect(onError).toHaveBeenCalledWith(error, 0);
  });

  it('aborts when signal is aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await batch([1, 2, 3], async (x) => x, {
      signal: controller.signal,
    });

    expect(result.aborted).toBe(true);
    expect(result.failed).toBe(3);
  });

  it('passes signal to function', async () => {
    const items = [1];
    let receivedSignal: AbortSignal | undefined;

    await batch(items, async (item, signal) => {
      receivedSignal = signal;
      return item;
    });

    expect(receivedSignal).toBeInstanceOf(AbortSignal);
  });
});

describe('sequence', () => {
  it('processes items in order', async () => {
    const order: number[] = [];

    await sequence([1, 2, 3], async (item) => {
      order.push(item);
      return item;
    });

    expect(order).toEqual([1, 2, 3]);
  });
});

describe('parallel', () => {
  it('processes all items in parallel', async () => {
    const result = await parallel([1, 2, 3], async (x) => x * 2);

    expect(result.successful).toBe(3);
  });
});

describe('mapAsync', () => {
  it('maps items with signal support', async () => {
    const result = await mapAsync(
      [1, 2, 3],
      async (x) => x * 2
    );

    expect(result).toEqual([2, 4, 6]);
  });

  it('throws on first error', async () => {
    await expect(
      mapAsync([1, 2, 3], async (x) => {
        if (x === 2) throw new Error('fail');
        return x;
      })
    ).rejects.toThrow('fail');
  });
});

describe('filterAsync', () => {
  it('filters items with async predicate', async () => {
    const result = await filterAsync(
      [1, 2, 3, 4, 5],
      async (x) => x % 2 === 0
    );

    expect(result).toEqual([2, 4]);
  });
});

describe('findAsync', () => {
  it('finds first matching item', async () => {
    const result = await findAsync(
      [1, 2, 3, 4],
      async (x) => x > 2
    );

    expect(result).toBe(3);
  });

  it('returns undefined if not found', async () => {
    const result = await findAsync(
      [1, 2, 3],
      async (x) => x > 10
    );

    expect(result).toBeUndefined();
  });

  it('stops searching after finding', async () => {
    const checked: number[] = [];

    await findAsync([1, 2, 3, 4], async (x) => {
      checked.push(x);
      return x === 2;
    });

    expect(checked).toEqual([1, 2]);
  });
});
