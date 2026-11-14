import { Expect, Equal } from '../src/types/helpers';
import { matchEach, NonExhaustiveError, P } from '../src';

describe('matchEach', () => {
  it('runs every matching clause and keeps clause order', () => {
    const calls: string[] = [];

    const result = matchEach('ab')
      .with(P.string, (s) => {
        calls.push('string');
        return s.length;
      })
      .with(P.string.startsWith('a'), (s) => {
        calls.push('starts-with-a');
        return s;
      })
      .with(P.string.startsWith('z'), () => {
        calls.push('starts-with-z');
        return 'z';
      })
      .exhaustive();

    expect(calls).toEqual(['string', 'starts-with-a']);
    expect(result).toEqual([2, 'ab']);

    type t = Expect<Equal<typeof result, (number | string)[]>>;
  });

  it('skips clauses that do not match', () => {
    expect(
      matchEach('zb')
        .with(P.string, (s) => s.length)
        .with(P.string.startsWith('a'), (s) => s)
        .exhaustive()
    ).toEqual([2]);
  });

  it('treats several patterns in one .with as a single clause', () => {
    expect(
      matchEach(2 as number)
        .with(1, 2, 3, () => 'small')
        .with(P.number.gt(0), () => 'positive')
        .with(P.number.lt(0), () => 'negative')
        .run()
    ).toEqual(['small', 'positive']);

    expect(
      matchEach('span' as string)
        .with('text', 'span', 'p', () => 'text')
        .with('btn', 'button', () => 'button')
        .otherwise(() => 'other')
    ).toEqual(['text']);
  });

  it('supports a guard between the pattern and the handler', () => {
    const matchNumber = (input: number) =>
      matchEach(input)
        .with(
          P.number,
          (n) => n > 10,
          (n) => {
            type t = Expect<Equal<typeof n, number>>;
            return 'big';
          }
        )
        .with(
          P.number,
          (n) => n > 0,
          () => 'positive'
        )
        .with(P.number, () => 'number')
        .exhaustive();

    expect(matchNumber(20)).toEqual(['big', 'positive', 'number']);
    expect(matchNumber(3)).toEqual(['positive', 'number']);
    expect(matchNumber(-1)).toEqual(['number']);
  });

  it('supports .when, including type predicates', () => {
    const input = 1 as 1 | 'a';

    const result = matchEach(input)
      .when(
        (x): x is 1 => x === 1,
        (x) => {
          type t = Expect<Equal<typeof x, 1>>;
          return 'one';
        }
      )
      .with(1, () => 'also-one')
      .with('a', () => 'letter')
      .exhaustive();

    expect(result).toEqual(['one', 'also-one']);
    expect(
      matchEach('a' as 1 | 'a')
        .when(
          (x): x is 1 => x === 1,
          () => 'one'
        )
        .with(1, () => 'also-one')
        .with('a', () => 'letter')
        .exhaustive()
    ).toEqual(['letter']);

    expect(
      matchEach(20)
        .when(
          (x) => x > 10,
          () => 'gt10'
        )
        .when(
          (x) => x > 0,
          () => 'gt0'
        )
        .otherwise(() => 'other')
    ).toEqual(['gt10', 'gt0']);
  });

  it('passes selections for each matching clause', () => {
    expect(
      matchEach({ a: 1, b: 'x' })
        .with({ a: P.select() }, (a) => a)
        .with({ b: P.select() }, (b) => b)
        .run()
    ).toEqual([1, 'x']);

    expect(
      matchEach({ a: 1, b: 2 } as { a: number; b: number })
        .with({ a: 0, b: P.select() }, (b) => b)
        .with({ b: P.select() }, (b) => b)
        .run()
    ).toEqual([2]);

    expect(
      matchEach({ a: 1 } as { a: number })
        .with(
          { a: P.select() },
          (value) => value.a === 1,
          (a) => a
        )
        .run()
    ).toEqual([1]);
  });

  it('does not keep selections from a pattern that failed', () => {
    expect(
      matchEach({ a: 1, b: 2 } as { a: number; b: number })
        .with(
          { a: P.select('a'), b: 0 },
          { b: P.select('b') },
          (selected) => selected
        )
        .run()
    ).toEqual([{ b: 2 }]);

    expect(
      matchEach({ a: 1, b: 2 } as { a: number; b: number })
        .with({ a: P.select('a'), b: 0 }, (selected) => selected)
        .with({ b: P.select('b') }, (selected) => selected)
        .run()
    ).toEqual([{ b: 2 }]);
  });

  describe('otherwise', () => {
    it('uses the default only when nothing matched and does not throw', () => {
      const calls: string[] = [];

      expect(
        matchEach('b' as 'a' | 'b')
          .with('a', () => {
            calls.push('with');
            return 'hit';
          })
          .otherwise(() => {
            calls.push('otherwise');
            return 'default';
          })
      ).toEqual(['default']);
      expect(calls).toEqual(['otherwise']);

      expect(matchEach(undefined).otherwise(() => 'default')).toEqual([
        'default',
      ]);
    });

    it('skips the default when a clause matched', () => {
      const calls: string[] = [];

      expect(
        matchEach('a')
          .with('a', () => {
            calls.push('with');
            return 'hit';
          })
          .otherwise(() => {
            calls.push('otherwise');
            return 'default';
          })
      ).toEqual(['hit']);
      expect(calls).toEqual(['with']);
    });
  });

  describe('exhaustive and run', () => {
    it('returns the list when a clause matched', () => {
      const input = 'a' as 'a' | 'b';
      const result = matchEach(input)
        .with('a', () => 'a' as const)
        .with('b', () => 'b' as const)
        .exhaustive();

      type t = Expect<Equal<typeof result, ('a' | 'b')[]>>;
      expect(result).toEqual(['a']);
      expect(
        matchEach(input)
          .with('a', () => 'a' as const)
          .with('b', () => 'b' as const)
          .run()
      ).toEqual(['a']);
    });

    it('throws when nothing matched', () => {
      expect(() =>
        matchEach('a' as 'a' | 'b')
          .with('b', () => 1)
          .run()
      ).toThrow(NonExhaustiveError);
      expect(() =>
        matchEach('c' as 'a' | 'b')
          .with('a', () => 1)
          .with('b', () => 1)
          .exhaustive()
      ).toThrow(NonExhaustiveError);
      expect(() => matchEach(1).run()).toThrow(NonExhaustiveError);
    });

    it('wraps the exhaustive fallback in a one-element list', () => {
      const input = 'c' as 'a' | 'b';
      let called = false;

      const missed = matchEach(input)
        .with('a', (x) => x)
        .with('b', (x) => x)
        .exhaustive((value) => {
          called = true;
          return { unexpectedValue: value };
        });

      type t = Expect<
        Equal<typeof missed, ('a' | 'b' | { unexpectedValue: unknown })[]>
      >;
      expect(missed).toEqual([{ unexpectedValue: 'c' }]);
      expect(called).toBe(true);

      called = false;
      const hit = matchEach('a' as 'a' | 'b')
        .with('a', (x) => x)
        .with('b', (x) => x)
        .exhaustive(() => {
          called = true;
          return { unexpectedValue: 'nope' as const };
        });

      expect(hit).toEqual(['a']);
      expect(called).toBe(false);
    });
  });

  describe('returnType', () => {
    it('is only allowed directly after matchEach(...)', () => {
      matchEach(0 as unknown)
        .returnType<string>()
        .with(undefined, () => 'undefined')
        .otherwise(() => 'unknown');

      matchEach(0 as unknown)
        .with(undefined, () => 'undefined')
        // @ts-expect-error: not allowed
        .returnType<string>()
        .otherwise(() => 'unknown');
    });

    it('restricts every branch and types the list elements', () => {
      matchEach('a' as string | undefined)
        .returnType<string>()
        // @ts-expect-error
        .with(undefined, () => undefined)
        .with(P.string, () => 'string')
        // @ts-expect-error
        .otherwise(() => true);

      const result = matchEach('a' as string | undefined)
        .returnType<string>()
        .with(undefined, () => 'missing')
        .with(P.string, () => 'string')
        .otherwise(() => 'unknown');

      type t = Expect<Equal<typeof result, string[]>>;
      expect(result).toEqual(['string']);
    });
  });

  describe('narrow', () => {
    it('excludes handled cases from later clauses and keeps earlier results', () => {
      const fn = (input: { prop?: 1 | 2 | 3 }) =>
        matchEach(input)
          .with({ prop: P.nullish.optional() }, () => 'missing' as const)
          .with({ prop: 2 }, () => 'two' as const)
          .narrow()
          .otherwise(({ prop }) => {
            type test = Expect<Equal<typeof prop, 1 | 3>>;
            return 'other' as const;
          });

      expect(fn({})).toEqual(['missing']);
      expect(fn({ prop: 2 })).toEqual(['two']);
      expect(fn({ prop: 1 })).toEqual(['other']);
    });
  });

  it('keeps the original input type so a later clause can match again', () => {
    const input = 'a' as 'a' | 'b';

    const result = matchEach(input)
      .with('a', (x) => {
        type t = Expect<Equal<typeof x, 'a'>>;
        return 'first';
      })
      .with('a', (x) => {
        type t = Expect<Equal<typeof x, 'a'>>;
        return 'second';
      })
      .with('b', () => 'b')
      .exhaustive();

    type t = Expect<Equal<typeof result, string[]>>;
    expect(result).toEqual(['first', 'second']);
  });

  it('still requires every case before .exhaustive()', () => {
    const input = 'a' as 'a' | 'b';

    matchEach(input)
      .with('a', () => 'a')
      // @ts-expect-error
      .exhaustive();

    const result = matchEach(input)
      .with('a', () => 'a')
      .with('b', () => 'b')
      .exhaustive();

    expect(result).toEqual(['a']);
  });

  it('does not share new results with an earlier builder', () => {
    let runs = 0;
    const base = matchEach(1 as number).with(P.number, () => {
      runs += 1;
      return 'n';
    });

    expect(base.with(1, () => 'one').run()).toEqual(['n', 'one']);
    expect(base.run()).toEqual(['n']);
    expect(runs).toBe(1);
  });

  describe('tap', () => {
    const user = { role: 'admin' as const, active: true, name: 'Ada' };

    const collect = () =>
      matchEach(user)
        .with({ role: 'admin' }, () => 'admin' as const)
        .with({ active: true }, () => 'active' as const)
        .with({ name: P.string }, (person) => person.name);

    it('is called once per result so far, in order, and leaves the list unchanged', () => {
      const seen: string[] = [];

      const result = collect()
        .tap((result) => {
          type t = Expect<Equal<typeof result, string>>;
          seen.push(result);
          return 'ignored';
        })
        .otherwise(() => 'guest' as const);

      expect(seen).toEqual(['admin', 'active', 'Ada']);
      expect(result).toEqual(['admin', 'active', 'Ada']);
    });

    it('can be stacked, and later clauses are visible only to later taps', () => {
      const seen: string[] = [];

      const result = matchEach(user)
        .with({ role: 'admin' }, () => 'admin')
        .with({ active: true }, () => 'active')
        .tap((result) => seen.push(`first:${result}`))
        .tap((result) => seen.push(`second:${result}`))
        .with({ name: P.string }, (person) => person.name)
        .tap((result) => seen.push(`third:${result}`))
        .otherwise(() => 'guest');

      expect(seen).toEqual([
        'first:admin',
        'first:active',
        'second:admin',
        'second:active',
        'third:admin',
        'third:active',
        'third:Ada',
      ]);
      expect(result).toEqual(['admin', 'active', 'Ada']);
    });

    it('is not called for clauses that missed', () => {
      const seen: string[] = [];

      expect(
        matchEach('a' as 'a' | 'b')
          .with('b', () => 'b')
          .with('a', () => 'a')
          .tap((result) => seen.push(result))
          .otherwise(() => 'no')
      ).toEqual(['a']);
      expect(seen).toEqual(['a']);
    });

    it('sees the returnType element type', () => {
      matchEach(0)
        .returnType<string>()
        .with(P.number, () => 'n')
        .tap((result) => {
          type t = Expect<Equal<typeof result, string>>;
        })
        .otherwise(() => 'x');
    });
  });

  it('treats a passed undefined as a value', () => {
    expect(
      matchEach(undefined)
        .with(undefined, () => 'u')
        .run()
    ).toEqual(['u']);
  });
});

describe('reusable matchEach', () => {
  type Letter = 'a' | 'b';

  it('builds one matcher and runs it on many values', () => {
    let runs = 0;
    const matchLetter = matchEach<Letter>()
      .with('a', () => {
        runs += 1;
        return 'A' as const;
      })
      .with('b', () => 'B' as const)
      .with(P.union('a', 'b'), () => 'letter' as const)
      .toExhaustive();

    type test = Expect<
      Equal<typeof matchLetter, (value: Letter) => ('A' | 'B' | 'letter')[]>
    >;

    expect(matchLetter('a')).toEqual(['A', 'letter']);
    expect(matchLetter('b')).toEqual(['B', 'letter']);
    expect(runs).toBe(1);
  });

  it('to throws when nothing matched', () => {
    const matchLetter = matchEach<Letter>()
      .with('a', () => 'A')
      .to();

    expect(matchLetter('a')).toEqual(['A']);
    expect(() => matchLetter('b')).toThrow(NonExhaustiveError);
  });

  it('toExhaustive requires every case', () => {
    matchEach<Letter>()
      .with('a', () => 'A')
      // @ts-expect-error
      .toExhaustive();

    const matchLetter = matchEach<Letter>()
      .with('a', () => 'A' as const)
      .with('b', () => 'B' as const)
      .toExhaustive();

    expect(matchLetter('b')).toEqual(['B']);
    expect(() => matchLetter('c' as Letter)).toThrow(NonExhaustiveError);
  });

  it('toPartial returns undefined and does not throw', () => {
    const matchLetter = matchEach<Letter>()
      .with('a', () => 'A' as const)
      .toPartial();

    type test = Expect<
      Equal<ReturnType<typeof matchLetter>, 'A'[] | undefined>
    >;

    expect(matchLetter('a')).toEqual(['A']);
    expect(matchLetter('b')).toBeUndefined();
    expect(() => matchLetter('b')).not.toThrow();
  });

  it('runs taps inside the built function, once per call', () => {
    const seen: string[] = [];
    const matchLetter = matchEach<Letter>()
      .with('a', () => 'A')
      .with('b', () => 'B')
      .tap((result) => seen.push(`1:${result}`))
      .tap((result) => seen.push(`2:${result}`))
      .with(P._, () => 'all')
      .tap((result) => seen.push(`3:${result}`))
      .toExhaustive();

    expect(seen).toEqual([]);
    expect(matchLetter('a')).toEqual(['A', 'all']);
    expect(seen).toEqual(['1:A', '2:A', '3:A', '3:all']);

    seen.length = 0;
    expect(matchLetter('b')).toEqual(['B', 'all']);
    expect(seen).toEqual(['1:B', '2:B', '3:B', '3:all']);
  });

  it('keeps an earlier builder unchanged', () => {
    const base = matchEach<Letter>().with('a', () => 'A' as const);
    const partial = base.toPartial();
    const full = base.with('b', () => 'B' as const).toExhaustive();

    expect(partial('a')).toEqual(['A']);
    expect(partial('b')).toBeUndefined();
    expect(full('a')).toEqual(['A']);
    expect(full('b')).toEqual(['B']);
  });

  it('supports guards, when, returnType and narrow', () => {
    const matchNumber = matchEach<number>()
      .returnType<string>()
      .with(
        P.number,
        (n) => n > 0,
        () => 'positive'
      )
      .when(
        (n) => n > 10,
        () => 'gt10'
      )
      .with(P.number, () => 'number')
      .to();

    type test = Expect<Equal<ReturnType<typeof matchNumber>, string[]>>;
    expect(matchNumber(20)).toEqual(['positive', 'gt10', 'number']);
    expect(matchNumber(-1)).toEqual(['number']);

    type Input = { prop?: 1 | 2 | 3 };
    const matchProp = matchEach<Input>()
      .with({ prop: P.nullish.optional() }, () => 'missing' as const)
      .with({ prop: 2 }, () => 'two' as const)
      .narrow()
      .with({ prop: 1 }, (value) => {
        type narrowed = Expect<Equal<typeof value.prop, 1>>;
        return 'one' as const;
      })
      .with({ prop: 3 }, () => 'three' as const)
      .toExhaustive();

    type param = Expect<Equal<Parameters<typeof matchProp>[0], Input>>;
    expect(matchProp({})).toEqual(['missing']);
    expect(matchProp({ prop: 2 })).toEqual(['two']);
    expect(matchProp({ prop: 1 })).toEqual(['one']);
    expect(matchProp({ prop: 3 })).toEqual(['three']);
  });

  it('gives each call and each clause its own selections', () => {
    const seen: unknown[] = [];
    const matchPoint = matchEach<{ a: number; b: number }>()
      .with({ a: P.select('a'), b: 0 }, (selected) => selected)
      .with({ a: P.select('a') }, (selected) => {
        seen.push(selected);
        return selected;
      })
      .with({ b: P.select('b') }, (selected) => {
        seen.push(selected);
        return selected;
      })
      .to();

    expect(matchPoint({ a: 1, b: 2 })).toEqual([{ a: 1 }, { b: 2 }]);
    expect(matchPoint({ a: 3, b: 4 })).toEqual([{ a: 3 }, { b: 4 }]);
    expect(seen).toEqual([{ a: 1 }, { b: 2 }, { a: 3 }, { b: 4 }]);

    const matchEither = matchEach<{ a: number; b: number }>()
      .with(
        { a: P.select('a'), b: 0 },
        { b: P.select('b') },
        (selected) => selected
      )
      .to();

    expect(matchEither({ a: 1, b: 2 })).toEqual([{ b: 2 }]);
  });
});
