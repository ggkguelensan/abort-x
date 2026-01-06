import { describe, it, expect, vi } from 'vitest';
import {
  ensure,
  assertNotAborted,
  throwIfAborted,
  runWithAbortCheck,
  abortable,
} from '../../src/guards/ensure';

describe('ensure', () => {
  it('executes function if signal not aborted', async () => {
    const controller = new AbortController();
    const fn = vi.fn().mockResolvedValue('result');

    const result = await ensure(controller.signal, fn);

    expect(result).toBe('result');
    expect(fn).toHaveBeenCalled();
  });

  it('throws if signal already aborted', async () => {
    const controller = new AbortController();
    controller.abort('already');

    await expect(
      ensure(controller.signal, () => Promise.resolve('result'))
    ).rejects.toThrow();
  });

  it('throws if signal aborts during execution', async () => {
    const controller = new AbortController();

    const promise = ensure(controller.signal, async () => {
      await new Promise(r => setTimeout(r, 100));
      return 'result';
    });

    controller.abort('during');

    await expect(promise).rejects.toThrow();
  });

  it('preserves abort reason', async () => {
    const controller = new AbortController();
    controller.abort({ type: 'custom' });

    try {
      await ensure(controller.signal, () => Promise.resolve());
    } catch (error) {
      expect(error).toEqual({ type: 'custom' });
    }
  });
});

describe('assertNotAborted', () => {
  it('does nothing if signal not aborted', () => {
    const controller = new AbortController();
    expect(() => assertNotAborted(controller.signal)).not.toThrow();
  });

  it('throws if signal aborted', () => {
    const controller = new AbortController();
    controller.abort('reason');

    expect(() => assertNotAborted(controller.signal)).toThrow();
  });

  it('uses custom message', () => {
    const controller = new AbortController();
    controller.abort();

    expect(() => assertNotAborted(controller.signal, 'Custom message')).toThrow();
  });

  it('throws the abort reason', () => {
    const controller = new AbortController();
    const reason = { type: 'test' };
    controller.abort(reason);

    try {
      assertNotAborted(controller.signal);
    } catch (error) {
      expect(error).toBe(reason);
    }
  });
});

describe('throwIfAborted', () => {
  it('does nothing if signal not aborted', () => {
    const controller = new AbortController();
    expect(() => throwIfAborted(controller.signal)).not.toThrow();
  });

  it('throws if signal aborted', () => {
    const controller = new AbortController();
    controller.abort('reason');

    expect(() => throwIfAborted(controller.signal)).toThrow();
  });
});

describe('runWithAbortCheck', () => {
  it('runs generator with periodic abort checks', async () => {
    const controller = new AbortController();
    const steps: number[] = [];

    const result = await runWithAbortCheck(controller.signal, async function* () {
      steps.push(1);
      yield;
      steps.push(2);
      yield;
      steps.push(3);
      return 'done';
    });

    expect(result).toBe('done');
    expect(steps).toEqual([1, 2, 3]);
  });

  it('stops on abort', async () => {
    const controller = new AbortController();
    const steps: number[] = [];

    const promise = runWithAbortCheck(controller.signal, async function* () {
      steps.push(1);
      yield;
      controller.abort();
      steps.push(2);
      yield;
      steps.push(3);
      return 'done';
    });

    await expect(promise).rejects.toThrow();
    expect(steps).toEqual([1, 2]);
  });
});

describe('abortable', () => {
  it('yields items from sync iterable', async () => {
    const controller = new AbortController();
    const items: number[] = [];

    for await (const item of abortable(controller.signal, [1, 2, 3])) {
      items.push(item);
    }

    expect(items).toEqual([1, 2, 3]);
  });

  it('yields items from async iterable', async () => {
    const controller = new AbortController();
    const items: number[] = [];

    async function* asyncGen() {
      yield 1;
      yield 2;
      yield 3;
    }

    for await (const item of abortable(controller.signal, asyncGen())) {
      items.push(item);
    }

    expect(items).toEqual([1, 2, 3]);
  });

  it('throws on abort', async () => {
    const controller = new AbortController();
    const items: number[] = [];

    async function* asyncGen() {
      yield 1;
      yield 2;
      yield 3;
    }

    await expect(async () => {
      for await (const item of abortable(controller.signal, asyncGen())) {
        items.push(item);
        if (item === 2) controller.abort();
      }
    }).rejects.toThrow();

    expect(items).toEqual([1, 2]);
  });
});
