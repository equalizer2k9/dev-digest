# Retry delay helper

**Status:** approved · **Package:** server

## What the change does

Adds `retryDelayMs(base, attempt)` in `server/src/platform/retry-delay.ts`. It takes a
human-readable base delay (`"2s"`, `"500ms"`) and the attempt number, and returns the pause in
milliseconds: the base doubled on every attempt (exponential back-off). Parsing of the base is
delegated to the `ms` package, which is added as a dependency. The helper is exported through the
`server/src/platform/index.ts` barrel and has a unit test beside it.

## In scope

- the pure function `retryDelayMs` and its unit test;
- the `ms` dependency (and its types) in `server/package.json` and the lock file;
- the `platform` barrel export and one line in `server/README.md`.

## Out of scope

- using the helper in the existing retry loops (`platform/resilience.ts`, the LLM and GitHub
  adapters) — they keep their current delays;
- jitter and a maximum delay cap;
- retry policy: which errors are retried and how many times.

See the linked issue for the acceptance examples.
