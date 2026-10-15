/**
 * tokenizer adapter — token counter for the repo-map budget search (T3) and for
 * the per-skill / skills-block attribution in a review's run trace.
 *
 * The repo-map renderer (pipeline/repo-map.ts) binary-searches the largest set
 * of symbols that fits a token budget; that loop calls `count()` ≤ ~13 times.
 * The reviews module injects `count` into reviewer-core's `assemblePrompt`,
 * which calls it once per assembled skill plus once for the whole block.
 *
 * Default impl: js-tiktoken `cl100k_base` (pure-JS, no natives). The encoder is
 * lazy-initialised (loading the BPE ranks is the heavy part) and any failure
 * falls back to the `ceil(chars / 4)` heuristic — the renderer must never throw.
 *
 * Cost guard: js-tiktoken's BPE merge is quadratic in the length of ONE regex
 * piece (a run of letters, of whitespace, or of punctuation): a single run of
 * 32 000 letters takes over a minute and blocks the event loop. `count()`
 * therefore encodes a run longer than `MAX_RUN_CHARS` in slices. Text without
 * such a run is encoded in one piece, exactly as before.
 *
 * Scope: in-process, under modules/repo-intel and modules/reviews. Swappable in
 * tests via a mock counter (ContainerOverrides.tokenizer).
 */
import { getEncoding, type Tiktoken } from 'js-tiktoken';

export interface Tokenizer {
  count(text: string): number;
}

/** Heuristic fallback used before/instead of a real encoder. */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Longest run of one character class handed to the encoder in one piece. */
export const MAX_RUN_CHARS = 64;

// The three unbounded piece shapes of cl100k_base (digits come in pieces of ≤ 3).
const LONG_RUN = new RegExp(
  `\\p{L}{${MAX_RUN_CHARS + 1},}|\\s{${MAX_RUN_CHARS + 1},}|[^\\s\\p{L}\\p{N}]{${MAX_RUN_CHARS + 1},}`,
  'gu',
);

export class TiktokenTokenizer implements Tokenizer {
  private enc?: Tiktoken;
  private broken = false;

  count(text: string): number {
    if (this.broken) return approxTokens(text);
    try {
      this.enc ??= getEncoding('cl100k_base');
      const enc = this.enc;
      let total = 0;
      let last = 0;
      for (const m of text.matchAll(LONG_RUN)) {
        if (m.index > last) total += enc.encode(text.slice(last, m.index)).length;
        for (let i = 0; i < m[0].length; i += MAX_RUN_CHARS) {
          total += enc.encode(m[0].slice(i, i + MAX_RUN_CHARS)).length;
        }
        last = m.index + m[0].length;
      }
      // No long run: `last` is 0 and the whole text is encoded in one piece.
      return total + (last < text.length ? enc.encode(text.slice(last)).length : 0);
    } catch {
      // BPE load failed once — don't retry per call; stick to the heuristic.
      this.broken = true;
      return approxTokens(text);
    }
  }
}
