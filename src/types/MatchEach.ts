import type * as symbols from '../internals/symbols';
import type { Pattern, MatchedValue } from './Pattern';
import type { InvertPatternForExclude, InvertPattern } from './InvertPattern';
import type { Union, GuardValue, IsNever } from './helpers';
import type { FindSelected } from './FindSelected';
import type { PickReturnValue, DeepExcludeAll, MakeTuples } from './Match';

interface NonExhaustiveError<i> {
  __nonExhaustive: never;
}

interface TSPatternError<i> {
  __nonExhaustive: never;
}

type List<o, inferredOutput> = PickReturnValue<o, inferredOutput>[];

/**
 * Chain shared by the eager `matchEach(value)` builder and the reusable
 * `matchEach<Input>()` builder. `initial` is the original input type: every
 * `.with` is checked against it. `i` starts as that same type. `.narrow()`
 * replaces `i` and clears the handled-case list.
 */
type MatchEachBuilder<
  i,
  o,
  handledCases extends any[],
  inferredOutput,
  reuse extends boolean,
  initial = i
> = {
  /**
   * `.with(pattern, handler)` Registers a pattern and a handler function.
   * The handler is called when the pattern matches, even if an earlier
   * clause already matched. The pattern is checked against the original input type.
   */
  with<
    const p extends Pattern<initial>,
    c,
    value extends MatchedValue<initial, InvertPattern<p, initial>>
  >(
    pattern: IsNever<p> extends true ? Pattern<initial> : p,
    handler: (
      selections: FindSelected<value, p>,
      value: value
    ) => PickReturnValue<o, c>
  ): InvertPatternForExclude<p, value> extends infer excluded
    ? MatchEachBuilder<
        i,
        o,
        [...handledCases, excluded],
        Union<inferredOutput, c>,
        reuse,
        initial
      >
    : never;

  with<
    const p1 extends Pattern<initial>,
    const p2 extends Pattern<initial>,
    c,
    p extends p1 | p2,
    value extends p extends any
      ? MatchedValue<initial, InvertPattern<p, initial>>
      : never
  >(
    p1: p1,
    p2: p2,
    handler: (value: value) => PickReturnValue<o, c>
  ): [
    InvertPatternForExclude<p1, value>,
    InvertPatternForExclude<p2, value>
  ] extends [infer excluded1, infer excluded2]
    ? MatchEachBuilder<
        i,
        o,
        [...handledCases, excluded1, excluded2],
        Union<inferredOutput, c>,
        reuse,
        initial
      >
    : never;

  with<
    const p1 extends Pattern<initial>,
    const p2 extends Pattern<initial>,
    const p3 extends Pattern<initial>,
    const ps extends readonly Pattern<initial>[],
    c,
    p extends p1 | p2 | p3 | ps[number],
    value extends MatchedValue<initial, InvertPattern<p, initial>>
  >(
    ...args: [
      p1: p1,
      p2: p2,
      p3: p3,
      ...patterns: ps,
      handler: (value: value) => PickReturnValue<o, c>
    ]
  ): [
    InvertPatternForExclude<p1, value>,
    InvertPatternForExclude<p2, value>,
    InvertPatternForExclude<p3, value>,
    MakeTuples<ps, value>
  ] extends [
    infer excluded1,
    infer excluded2,
    infer excluded3,
    infer excludedRest
  ]
    ? MatchEachBuilder<
        i,
        o,
        [
          ...handledCases,
          excluded1,
          excluded2,
          excluded3,
          ...Extract<excludedRest, any[]>
        ],
        Union<inferredOutput, c>,
        reuse,
        initial
      >
    : never;

  with<
    const pat extends Pattern<initial>,
    pred extends (
      value: MatchedValue<initial, InvertPattern<pat, initial>>
    ) => unknown,
    c,
    value extends GuardValue<pred>
  >(
    pattern: pat,
    predicate: pred,
    handler: (
      selections: FindSelected<value, pat>,
      value: value
    ) => PickReturnValue<o, c>
  ): pred extends (value: any) => value is infer narrowed
    ? MatchEachBuilder<
        i,
        o,
        [...handledCases, narrowed],
        Union<inferredOutput, c>,
        reuse,
        initial
      >
    : MatchEachBuilder<
        i,
        o,
        handledCases,
        Union<inferredOutput, c>,
        reuse,
        initial
      >;

  /**
   * `.when(predicate, handler)` Registers a predicate and a handler.
   * The handler is called when the predicate returns a truthy value,
   * even if an earlier clause already matched.
   */
  when<pred extends (value: i) => unknown, c, value extends GuardValue<pred>>(
    predicate: pred,
    handler: (value: value) => PickReturnValue<o, c>
  ): pred extends (value: any) => value is infer narrowed
    ? MatchEachBuilder<
        i,
        o,
        [...handledCases, narrowed],
        Union<inferredOutput, c>,
        reuse,
        initial
      >
    : MatchEachBuilder<
        i,
        o,
        handledCases,
        Union<inferredOutput, c>,
        reuse,
        initial
      >;

  /**
   * `.tap(callback)` calls `callback` once for each result collected so far,
   * in clause order. The list is left unchanged and the chain continues.
   * On a reusable matcher the callback runs when the built function is called.
   */
  tap(
    callback: (result: PickReturnValue<o, inferredOutput>) => unknown
  ): MatchEachBuilder<i, o, handledCases, inferredOutput, reuse, initial>;

  /**
   * `.returnType<T>()` Lets you specify the return type for all of your branches.
   */
  returnType: [inferredOutput] extends [never]
    ? <output>() => MatchEachBuilder<
        i,
        output,
        handledCases,
        never,
        reuse,
        initial
      >
    : TSPatternError<'calling `.returnType<T>()` is only allowed directly after `matchEach(...)`.'>;

  /**
   * `.narrow()` records every handled case in the input type and clears the
   * handled-case list. Later `.when`, `.otherwise` and exhaustiveness checks
   * see that updated input type. Later `.with` clauses still see the original.
   */
  narrow(): MatchEachBuilder<
    DeepExcludeAll<i, handledCases>,
    o,
    [],
    inferredOutput,
    reuse,
    initial
  >;
} & (reuse extends true
  ? ReusableTerminals<initial, i, o, handledCases, inferredOutput>
  : EagerTerminals<i, o, handledCases, inferredOutput>);

type EagerTerminals<i, o, handledCases extends any[], inferredOutput> = {
  /**
   * `.otherwise()` takes a default handler. The handler runs only when no
   * clause matched, and the expression returns a one-element list. When any
   * clause matched, the handler is skipped and the collected list is returned.
   * This does not throw.
   */
  otherwise<c>(
    handler: (value: i) => PickReturnValue<o, c>
  ): PickReturnValue<o, Union<inferredOutput, c>>[];

  /**
   * `.exhaustive()` checks that all cases are handled and returns the list of
   * results. If no clause matched, it throws, unless a fallback handler is
   * passed. The fallback's return value is wrapped in a one-element list.
   */
  exhaustive: DeepExcludeAll<i, handledCases> extends infer remainingCases
    ? [remainingCases] extends [never]
      ? ExhaustiveEach<o, inferredOutput>
      : NonExhaustiveError<remainingCases>
    : never;

  /**
   * `.run()` returns the list of results.
   *
   * ⚠️ calling this function is unsafe, and may throw if no pattern matches your input.
   */
  run(): List<o, inferredOutput>;
};

type ReusableTerminals<
  initial,
  i,
  o,
  handledCases extends any[],
  inferredOutput
> = {
  /**
   * `.to()` builds a function. The function returns the list of results and
   * throws if nothing matched.
   */
  to(): (value: initial) => List<o, inferredOutput>;

  /**
   * `.toExhaustive()` builds the same function as `.to()`, and TypeScript
   * reports any input case that is not covered.
   */
  toExhaustive: DeepExcludeAll<i, handledCases> extends infer remainingCases
    ? [remainingCases] extends [never]
      ? () => (value: initial) => List<o, inferredOutput>
      : NonExhaustiveError<remainingCases>
    : never;

  /**
   * `.toPartial()` builds a function that returns the list of results.
   * The list is empty when nothing matched. It does not throw.
   */
  toPartial(): (value: initial) => List<o, inferredOutput>;
};

/**
 * #### MatchEach
 * Builder returned by `matchEach(value)`.
 */
export type MatchEach<
  i,
  o,
  handledCases extends any[] = [],
  inferredOutput = never
> = MatchEachBuilder<i, o, handledCases, inferredOutput, false>;

/**
 * #### ReusableMatchEach
 * Builder returned by `matchEach<Input>()` with no value.
 * `initial` is the argument type of `.to()`, `.toExhaustive()` and `.toPartial()`.
 */
export type ReusableMatchEach<
  initial,
  i = initial,
  o = symbols.unset,
  handledCases extends any[] = [],
  inferredOutput = never
> = MatchEachBuilder<i, o, handledCases, inferredOutput, true, initial>;

/**
 * Overloaded `.exhaustive` for `matchEach`. Both forms return a list.
 */
type ExhaustiveEach<output, inferredOutput> = {
  (): List<output, inferredOutput>;
  <otherOutput>(
    handler: (unexpectedValue: unknown) => PickReturnValue<output, otherOutput>
  ): PickReturnValue<output, Union<inferredOutput, otherOutput>>[];
};
