import { Pattern } from './types/Pattern';
import { MatchEach } from './types/MatchEach';
import * as symbols from './internals/symbols';
import { matchPattern } from './internals/helpers';
import { NonExhaustiveError } from './errors';

/**
 * `matchEach` creates a pattern matching expression that runs every matching
 * clause. Results are returned as a list, in the order the clauses were written.
 *
 *  * Use `.with(pattern, handler)` and `.when(predicate, handler)` the same way as `match`.
 *  * Use `.tap(callback)` to observe each result collected so far.
 *  * Use `.exhaustive()`, `.otherwise()` or `.run()` to end the expression and get the list.
 *
 * @example
 *  declare const input: "a" | "b" | "c";
 *
 *  return matchEach(input)
 *    .with("a", () => "A")
 *    .with("a", "b", () => "AB")
 *    .otherwise(() => "none");
 */
export function matchEach<const input, output = symbols.unset>(
  value: input
): MatchEach<input, output> {
  return new MatchEachExpression(value, []) as any;
}

/**
 * Builder for `matchEach`. Each `.with` and `.when` runs, and a match appends
 * one handler result. The public type lives in src/types/MatchEach.ts.
 */
class MatchEachExpression<input, output> {
  constructor(private input: input, private results: readonly output[]) {}

  with(...args: any[]): MatchEachExpression<input, output> {
    const handler: (selection: unknown, value: input) => output =
      args[args.length - 1];

    const patterns: Pattern<input>[] = [args[0]];
    let predicate: ((value: input) => unknown) | undefined = undefined;

    if (args.length === 3 && typeof args[1] === 'function') {
      // case with guard as second argument
      predicate = args[1];
    } else if (args.length > 2) {
      // case with several patterns
      patterns.push(...args.slice(1, args.length - 1));
    }

    let hasSelections = false;
    let selected: Record<string, unknown> = {};
    const select = (key: string, value: unknown) => {
      hasSelections = true;
      selected[key] = value;
    };

    const matched =
      patterns.some((pattern) => matchPattern(pattern, this.input, select)) &&
      (predicate ? Boolean(predicate(this.input)) : true);

    if (!matched) return new MatchEachExpression(this.input, this.results);

    const selections = hasSelections
      ? symbols.anonymousSelectKey in selected
        ? selected[symbols.anonymousSelectKey]
        : selected
      : this.input;

    return new MatchEachExpression(this.input, [
      ...this.results,
      handler(selections, this.input),
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

function defaultCatcher(input: unknown): never {
  throw new NonExhaustiveError(input);
}
