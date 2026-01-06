import { describe, it, expect, vi } from 'vitest';
import { AbortScope, withScope, runScoped } from '../../src/patterns/scope';

describe('AbortScope', () => {
  it('creates scope with signal', () => {
    const scope = new AbortScope();
    expect(scope.signal).toBeInstanceOf(AbortSignal);
    expect(scope.aborted).toBe(false);
  });

  it('aborts with reason', () => {
    const scope = new AbortScope();
    scope.abort('test-reason');

    expect(scope.aborted).toBe(true);
    expect(scope.reason).toBe('test-reason');
  });

  it('creates child scope', () => {
    const parent = new AbortScope();
    const child = parent.child();

    expect(child.aborted).toBe(false);
  });

  it('child aborts when parent aborts', () => {
    const parent = new AbortScope();
    const child = parent.child();

    parent.abort('parent-reason');

    expect(child.aborted).toBe(true);
    expect(child.reason).toBe('parent-reason');
  });

  it('parent does not abort when child aborts', () => {
    const parent = new AbortScope();
    const child = parent.child();

    child.abort('child-reason');

    expect(parent.aborted).toBe(false);
    expect(child.aborted).toBe(true);
  });

  it('run executes function with child scope', async () => {
    const scope = new AbortScope();
    const fn = vi.fn(async (signal: AbortSignal) => {
      expect(signal.aborted).toBe(false);
      return 'result';
    });

    const result = await scope.run(fn);

    expect(result).toBe('result');
    expect(fn).toHaveBeenCalled();
  });

  it('run auto-aborts on error', async () => {
    const scope = new AbortScope();
    const error = new Error('test error');

    await expect(
      scope.run(async () => {
        throw error;
      })
    ).rejects.toThrow(error);
  });

  it('all executes multiple functions in parallel', async () => {
    const scope = new AbortScope();
    const results = await scope.all([
      async () => 1,
      async () => 2,
      async () => 3,
    ]);

    expect(results).toEqual([1, 2, 3]);
  });

  it('sequence executes functions in order', async () => {
    const scope = new AbortScope();
    const order: number[] = [];

    await scope.sequence([
      async () => { order.push(1); return 1; },
      async () => { order.push(2); return 2; },
      async () => { order.push(3); return 3; },
    ]);

    expect(order).toEqual([1, 2, 3]);
  });

  it('sequence stops on abort', async () => {
    const scope = new AbortScope();
    const order: number[] = [];

    scope.abort('early');

    await expect(
      scope.sequence([
        async () => { order.push(1); return 1; },
      ])
    ).rejects.toThrow();
  });

  it('onDispose registers cleanup function', () => {
    const scope = new AbortScope();
    const cleanup = vi.fn();

    scope.onDispose(cleanup);
    scope.dispose();

    expect(cleanup).toHaveBeenCalled();
  });

  it('onDispose returns unregister function', () => {
    const scope = new AbortScope();
    const cleanup = vi.fn();

    const unregister = scope.onDispose(cleanup);
    unregister();
    scope.dispose();

    expect(cleanup).not.toHaveBeenCalled();
  });

  it('dispose aborts scope', () => {
    const scope = new AbortScope();
    scope.dispose();

    expect(scope.aborted).toBe(true);
  });

  it('cannot create child of disposed scope', () => {
    const scope = new AbortScope();
    scope.dispose();

    expect(() => scope.child()).toThrow();
  });

  it('from creates scope linked to signal', () => {
    const controller = new AbortController();
    const scope = AbortScope.from(controller.signal);

    controller.abort('external');

    expect(scope.aborted).toBe(true);
  });

  it('respects parent signal in constructor', () => {
    const controller = new AbortController();
    const scope = new AbortScope(controller.signal);

    controller.abort('parent');

    expect(scope.aborted).toBe(true);
  });

  it('handles already aborted parent signal', () => {
    const controller = new AbortController();
    controller.abort('already');

    const scope = new AbortScope(controller.signal);

    expect(scope.aborted).toBe(true);
  });
});

describe('withScope', () => {
  it('provides scope and auto-disposes', async () => {
    let capturedScope: AbortScope | undefined;

    await withScope(async (scope) => {
      capturedScope = scope;
      expect(scope.aborted).toBe(false);
      return 'done';
    });

    expect(capturedScope?.aborted).toBe(true);
  });

  it('respects parent signal', async () => {
    const controller = new AbortController();
    controller.abort('parent');

    const scope = await withScope(async (scope) => {
      return scope;
    }, controller.signal);

    expect(scope.aborted).toBe(true);
  });
});

describe('runScoped', () => {
  it('provides signal and auto-disposes', async () => {
    let capturedSignal: AbortSignal | undefined;

    await runScoped(async (signal) => {
      capturedSignal = signal;
      expect(signal.aborted).toBe(false);
      return 'done';
    });

    expect(capturedSignal?.aborted).toBe(true);
  });
});
