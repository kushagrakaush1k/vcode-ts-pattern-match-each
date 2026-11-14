import { Pattern } from './types/Pattern';
import { MatchEach, ReusableMatchEach } from './types/MatchEach';
import * as symbols from './internals/symbols';
import { matchPattern } from './internals/helpers';
import { NonExhaustiveError } from './errors';

/**
 * `matchEach` creates a pattern matching expression that runs every matching
 * clause. Results are returned as a list, in the order the clauses were written.
 *
 * Pass a value to run the expression immediately. Pass only a type argument
 * to build a reusable function with `.to()`, `.toExhaustive()` or `.toPartial()`.
 *
 *  * Use `.with(pattern, handler)` and `.when(predicate, handler)` the same way as `match`.
 *  * Use `.tap(callback)` to observe each result collected so far.
 *  * Use `.exhaustive()`, `.otherwise()` or `.run()` to end an eager expression.
 *
 * @example
 *  declare const input: "a" | "b" | "c";
 *
 *  return matchEach(input)
 *    .with("a", () => "A")
 *    .with("a", "b", () => "AB")
 *    .otherwise(() => "none");
 *
 * @example
 *  const matchLetter = matchEach<"a" | "b">()
 *    .with("a", () => "A")
 *    .with("b", () => "B")
 *    .toExhaustive();
 *
 *  matchLetter("a"); // ["A"]
 */
export function matchEach<
  const input,
  output = symbols.unset
>(): ReusableMatchEach<input, input, output>;
export function matchEach<const input, output = symbols.unset>(
  value: input
): MatchEach<input, output>;
export function matchEach<const input, output = symbols.unset>(
  ...args: [value: input] | []
): MatchEach<input, output> | ReusableMatchEach<input, input, output> {
  if (args.length === 0) {
    return new ReusableMatchEachExpression<input, output>([]) as any;
  }
  return new MatchEachExpression(args[0], []) as any;
}

type Clause<input, output> =
  | {
      kind: 'with';
      patterns: Pattern<input>[];
      predicate?: (value: input) => unknown;
      handler: (selection: unknown, value: input) => output;
    }
  | {
      kind: 'when';
      predicate: (value: input) => unknown;
      handler: (selection: input, value: input) => output;
    }
  | {
      kind: 'tap';
      callback: (result: output) => unknown;
    };

/**
 * Builder for `matchEach(value)`. Each `.with` and `.when` runs immediately.
 */
class MatchEachExpression<input, output> {
  constructor(private input: input, private results: readonly output[]) {}

  with(...args: any[]): MatchEachExpression<input, output> {
    const parsed = parseWithArgs<input, output>(args);
    const outcome = matchWith(this.input, parsed.patterns, parsed.predicate);
    if (!outcome.matched)
      return new MatchEachExpression(this.input, this.results);

    return new MatchEachExpression(this.input, [
      ...this.results,
      parsed.handler(outcome.selections, this.input),
    ]);
  }

  when(
    predicate: (value: input) => unknown,
    handler: (selection: input, value: input) => output
  ): MatchEachExpression<input, output> {
    if (!Boolean(predicate(this.input))) {
      return new MatchEachExpression(this.input, this.results);
    }

    return new MatchEachExpression(this.input, [
      ...this.results,
      handler(this.input, this.input),
    ]);
  }

  tap(
    callback: (result: output) => unknown
  ): MatchEachExpression<input, output> {
    for (const result of this.results) {
      callback(result);
    }
    return this;
  }

  otherwise(handler: (value: input) => output): output[] {
    if (this.results.length > 0) return this.results.slice();
    return [handler(this.input)];
  }

  exhaustive(
    unexpectedValueHandler: (value: unknown) => output = defaultCatcher
  ): output[] {
    if (this.results.length > 0) return this.results.slice();
    return [unexpectedValueHandler(this.input)];
  }

  run(): output[] {
    return this.exhaustive();
  }

  returnType() {
    return this;
  }

  narrow() {
    return this;
  }
}

/**
 * Builder for `matchEach<Input>()`. Clauses are stored and run on each call
 * of the function returned by `.to()`, `.toExhaustive()` or `.toPartial()`.
 */
class ReusableMatchEachExpression<input, output> {
  constructor(private clauses: readonly Clause<input, output>[]) {}

  with(...args: any[]): ReusableMatchEachExpression<input, output> {
    const parsed = parseWithArgs<input, output>(args);
    return new ReusableMatchEachExpression(
      this.clauses.concat({
        kind: 'with',
        patterns: parsed.patterns,
        predicate: parsed.predicate,
        handler: parsed.handler,
      })
    );
  }

  when(
    predicate: (value: input) => unknown,
    handler: (selection: input, value: input) => output
  ): ReusableMatchEachExpression<input, output> {
    return new ReusableMatchEachExpression(
      this.clauses.concat({ kind: 'when', predicate, handler })
    );
  }

  tap(
    callback: (result: output) => unknown
  ): ReusableMatchEachExpression<input, output> {
    return new ReusableMatchEachExpression(
      this.clauses.concat({ kind: 'tap', callback })
    );
  }

  returnType() {
    return this;
  }

  narrow() {
    return this;
  }

  to(): (value: input) => output[] {
    return this.compile(true);
  }

  toExhaustive(): (value: input) => output[] {
    return this.compile(true);
  }

  toPartial(): (value: input) => output[] | undefined {
    return this.compile(false);
  }

  private compile(throwIfEmpty: true): (value: input) => output[];
  private compile(throwIfEmpty: false): (value: input) => output[] | undefined;
  private compile(
    throwIfEmpty: boolean
  ): (value: input) => output[] | undefined {
    const clauses = this.clauses;
    return (value: input) => {
      const results = evaluate(value, clauses);
      if (results.length > 0) return results;
      if (throwIfEmpty) throw new NonExhaustiveError(value);
      return undefined;
    };
  }
}

function parseWithArgs<input, output>(
  args: any[]
): {
  patterns: Pattern<input>[];
  predicate?: (value: input) => unknown;
  handler: (selection: unknown, value: input) => output;
} {
  const handler: (selection: unknown, value: input) => output =
    args[args.length - 1];
  const patterns: Pattern<input>[] = [args[0]];
  let predicate: ((value: input) => unknown) | undefined = undefined;

  if (args.length === 3 && typeof args[1] === 'function') {
    predicate = args[1];
  } else if (args.length > 2) {
    patterns.push(...args.slice(1, args.length - 1));
  }

  return { patterns, predicate, handler };
}

/**
 * Try each pattern with its own selection record. A pattern that fails,
 * even after `P.select` recorded a value, leaves nothing for the next
 * pattern or the next clause.
 */
function matchWith<input>(
  input: input,
  patterns: readonly Pattern<input>[],
  predicate?: (value: input) => unknown
): { matched: true; selections: unknown } | { matched: false } {
  for (const pattern of patterns) {
    const attempt = matchPatternFresh(pattern, input);
    if (!attempt.matched) continue;
    if (predicate && !Boolean(predicate(input))) return { matched: false };
    return {
      matched: true,
      selections: resolveSelections(
        attempt.hasSelections,
        attempt.selected,
        input
      ),
    };
  }
  return { matched: false };
}

function matchPatternFresh(
  pattern: unknown,
  value: unknown
):
  | {
      matched: true;
      hasSelections: boolean;
      selected: Record<string, unknown>;
    }
  | { matched: false } {
  let hasSelections = false;
  const selected: Record<string, unknown> = {};
  const select = (key: string, selectedValue: unknown) => {
    hasSelections = true;
    selected[key] = selectedValue;
  };

  if (!matchPattern(pattern, value, select)) return { matched: false };
  return { matched: true, hasSelections, selected };
}

function resolveSelections(
  hasSelections: boolean,
  selected: Record<string, unknown>,
  input: unknown
): unknown {
  if (!hasSelections) return input;
  if (symbols.anonymousSelectKey in selected) {
    return selected[symbols.anonymousSelectKey];
  }
  return selected;
}

function evaluate<input, output>(
  input: input,
  clauses: readonly Clause<input, output>[]
): output[] {
  const results: output[] = [];

  for (const clause of clauses) {
    if (clause.kind === 'tap') {
      for (const result of results) clause.callback(result);
      continue;
    }

    if (clause.kind === 'when') {
      if (Boolean(clause.predicate(input))) {
        results.push(clause.handler(input, input));
      }
      continue;
    }

    const outcome = matchWith(input, clause.patterns, clause.predicate);
    if (outcome.matched) {
      results.push(clause.handler(outcome.selections, input));
    }
  }

  return results;
}

function defaultCatcher(input: unknown): never {
  throw new NonExhaustiveError(input);
}
