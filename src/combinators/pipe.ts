/**
 * Composition utilities for signal transformations
 */

/**
 * Type for signal transformation function
 */
export type SignalOperator = (signal: AbortSignal) => AbortSignal;

/**
 * Compose multiple signal transformations into a pipeline.
 * Like Unix pipes or functional composition.
 *
 * @param signal - The source signal
 * @param operators - Array of transformation functions
 * @returns The transformed signal
 *
 * @example
 * ```typescript
 * import { mapReason, filter, tap, delay } from 'abort-x/combinators';
 *
 * const signal = pipe(
 *   baseSignal,
 *   s => mapReason(s, enrichReason),
 *   s => filter(s, isNotTimeout),
 *   s => tap(s, logAbort),
 *   s => delay(s, 1000)
 * );
 * ```
 */
export function pipe(
  signal: AbortSignal,
  ...operators: SignalOperator[]
): AbortSignal {
  return operators.reduce((s, op) => op(s), signal);
}

/**
 * Create a reusable pipeline of transformations.
 * Returns a function that can be applied to any signal.
 *
 * @param operators - Array of transformation functions
 * @returns A function that transforms signals
 *
 * @example
 * ```typescript
 * const myPipeline = pipeline(
 *   s => mapReason(s, addContext),
 *   s => tap(s, log),
 * );
 *
 * const signal1 = myPipeline(baseSignal1);
 * const signal2 = myPipeline(baseSignal2);
 * ```
 */
export function pipeline(
  ...operators: SignalOperator[]
): SignalOperator {
  return (signal: AbortSignal) => pipe(signal, ...operators);
}

/**
 * Compose two operators into one.
 * Like function composition: compose(f, g)(x) = g(f(x))
 *
 * @param first - First operator to apply
 * @param second - Second operator to apply
 * @returns A combined operator
 */
export function compose(
  first: SignalOperator,
  second: SignalOperator
): SignalOperator {
  return (signal: AbortSignal) => second(first(signal));
}

/**
 * Apply an operator conditionally.
 *
 * @param condition - Whether to apply the operator
 * @param operator - The operator to conditionally apply
 * @returns An operator that may or may not transform the signal
 *
 * @example
 * ```typescript
 * const signal = pipe(
 *   baseSignal,
 *   when(isDevelopment, s => debug(s, 'dev')),
 *   when(hasRetry, s => delay(s, 1000)),
 * );
 * ```
 */
export function when(
  condition: boolean,
  operator: SignalOperator
): SignalOperator {
  return condition ? operator : (s) => s;
}

/**
 * Apply operator based on runtime check.
 *
 * @param predicate - Function that returns whether to apply
 * @param operator - The operator to conditionally apply
 * @returns An operator that may or may not transform the signal
 */
export function whenFn(
  predicate: (signal: AbortSignal) => boolean,
  operator: SignalOperator
): SignalOperator {
  return (signal: AbortSignal) =>
    predicate(signal) ? operator(signal) : signal;
}

/**
 * Identity operator - returns signal unchanged.
 * Useful as a placeholder or default.
 */
export const identity: SignalOperator = (signal) => signal;

/**
 * Create a branching pipeline based on condition.
 *
 * @param predicate - Condition to check
 * @param ifTrue - Operator to apply if true
 * @param ifFalse - Operator to apply if false
 * @returns A branching operator
 *
 * @example
 * ```typescript
 * const signal = pipe(
 *   baseSignal,
 *   branch(
 *     s => s.reason?.type === 'timeout',
 *     s => delay(s, 1000),  // Delay timeouts
 *     s => s                // Pass through others
 *   ),
 * );
 * ```
 */
export function branch(
  predicate: (signal: AbortSignal) => boolean,
  ifTrue: SignalOperator,
  ifFalse: SignalOperator = identity
): SignalOperator {
  return (signal: AbortSignal) =>
    predicate(signal) ? ifTrue(signal) : ifFalse(signal);
}

/**
 * Apply multiple operators and combine results with any().
 *
 * @param operators - Operators to apply in parallel
 * @returns An operator that applies all and combines with any()
 */
export function fork(
  ...operators: SignalOperator[]
): SignalOperator {
  return (signal: AbortSignal) => {
    if (operators.length === 0) return signal;
    if (operators.length === 1) return operators[0]!(signal);

    const signals = operators.map((op) => op(signal));

    // Import would create circular dependency, inline the logic
    const controller = new AbortController();

    for (const s of signals) {
      if (s.aborted) {
        controller.abort(s.reason);
        return controller.signal;
      }

      s.addEventListener('abort', () => {
        controller.abort(s.reason);
      }, { once: true });
    }

    return controller.signal;
  };
}
