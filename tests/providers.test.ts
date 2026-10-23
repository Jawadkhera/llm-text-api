import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/middleware/errors.js';
import { createAnthropicProvider } from '../src/providers/anthropic.js';
import { createOpenAIProvider } from '../src/providers/openai.js';

// The SDKs use the global fetch, so stubbing it exercises the real SDK request and
// response handling without any network calls.
function stubFetch(responseBody: unknown) {
  const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    Response.json(responseBody),
  );
  vi.stubGlobal('fetch', fetchMock);
  return {
    sentBody: () => JSON.parse(String(fetchMock.mock.calls[0][1]?.body)),
    sentHeaders: () => new Headers(fetchMock.mock.calls[0][1]?.headers),
  };
}

const input = { text: 'Hello', system: 'Be brief.', maxTokens: 100, signal: new AbortController().signal };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Anthropic provider', () => {
  const message = (overrides: object) => ({
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    stop_reason: 'end_turn',
    content: [
      { type: 'thinking', thinking: '', signature: 'sig' },
      { type: 'text', text: 'Hi there.' },
    ],
    usage: { input_tokens: 12, output_tokens: 5 },
    ...overrides,
  });

  it('sends the request and returns only the text reply', async () => {
    const fetchStub = stubFetch(message({}));
    const provider = createAnthropicProvider('test-key', 'claude-opus-5-5');

    const result = await provider.generate(input);

    expect(result).toEqual({
      output: 'Hi there.',
      model: 'claude-opus-5-5',
      usage: { inputTokens: 12, outputTokens: 5 },
    });
    expect(fetchStub.sentBody()).toMatchObject({
      model: 'claude-opus-5-5',
      max_tokens: 100,
      system: 'Be brief.',
      messages: [{ role: 'user', content: 'Hello' }],
      output_config: { effort: 'low' },
      fallbacks: 'default',
    });
    expect(fetchStub.sentHeaders().get('authorization')).toBe('Bearer test-key');
    expect(fetchStub.sentHeaders().get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
  });

  it('reports a refusal as an upstream error', async () => {
    stubFetch(message({ stop_reason: 'refusal', content: [] }));
    const provider = createAnthropicProvider('test-key', 'claude-opus-5-5');

    await expect(provider.generate(input)).rejects.toMatchObject({
      status: 502,
      message: 'The model declined to answer this request',
    });
  });

  it('reports a reply with no text as an upstream error', async () => {
    stubFetch(message({ stop_reason: 'max_tokens', content: [{ type: 'thinking', thinking: '', signature: 's' }] }));
    const provider = createAnthropicProvider('test-key', 'claude-opus-5-5');

    await expect(provider.generate(input)).rejects.toBeInstanceOf(ApiError);
  });
});

describe('OpenAI provider', () => {
  const response = (overrides: object) => ({
    id: 'resp_1',
    object: 'response',
    model: 'gpt-6-astra',
    status: 'completed',
    output: [
      { type: 'reasoning', id: 'rs_1', summary: [] },
      {
        type: 'message',
        id: 'msg_1',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text: 'Hi there.', annotations: [] }],
      },
    ],
    usage: { input_tokens: 12, output_tokens: 5, total_tokens: 17 },
    ...overrides,
  });

  it('sends the request and returns the text reply', async () => {
    const fetchStub = stubFetch(response({}));
    const provider = createOpenAIProvider('test-key', 'gpt-6-astra');

    const result = await provider.generate(input);

    expect(result).toEqual({
      output: 'Hi there.',
      model: 'gpt-6-astra',
      usage: { inputTokens: 12, outputTokens: 5 },
    });
    expect(fetchStub.sentBody()).toMatchObject({
      model: 'gpt-6-astra',
      instructions: 'Be brief.',
      input: 'Hello',
      max_output_tokens: 100,
      reasoning: { effort: 'low' },
      store: false,
    });
    expect(fetchStub.sentHeaders().get('authorization')).toBe('Bearer test-key');
  });

  it('reports a reply with no text as an upstream error', async () => {
    stubFetch(
      response({
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
        output: [{ type: 'reasoning', id: 'rs_1', summary: [] }],
      }),
    );
    const provider = createOpenAIProvider('test-key', 'gpt-6-astra');

    await expect(provider.generate(input)).rejects.toBeInstanceOf(ApiError);
  });
});
