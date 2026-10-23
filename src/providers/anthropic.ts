import Anthropic from '@anthropic-ai/sdk';
import { ApiError } from '../middleware/errors.js';
import { emptyReplyError, type LLMProvider } from './types.js';

export function createAnthropicProvider(apiKey: string, model: string): LLMProvider {
  const client = new Anthropic({ apiKey });

  return {
    name: 'anthropic',
    async generate({ text, system, maxTokens, signal }) {
      const response = await client.beta.messages.create(
        {
          model,
          max_tokens: maxTokens,
          system,
          messages: [{ role: 'user', content: text }],
          // Thinking tokens count toward max_tokens; low effort leaves room for the reply.
          output_config: { effort: 'low' },
          // If the model's safety classifier declines, Anthropic retries on a suitable fallback model.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        },
        { signal },
      );

      if (response.stop_reason === 'refusal') {
        throw new ApiError(502, 'UPSTREAM_ERROR', 'The model declined to answer this request');
      }

      const output = response.content
        .flatMap((block) => (block.type === 'text' ? [block.text] : []))
        .join('');
      if (!output) throw emptyReplyError();

      return {
        output,
        model: response.model, // the model that actually answered (may be a fallback)
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      };
    },
  };
}
