import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AbortX, AbortXBuilder } from '../../src/builder';

describe('AbortXBuilder', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('builds a basic signal', () => {
    const signal = new AbortXBuilder().build();
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);
  });

  it('adds timeout', () => {
    const signal = new AbortXBuilder()
      .timeout(1000)
      .build();

    expect(signal.aborted).toBe(false);

    vi.advanceTimersByTime(1001);
    expect(signal.aborted).toBe(true);
  });

  it('combines with other signals', () => {
    const controller = new AbortController();
    const signal = new AbortXBuilder()
      .with(controller.signal)
      .build();

    controller.abort('test');
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe('test');
  });

  it('combines timeout with signals', () => {
    const controller = new AbortController();
    const signal = new AbortXBuilder()
      .timeout(5000)
      .with(controller.signal)
      .build();

    controller.abort('early');
    expect(signal.aborted).toBe(true);
  });

  it('calls onAbort callbacks', () => {
    const callback = vi.fn();
    const controller = new AbortController();

    const signal = new AbortXBuilder()
      .with(controller.signal)
      .onAbort(callback)
      .build();

    controller.abort('reason');
    expect(callback).toHaveBeenCalledWith('reason');
  });

  it('supports multiple onAbort callbacks', () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const controller = new AbortController();

    new AbortXBuilder()
      .with(controller.signal)
      .onAbort(cb1)
      .onAbort(cb2)
      .build();

    controller.abort();
    expect(cb1).toHaveBeenCalled();
    expect(cb2).toHaveBeenCalled();
  });

  it('throws on non-positive timeout', () => {
    expect(() => new AbortXBuilder().timeout(0)).toThrow(RangeError);
    expect(() => new AbortXBuilder().timeout(-1)).toThrow(RangeError);
  });

  describe('withProgress', () => {
    it('sets progress interval', () => {
      const builder = new AbortXBuilder().withProgress(50);
      // Just verify it doesn't throw
      expect(builder).toBeInstanceOf(AbortXBuilder);
    });
  });

  describe('buildWithProgress', () => {
    it('returns signal with progress tracking', () => {
      const { signal, update } = new AbortXBuilder().buildWithProgress();

      expect(signal.progress).toBe(0);

      update(0.5);
      expect(signal.progress).toBe(0.5);

      update(1);
      expect(signal.progress).toBe(1);
    });

    it('clamps progress to 0-1', () => {
      const { signal, update } = new AbortXBuilder().buildWithProgress();

      update(-0.5);
      expect(signal.progress).toBe(0);

      update(1.5);
      expect(signal.progress).toBe(1);
    });

    it('onProgress receives updates', () => {
      const callback = vi.fn();
      const { signal, update } = new AbortXBuilder().buildWithProgress();

      signal.onProgress(callback);
      update(0.5);

      expect(callback).toHaveBeenCalledWith(0.5);
    });

    it('onProgress returns cleanup function', () => {
      const callback = vi.fn();
      const { signal, update } = new AbortXBuilder().buildWithProgress();

      const cleanup = signal.onProgress(callback);
      cleanup();
      update(0.5);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('buildWithAutoProgress', () => {
    it('auto-updates progress based on timeout', () => {
      const { signal, stop } = new AbortXBuilder()
        .timeout(1000)
        .withProgress(100)
        .buildWithAutoProgress();

      vi.advanceTimersByTime(500);
      expect(signal.progress).toBeCloseTo(0.5, 1);

      stop();
    });

    it('throws without timeout', () => {
      expect(() => new AbortXBuilder().buildWithAutoProgress()).toThrow();
    });
  });
});

describe('AbortX', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('create returns builder', () => {
    expect(AbortX.create()).toBeInstanceOf(AbortXBuilder);
  });

  it('timeout creates timeout signal', () => {
    const signal = AbortX.timeout(1000);

    vi.advanceTimersByTime(1001);
    expect(signal.aborted).toBe(true);
  });

  it('any combines signals', () => {
    const c1 = new AbortController();
    const c2 = new AbortController();

    const signal = AbortX.any(c1.signal, c2.signal);

    c1.abort('first');
    expect(signal.aborted).toBe(true);
  });

  it('combine is alias for any', () => {
    const c1 = new AbortController();
    const signal = AbortX.combine(c1.signal);

    c1.abort();
    expect(signal.aborted).toBe(true);
  });

  it('race is alias for any', () => {
    const c1 = new AbortController();
    const signal = AbortX.race(c1.signal);

    c1.abort();
    expect(signal.aborted).toBe(true);
  });

  it('abort creates aborted signal', () => {
    const signal = AbortX.abort('reason');

    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe('reason');
  });

  it('never returns non-aborting signal', () => {
    const signal = AbortX.never();
    expect(signal.aborted).toBe(false);
  });

  it('withTimeout starts builder with timeout', () => {
    const builder = AbortX.withTimeout(1000);
    expect(builder).toBeInstanceOf(AbortXBuilder);

    const signal = builder.build();
    vi.advanceTimersByTime(1001);
    expect(signal.aborted).toBe(true);
  });

  it('from starts builder with signals', () => {
    const controller = new AbortController();
    const builder = AbortX.from(controller.signal);

    expect(builder).toBeInstanceOf(AbortXBuilder);
  });
});
