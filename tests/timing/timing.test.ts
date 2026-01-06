import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  timeout,
  deadline,
  deadlineAt,
  withDeadline,
  fromStart,
  nextInterval,
} from '../../src/timing';

describe('timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates timeout signal', () => {
    const signal = timeout(1000);

    expect(signal.aborted).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(signal.aborted).toBe(true);
  });
});

describe('deadline', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates signal that aborts at specified date', () => {
    const now = Date.now();
    const futureDate = new Date(now + 1000);

    const signal = deadline(futureDate);

    expect(signal.aborted).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(signal.aborted).toBe(true);
  });

  it('returns aborted signal for past date', () => {
    const pastDate = new Date(Date.now() - 1000);
    const signal = deadline(pastDate);

    expect(signal.aborted).toBe(true);
  });
});

describe('deadlineAt', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates signal from timestamp', () => {
    const now = Date.now();
    const signal = deadlineAt(now + 1000);

    expect(signal.aborted).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(signal.aborted).toBe(true);
  });
});

describe('withDeadline', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates signal with timeout only', () => {
    const signal = withDeadline({ timeout: 1000 });

    vi.advanceTimersByTime(1001);
    expect(signal.aborted).toBe(true);
  });

  it('creates signal with deadline only', () => {
    const futureDate = new Date(Date.now() + 1000);
    const signal = withDeadline({ deadline: futureDate });

    vi.advanceTimersByTime(1001);
    expect(signal.aborted).toBe(true);
  });

  it('combines timeout and deadline', () => {
    const futureDate = new Date(Date.now() + 5000);
    const signal = withDeadline({
      timeout: 1000,
      deadline: futureDate,
    });

    // Timeout fires first
    vi.advanceTimersByTime(1001);
    expect(signal.aborted).toBe(true);
  });

  it('combines with external signal', () => {
    const controller = new AbortController();
    const signal = withDeadline({
      timeout: 5000,
      signal: controller.signal,
    });

    controller.abort('external');
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe('external');
  });

  it('returns non-aborting signal with no options', () => {
    const signal = withDeadline({});
    expect(signal.aborted).toBe(false);
  });
});

describe('fromStart', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates signal relative to start time', () => {
    const startTime = Date.now();
    vi.advanceTimersByTime(500); // 500ms passed

    // 1000ms budget, 500ms used, 500ms remaining
    const signal = fromStart(startTime, 1000);

    expect(signal.aborted).toBe(false);
    vi.advanceTimersByTime(501);
    expect(signal.aborted).toBe(true);
  });

  it('accepts Date as start time', () => {
    const startTime = new Date();
    vi.advanceTimersByTime(500);

    const signal = fromStart(startTime, 1000);

    expect(signal.aborted).toBe(false);
    vi.advanceTimersByTime(501);
    expect(signal.aborted).toBe(true);
  });
});

describe('nextInterval', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates signal that aborts at next interval', () => {
    // Set time to middle of interval
    vi.setSystemTime(new Date('2024-01-01T00:00:30.000Z'));

    // Next minute boundary
    const signal = nextInterval(60000);

    expect(signal.aborted).toBe(false);

    // Advance to next minute
    vi.advanceTimersByTime(30001);
    expect(signal.aborted).toBe(true);
  });
});
