import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  any,
  race,
  combine,
  all,
  mapReason,
  filter,
  tap,
  delay,
  pipe,
} from '../../src/combinators';

describe('any / race / combine', () => {
  it('any: returns first aborted signal reason', () => {
    const c1 = new AbortController();
    const c2 = new AbortController();

    const signal = any([c1.signal, c2.signal]);

    c2.abort('second');
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe('second');
  });

  it('race: is alias for any', () => {
    const c1 = new AbortController();
    const signal = race(c1.signal);
    expect(signal).toBe(c1.signal);
  });

  it('combine: combines base with additional signals', () => {
    const base = new AbortController();
    const additional = new AbortController();

    const signal = combine(base.signal, additional.signal);

    additional.abort('additional');
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe('additional');
  });

  it('combine: returns base signal when no additional', () => {
    const base = new AbortController();
    const signal = combine(base.signal);
    expect(signal).toBe(base.signal);
  });
});

describe('all', () => {
  it('aborts when all signals have aborted', () => {
    const c1 = new AbortController();
    const c2 = new AbortController();

    const signal = all([c1.signal, c2.signal]);

    c1.abort('first');
    expect(signal.aborted).toBe(false);

    c2.abort('second');
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toEqual({
      type: 'all_aborted',
      reasons: ['first', 'second'],
    });
  });

  it('aborts immediately if all inputs already aborted', () => {
    const c1 = new AbortController();
    const c2 = new AbortController();

    c1.abort('first');
    c2.abort('second');

    const signal = all([c1.signal, c2.signal]);

    expect(signal.aborted).toBe(true);
  });
});

describe('mapReason', () => {
  it('transforms abort reason', () => {
    const controller = new AbortController();
    const signal = mapReason(controller.signal, (reason) => ({
      original: reason,
      transformed: true,
    }));

    controller.abort('original');

    expect(signal.aborted).toBe(true);
    expect(signal.reason).toEqual({
      original: 'original',
      transformed: true,
    });
  });

  it('handles already aborted signal', () => {
    const controller = new AbortController();
    controller.abort('pre-aborted');

    const signal = mapReason(controller.signal, (r) => `mapped: ${r}`);

    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe('mapped: pre-aborted');
  });
});

describe('filter', () => {
  it('passes through when predicate matches', () => {
    const controller = new AbortController();
    const signal = filter(controller.signal, () => true);

    controller.abort('reason');
    expect(signal.aborted).toBe(true);
  });

  it('blocks when predicate does not match', () => {
    const controller = new AbortController();
    const signal = filter(controller.signal, () => false);

    controller.abort('reason');
    expect(signal.aborted).toBe(false);
  });

  it('filters by reason type', () => {
    const controller = new AbortController();
    const signal = filter(
      controller.signal,
      (reason: any) => reason?.type === 'user'
    );

    controller.abort({ type: 'timeout' });
    expect(signal.aborted).toBe(false);
  });
});

describe('tap', () => {
  it('executes side effect on abort', () => {
    const controller = new AbortController();
    const callback = vi.fn();

    tap(controller.signal, callback);
    controller.abort('reason');

    expect(callback).toHaveBeenCalledWith('reason');
  });

  it('returns the same signal', () => {
    const controller = new AbortController();
    const result = tap(controller.signal, () => {});
    expect(result).toBe(controller.signal);
  });

  it('handles already aborted signal', () => {
    const controller = new AbortController();
    controller.abort('pre-aborted');

    const callback = vi.fn();
    tap(controller.signal, callback);

    expect(callback).toHaveBeenCalledWith('pre-aborted');
  });
});

describe('delay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('delays abort propagation', () => {
    const controller = new AbortController();
    const signal = delay(controller.signal, 1000);

    controller.abort('reason');
    expect(signal.aborted).toBe(false);

    vi.advanceTimersByTime(1001);
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe('reason');
  });

  it('returns original signal for zero delay', () => {
    const controller = new AbortController();
    const signal = delay(controller.signal, 0);
    expect(signal).toBe(controller.signal);
  });
});

describe('pipe', () => {
  it('composes multiple transformations', () => {
    const controller = new AbortController();

    const signal = pipe(
      controller.signal,
      (s) => mapReason(s, (r) => ({ original: r })),
      (s) => mapReason(s, (r: any) => ({ ...r, step2: true }))
    );

    controller.abort('start');

    expect(signal.aborted).toBe(true);
    expect(signal.reason).toEqual({
      original: 'start',
      step2: true,
    });
  });

  it('returns original signal with no operators', () => {
    const controller = new AbortController();
    const signal = pipe(controller.signal);
    expect(signal).toBe(controller.signal);
  });
});
