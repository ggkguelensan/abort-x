import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  abortSignalTimeout,
  abortSignalAny,
  abortSignalAbort,
  supportsAbortSignalTimeout,
  supportsAbortSignalAny,
  supportsAbortSignalAbort,
} from '../../src/core/polyfills';

describe('abortSignalTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a signal that is not immediately aborted', () => {
    const signal = abortSignalTimeout(1000);
    expect(signal.aborted).toBe(false);
  });

  it('aborts after specified timeout', async () => {
    const signal = abortSignalTimeout(1000);

    vi.advanceTimersByTime(999);
    expect(signal.aborted).toBe(false);

    vi.advanceTimersByTime(2);
    expect(signal.aborted).toBe(true);
  });

  it('sets TimeoutError as reason', async () => {
    const signal = abortSignalTimeout(100);

    vi.advanceTimersByTime(101);

    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBeInstanceOf(DOMException);
    expect((signal.reason as DOMException).name).toBe('TimeoutError');
  });

  it('throws RangeError for negative timeout', () => {
    expect(() => abortSignalTimeout(-1)).toThrow(RangeError);
  });

  it('allows zero timeout', () => {
    const signal = abortSignalTimeout(0);
    vi.advanceTimersByTime(1);
    expect(signal.aborted).toBe(true);
  });
});

describe('abortSignalAny', () => {
  it('returns signal that never aborts for empty array', () => {
    const signal = abortSignalAny([]);
    expect(signal.aborted).toBe(false);
  });

  it('returns the single signal when only one provided', () => {
    const controller = new AbortController();
    const signal = abortSignalAny([controller.signal]);
    expect(signal).toBe(controller.signal);
  });

  it('aborts when any signal aborts', () => {
    const controller1 = new AbortController();
    const controller2 = new AbortController();
    const signal = abortSignalAny([controller1.signal, controller2.signal]);

    expect(signal.aborted).toBe(false);

    controller1.abort('reason1');
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe('reason1');
  });

  it('is already aborted if any input signal is aborted', () => {
    const controller1 = new AbortController();
    const controller2 = new AbortController();

    controller1.abort('pre-aborted');

    const signal = abortSignalAny([controller1.signal, controller2.signal]);
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe('pre-aborted');
  });

  it('preserves the reason from the first aborted signal', () => {
    const controller1 = new AbortController();
    const controller2 = new AbortController();
    const signal = abortSignalAny([controller1.signal, controller2.signal]);

    controller2.abort({ type: 'custom' });
    expect(signal.reason).toEqual({ type: 'custom' });

    // Second abort should not change reason
    controller1.abort('second');
    expect(signal.reason).toEqual({ type: 'custom' });
  });
});

describe('abortSignalAbort', () => {
  it('creates an already-aborted signal', () => {
    const signal = abortSignalAbort();
    expect(signal.aborted).toBe(true);
  });

  it('uses default AbortError when no reason provided', () => {
    const signal = abortSignalAbort();
    expect(signal.reason).toBeInstanceOf(DOMException);
    expect((signal.reason as DOMException).name).toBe('AbortError');
  });

  it('uses provided reason', () => {
    const reason = { type: 'custom', message: 'test' };
    const signal = abortSignalAbort(reason);
    expect(signal.reason).toEqual(reason);
  });
});

describe('feature detection', () => {
  it('detects AbortSignal.timeout support', () => {
    expect(typeof supportsAbortSignalTimeout).toBe('boolean');
  });

  it('detects AbortSignal.any support', () => {
    expect(typeof supportsAbortSignalAny).toBe('boolean');
  });

  it('detects AbortSignal.abort support', () => {
    expect(typeof supportsAbortSignalAbort).toBe('boolean');
  });
});
