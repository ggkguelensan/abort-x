import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TypedAbortController,
  linkedController,
  typedLinkedController,
} from '../../src/core/controller';

describe('TypedAbortController', () => {
  it('creates a controller with signal', () => {
    const controller = new TypedAbortController<string>();
    expect(controller.signal).toBeInstanceOf(AbortSignal);
    expect(controller.aborted).toBe(false);
  });

  it('aborts with typed reason', () => {
    type Reason = { type: 'timeout'; ms: number } | { type: 'user' };
    const controller = new TypedAbortController<Reason>();

    controller.abort({ type: 'timeout', ms: 5000 });

    expect(controller.aborted).toBe(true);
    expect(controller.reason).toEqual({ type: 'timeout', ms: 5000 });
    expect(controller.signal.reason).toEqual({ type: 'timeout', ms: 5000 });
  });

  it('ignores multiple abort calls', () => {
    const controller = new TypedAbortController<string>();

    controller.abort('first');
    controller.abort('second');

    expect(controller.reason).toBe('first');
  });

  it('calls onAbort callbacks', () => {
    const controller = new TypedAbortController<string>();
    const callback = vi.fn();

    controller.onAbort(callback);
    controller.abort('test');

    expect(callback).toHaveBeenCalledWith('test');
  });

  it('calls onAbort immediately if already aborted', () => {
    const controller = new TypedAbortController<string>();
    const callback = vi.fn();

    controller.abort('test');
    controller.onAbort(callback);

    expect(callback).toHaveBeenCalledWith('test');
  });

  it('returns cleanup function from onAbort', () => {
    const controller = new TypedAbortController<string>();
    const callback = vi.fn();

    const cleanup = controller.onAbort(callback);
    cleanup();
    controller.abort('test');

    expect(callback).not.toHaveBeenCalled();
  });

  describe('from', () => {
    it('creates controller from multiple signals', () => {
      const c1 = new AbortController();
      const c2 = new AbortController();

      const typed = TypedAbortController.from<string>(c1.signal, c2.signal);

      c1.abort('first');
      expect(typed.signal.aborted).toBe(true);
      expect(typed.signal.reason).toBe('first');
    });

    it('handles already aborted signals', () => {
      const c1 = new AbortController();
      c1.abort('pre-aborted');

      const typed = TypedAbortController.from<string>(c1.signal);

      expect(typed.aborted).toBe(true);
    });
  });
});

describe('linkedController', () => {
  it('creates independent controller when no parent', () => {
    const controller = linkedController();
    expect(controller.signal.aborted).toBe(false);
  });

  it('aborts when parent aborts', () => {
    const parent = new AbortController();
    const child = linkedController(parent.signal);

    parent.abort('parent-reason');

    expect(child.signal.aborted).toBe(true);
    expect(child.signal.reason).toBe('parent-reason');
  });

  it('handles already aborted parent', () => {
    const parent = new AbortController();
    parent.abort('already');

    const child = linkedController(parent.signal);

    expect(child.signal.aborted).toBe(true);
  });
});

describe('typedLinkedController', () => {
  it('creates typed linked controller', () => {
    type Reason = { type: 'test' };
    const parent = new TypedAbortController<Reason>();
    const child = typedLinkedController<Reason>(parent.signal);

    parent.abort({ type: 'test' });

    expect(child.aborted).toBe(true);
    expect(child.signal.reason).toEqual({ type: 'test' });
  });
});
