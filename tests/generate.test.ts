import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { LLMProvider } from '../src/providers/types.js';
import { TEST_API_KEY, testConfig } from './helpers.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function post(app: ReturnType<typeof createApp>, body: unknown, apiKey: string | null = TEST_API_KEY) {
  const req = request(app).post('/api/generate');
  if (apiKey !== null) req.set('x-api-key', apiKey);
  return req.send(body as object);
}

function failingProvider(error: unknown): LLMProvider {
  return {
    name: 'mock',
    generate: async () => {
      throw error;
    },
  };
}

function expectError(res: request.Response, status: number, code: string) {
  expect(res.status).toBe(status);
  expect(res.body).toEqual({
    error: { code, message: expect.any(String), requestId: expect.stringMatching(UUID) },
  });
}

describe('POST /api/generate', () => {
  describe('authentication', () => {
    it('rejects a missing API key', async () => {
      const res = await post(createApp(testConfig()), { text: 'hi' }, null);
      expectError(res, 401, 'UNAUTHORIZED');
    });

    it('rejects a wrong API key of the same length', async () => {
      const wrong = 'x'.repeat(TEST_API_KEY.length);
      const res = await post(createApp(testConfig()), { text: 'hi' }, wrong);
      expectError(res, 401, 'UNAUTHORIZED');
    });

    it('rejects a wrong API key of a different length', async () => {
      const res = await post(createApp(testConfig()), { text: 'hi' }, 'short');
      expectError(res, 401, 'UNAUTHORIZED');
    });
  });

  it('returns the model output for a valid request', async () => {
    const res = await post(createApp(testConfig()), {
      text: '  Summarize unit testing.  ',
      system: 'Be brief.',
      maxTokens: 100,
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      output: expect.stringContaining('Summarize unit testing.'),
      provider: 'mock',
      model: 'mock-model',
      usage: { inputTokens: expect.any(Number), outputTokens: expect.any(Number) },
      requestId: expect.stringMatching(UUID),
    });
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
  });

  it('passes trimmed input and the default maxTokens to the provider', async () => {
    let received: unknown;
    const provider: LLMProvider = {
      name: 'mock',
      generate: async ({ signal: _signal, ...input }) => {
        received = input;
        return { output: 'ok', model: 'm', usage: { inputTokens: 1, outputTokens: 1 } };
      },
    };

    await post(createApp(testConfig(), provider), { text: '  hello  ' });
    expect(received).toEqual({ text: 'hello', system: undefined, maxTokens: 512 });
  });

  describe('validation', () => {
    it.each([
      ['missing text', {}, /text/],
      ['empty text', { text: '' }, /text: must not be empty/],
      ['whitespace-only text', { text: '   ' }, /text: must not be empty/],
      ['text too long', { text: 'a'.repeat(4001) }, /text: must be at most 4000/],
      ['text of wrong type', { text: 42 }, /text/],
      ['system too long', { text: 'hi', system: 'a'.repeat(1001) }, /system: must be at most 1000/],
      ['maxTokens not an integer', { text: 'hi', maxTokens: 1.5 }, /maxTokens: must be an integer/],
      ['maxTokens too large', { text: 'hi', maxTokens: 2000 }, /maxTokens: must be at most 1024/],
      ['unknown field', { text: 'hi', temperature: 1 }, /Unknown field\(s\): temperature/],
      ['non-object body', ['hi'], /JSON object/],
    ])('rejects %s', async (_name, body, message) => {
      const res = await post(createApp(testConfig()), body);
      expectError(res, 400, 'VALIDATION_ERROR');
      expect(res.body.error.message).toMatch(message);
    });

    it('rejects malformed JSON', async () => {
      const res = await request(createApp(testConfig()))
        .post('/api/generate')
        .set('x-api-key', TEST_API_KEY)
        .set('Content-Type', 'application/json')
        .send('{"text": "hi",');
      expectError(res, 400, 'INVALID_JSON');
    });

    it('rejects a body over 10kb', async () => {
      const res = await post(createApp(testConfig()), { text: 'a'.repeat(11 * 1024) });
      expectError(res, 413, 'PAYLOAD_TOO_LARGE');
    });
  });

  describe('provider failures', () => {
    it('returns 502 without leaking provider details', async () => {
      const secret = 'sk-secret-key-in-provider-error';
      const app = createApp(testConfig(), failingProvider(new Error(`Upstream exploded: ${secret}`)));

      const res = await post(app, { text: 'hi' });

      expectError(res, 502, 'UPSTREAM_ERROR');
      expect(res.text).not.toContain(secret);
      expect(res.text).not.toContain('exploded');
      expect(res.text).not.toMatch(/at .*\.ts/); // no stack trace
    });

    it('passes through provider rate limiting as 429', async () => {
      const rateLimited = Object.assign(new Error('rate limited'), { status: 429 });
      const res = await post(createApp(testConfig(), failingProvider(rateLimited)), { text: 'hi' });
      expectError(res, 429, 'RATE_LIMITED');
    });

    it('returns 504 when the provider times out', async () => {
      // Never settles and ignores the abort signal, so only our timeout can end it.
      const hanging: LLMProvider = { name: 'mock', generate: () => new Promise(() => {}) };
      const app = createApp(testConfig({ upstreamTimeoutMs: 50 }), hanging);

      const res = await post(app, { text: 'hi' });
      expectError(res, 504, 'UPSTREAM_TIMEOUT');
    });
  });

  it('rate limits after 20 requests per minute', async () => {
    const app = createApp(testConfig());
    for (let i = 0; i < 20; i++) {
      expect((await post(app, { text: 'hi' })).status).toBe(200);
    }
    expectError(await post(app, { text: 'hi' }), 429, 'RATE_LIMITED');
  });
});

describe('unknown routes', () => {
  it('returns 404 in the standard error shape', async () => {
    const res = await request(createApp(testConfig())).get('/nope');
    expectError(res, 404, 'NOT_FOUND');
  });
});
