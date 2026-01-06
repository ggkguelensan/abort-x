import { describe, it, expect } from 'vitest';
import {
  isAborted,
  isTimeout,
  isAbortRelated,
  isSignalAborted,
  isReasonType,
} from '../../src/guards/is-aborted';

describe('isAborted', () => {
  it('returns true for AbortError DOMException', () => {
    const error = new DOMException('Aborted', 'AbortError');
    expect(isAborted(error)).toBe(true);
  });

  it('returns false for other DOMException types', () => {
    const error = new DOMException('Timeout', 'TimeoutError');
    expect(isAborted(error)).toBe(false);
  });

  it('returns true for Error with name AbortError', () => {
    const error = new Error('Aborted');
    error.name = 'AbortError';
    expect(isAborted(error)).toBe(true);
  });

  it('returns false for regular Error', () => {
    expect(isAborted(new Error('test'))).toBe(false);
  });

  it('returns false for non-error values', () => {
    expect(isAborted(null)).toBe(false);
    expect(isAborted(undefined)).toBe(false);
    expect(isAborted('string')).toBe(false);
    expect(isAborted(123)).toBe(false);
  });
});

describe('isTimeout', () => {
  it('returns true for TimeoutError DOMException', () => {
    const error = new DOMException('Timeout', 'TimeoutError');
    expect(isTimeout(error)).toBe(true);
  });

  it('returns false for AbortError', () => {
    const error = new DOMException('Aborted', 'AbortError');
    expect(isTimeout(error)).toBe(false);
  });

  it('returns false for regular Error', () => {
    expect(isTimeout(new Error('test'))).toBe(false);
  });
});

describe('isAbortRelated', () => {
  it('returns true for AbortError', () => {
    const error = new DOMException('Aborted', 'AbortError');
    expect(isAbortRelated(error)).toBe(true);
  });

  it('returns true for TimeoutError', () => {
    const error = new DOMException('Timeout', 'TimeoutError');
    expect(isAbortRelated(error)).toBe(true);
  });

  it('returns false for other errors', () => {
    expect(isAbortRelated(new Error('test'))).toBe(false);
  });
});

describe('isSignalAborted', () => {
  it('returns true for aborted signal', () => {
    const controller = new AbortController();
    controller.abort();
    expect(isSignalAborted(controller.signal)).toBe(true);
  });

  it('returns false for non-aborted signal', () => {
    const controller = new AbortController();
    expect(isSignalAborted(controller.signal)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isSignalAborted(undefined)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isSignalAborted(null)).toBe(false);
  });
});

describe('isReasonType', () => {
  it('returns true when reason has matching type', () => {
    expect(isReasonType({ type: 'timeout' }, 'timeout')).toBe(true);
    expect(isReasonType({ type: 'user_cancelled' }, 'user_cancelled')).toBe(true);
  });

  it('returns false when reason has different type', () => {
    expect(isReasonType({ type: 'timeout' }, 'error')).toBe(false);
  });

  it('returns false for non-object reasons', () => {
    expect(isReasonType(null, 'timeout')).toBe(false);
    expect(isReasonType(undefined, 'timeout')).toBe(false);
    expect(isReasonType('string', 'timeout')).toBe(false);
    expect(isReasonType(123, 'timeout')).toBe(false);
  });

  it('returns false for objects without type property', () => {
    expect(isReasonType({}, 'timeout')).toBe(false);
    expect(isReasonType({ reason: 'timeout' }, 'timeout')).toBe(false);
  });
});
