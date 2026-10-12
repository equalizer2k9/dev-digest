import { getEncoding } from 'js-tiktoken';
import { describe, expect, it } from 'vitest';
import { MAX_RUN_CHARS, TiktokenTokenizer } from './index.js';

const enc = getEncoding('cl100k_base');
const exact = (text: string) => enc.encode(text).length;

describe('TiktokenTokenizer.count — cost guard for long runs', () => {
  const tok = new TiktokenTokenizer();

  it('text without a long run is counted exactly as the encoder counts it', () => {
    const texts = [
      '',
      'Fix the retry back-off in `server/src/retry.ts` (see #12).\n\n- one\n- two',
      'src/modules/brief/helpers.ts | +12 -3 | core | 10-14,40\n'.repeat(300),
      'x'.repeat(MAX_RUN_CHARS) + ' ' + '!'.repeat(MAX_RUN_CHARS) + '\n'.repeat(MAX_RUN_CHARS),
    ];
    for (const t of texts) expect(tok.count(t)).toBe(exact(t));
  });

  // Unguarded, each of these is one BPE piece and takes minutes; the test timeout is the assertion.
  it.each([
    ['letters', 'a'],
    ['whitespace', ' '],
    ['punctuation', '!'],
  ])('a 65 000-character run of %s is counted in slices', (_name, ch) => {
    const run = ch.repeat(65_000);
    const slices = Math.ceil(run.length / MAX_RUN_CHARS);
    const n = tok.count(run);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(slices * exact(ch.repeat(MAX_RUN_CHARS)));
  });

  it('text around a long run is still counted, and the run adds its sliced count', () => {
    const head = 'PR description: ';
    const tail = '\nend of text.';
    const run = 'a'.repeat(MAX_RUN_CHARS * 3 + 7);
    const sliced =
      3 * exact('a'.repeat(MAX_RUN_CHARS)) + exact('a'.repeat(7));
    expect(tok.count(head + run + tail)).toBe(exact(head) + sliced + exact(tail));
  });
});
