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

/**
 * #### MatchEach
 * An interface to create a pattern matching expression that runs every
 * matching clause and collects the results in clause order.
 */
export type MatchEach<
  i,
  o,
  handledCases extends any[] = [],
  inferredOutput = never
> = {
  /**
   * `.with(pattern, handler)` Registers a pattern and a handler function.
   * The handler is called when the pattern matches, even if an earlier
   * clause already matched.
   */
  with<
    const p extends Pattern<i>,
    c,
    value extends MatchedValue<i, InvertPattern<p, i>>
  >(
    pattern: IsNever<p> extends true ? Pattern<i> : p,
    handler: (
      selections: FindSelected<value, p>,
      value: value
    ) => PickReturnValue<o, c>
  ): InvertPatternForExclude<p, value> extends infer excluded
    ? MatchEach<i, o, [...handledCases, excluded], Union<inferredOutput, c>>
    : never;

  with<
    const p1 extends Pattern<i>,
    const p2 extends Pattern<i>,
    c,
    p extends p1 | p2,
    value extends p extends any ? MatchedValue<i, InvertPattern<p, i>> : never
  >(
    p1: p1,
    p2: p2,
    handler: (value: value) => PickReturnValue<o, c>
  ): [
    InvertPatternForExclude<p1, value>,
    InvertPatternForExclude<p2, value>
  ] extends [infer excluded1, infer excluded2]
    ? MatchEach<
        i,
        o,
        [...handledCases, excluded1, excluded2],
        Union<inferredOutput, c>
      >
    : never;

  with<
    const p1 extends Pattern<i>,
    const p2 extends Pattern<i>,
    const p3 extends Pattern<i>,
    const ps extends readonly Pattern<i>[],
    c,
    p extends p1 | p2 | p3 | ps[number],
    value extends MatchedValue<i, InvertPattern<p, i>>
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
    ? MatchEach<
        i,
        o,
        [
          ...handledCases,
          excluded1,
          excluded2,
          excluded3,
          ...Extract<excludedRest, any[]>
        ],
        Union<inferredOutput, c>
      >
    : never;

  with<
    const pat extends Pattern<i>,
    pred extends (value: MatchedValue<i, InvertPattern<pat, i>>) => unknown,
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
    ? MatchEach<i, o, [...handledCases, narrowed], Union<inferredOutput, c>>
    : MatchEach<i, o, handledCases, Union<inferredOutput, c>>;

  /**
   * `.when(predicate, handler)` Registers a predicate and a handler.
   * The handler is called when the predicate returns a truthy value,
   * even if an earlier clause already matched.
   */
  when<pred extends (value: i) => unknown, c, value extends GuardValue<pred>>(
    predicate: pred,
    handler: (value: value) => PickReturnValue<o, c>
  ): pred extends (value: any) => value is infer narrowed
    ? MatchEach<i, o, [...handledCases, narrowed], Union<inferredOutput, c>>
    : MatchEach<i, o, handledCases, Union<inferredOutput, c>>;

  /**
   * `.tap(callback)` calls `callback` once for each result collected so far,
   * in clause order. The list is left unchanged and the chain continues.
   */
  tap(
    callback: (result: PickReturnValue<o, inferredOutput>) => unknown
  ): MatchEach<i, o, handledCases, inferredOutput>;

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
  run(): PickReturnValue<o, inferredOutput>[];

  /**
   * `.returnType<T>()` Lets you specify the return type for all of your branches.
   */
  returnType: [inferredOutput] extends [never]
    ? <output>() => MatchEach<i, output, handledCases>
    : TSPatternError<'calling `.returnType<T>()` is only allowed directly after `matchEach(...)`.'>;

  /**
   * `.narrow()` narrows the input type for later clauses to exclude every
   * case handled so far. Results already collected stay on the list.
   */
  narrow(): MatchEach<DeepExcludeAll<i, handledCases>, o, [], inferredOutput>;
};

/**
 * Overloaded `.exhaustive` for `matchEach`. Both forms return a list.
 */
type ExhaustiveEach<output, inferredOutput> = {
  (): PickReturnValue<output, inferredOutput>[];
  <otherOutput>(
    handler: (unexpectedValue: unknown) => PickReturnValue<output, otherOutput>
  ): PickReturnValue<output, Union<inferredOutput, otherOutput>>[];
};
