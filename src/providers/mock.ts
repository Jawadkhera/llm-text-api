import type { LLMProvider } from './types.js';

// Rough token estimate (~4 characters per token) so the usage field looks realistic.
const estimateTokens = (s: string) => Math.ceil(s.length / 4);

/** Returns a canned reply without calling any API. Used for tests and local runs without a key. */
export function createMockProvider(): LLMProvider {
  return {
    name: 'mock',
    async generate({ text, system }) {
      const preview = text.length > 80 ? `${text.slice(0, 80)}...` : text;
      const output = `[mock] You said: "${preview}"`;
      return {
        output,
        model: 'mock-model',
        usage: {
          inputTokens: estimateTokens(text) + estimateTokens(system ?? ''),
          outputTokens: estimateTokens(output),
        },
      };
    },
  };
}
