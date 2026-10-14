import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { Writable } from 'node:stream';
import { LOG_REDACT } from '../src/app.js';

// pino is not a direct dependency; resolve the copy Fastify itself uses.
const fastifyRequire = createRequire(createRequire(import.meta.url).resolve('fastify'));
const pino = fastifyRequire('pino') as (opts: object, stream: Writable) => {
  info: (o: object, m?: string) => void;
};

function logger() {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(chunk.toString());
      cb();
    },
  });
  return { log: pino({ level: 'info', redact: LOG_REDACT }, stream), out: () => chunks.join('') };
}

describe('pino redaction (S-AC-24)', () => {
  it('S-AC-24: authorization and cookie headers print [redacted]', () => {
    const { log, out } = logger();
    log.info({ req: { headers: { authorization: 'Bearer sk-live-123', cookie: 'sid=abc', accept: 'json' } } }, 'req');
    const line = JSON.parse(out().trim().split('\n').pop()!);
    expect(line.req.headers.authorization).toBe('[redacted]');
    expect(line.req.headers.cookie).toBe('[redacted]');
    expect(line.req.headers.accept).toBe('json');
    expect(out()).not.toContain('sk-live-123');
  });

  it('S-AC-24: apiKey / token style fields at the top level print [redacted]', () => {
    const { log, out } = logger();
    log.info({ apiKey: 'K1', api_key: 'K2', token: 'K3', accessToken: 'K4', secret: 'K5', password: 'K6', keep: 'ok' }, 'x');
    const line = JSON.parse(out().trim().split('\n').pop()!);
    for (const k of ['apiKey', 'api_key', 'token', 'accessToken', 'secret', 'password']) {
      expect(line[k]).toBe('[redacted]');
    }
    expect(line.keep).toBe('ok');
    expect(out()).not.toMatch(/K[1-6]/);
  });

  it('S-AC-24: the same keys one level down are redacted', () => {
    const { log, out } = logger();
    log.info({ provider: { apiKey: 'DEEP1', token: 'DEEP2' }, other: { password: 'DEEP3', name: 'n' } }, 'x');
    const line = JSON.parse(out().trim().split('\n').pop()!);
    expect(line.provider.apiKey).toBe('[redacted]');
    expect(line.provider.token).toBe('[redacted]');
    expect(line.other.password).toBe('[redacted]');
    expect(line.other.name).toBe('n');
    expect(out()).not.toContain('DEEP');
  });
});
