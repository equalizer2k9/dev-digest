# flaky-tests

ALWAYS flag when a test's result can change between runs with no code change. Do not pass a diff that adds a test depending on wall-clock time, ordering, randomness or shared state.

## Rule

A test must be deterministic: same code, same result, on any machine, in any
order, at any time of day. Each source of nondeterminism below is a finding.

## Sources to look for

- **Wall clock**: `Date.now()`, `new Date()` or a default `now` parameter left
  unpinned while the assertion depends on the elapsed time.
- **Sleeping**: `setTimeout` / `sleep(…)` used to "wait for" async work instead
  of awaiting it; tight `toBeLessThan(ms)` timing assertions.
- **Randomness**: `Math.random()`, `crypto.randomUUID()` in asserted output.
- **Ordering**: asserting the order of `Object.keys`, `Promise.all` side
  effects, or SQL rows with no `ORDER BY`.
- **Shared state**: module-level variables, a DB row or temp file reused
  across tests with no reset in `beforeEach`; tests that pass only in sequence.
- **Environment**: real network, locale, timezone, `process.env` not set by
  the test itself.
- **Unawaited promises**: an `expect` inside a promise the test never awaits.

## How to check

For each added test, ask: what would have to differ between two runs for this
to fail? If the answer is anything but the code, report it and name the source.

## Severity

WARNING by default — a flake erodes trust but does not ship a bug. CRITICAL
only when the nondeterminism hides a real failure (an unawaited assertion that
can never fail).

## Good / Bad

```ts
// Bad — passes or fails depending on when the suite runs
expect(parseRetryAfter('Wed, 21 Oct 2026 07:28:00 GMT')).toBe(60);

// Good — the clock is an explicit input
const now = Date.parse('2026-10-21T07:27:00Z');
expect(parseRetryAfter('Wed, 21 Oct 2026 07:28:00 GMT', now)).toBe(60);
```

## Report

Cite the test line. Name the nondeterminism source and the pinning fix
(`vi.useFakeTimers()`, injected `now`, explicit `ORDER BY`, `beforeEach` reset).
