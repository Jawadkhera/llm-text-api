import OpenAI from 'openai';
import { emptyReplyError, type LLMProvider } from './types.js';

export function createOpenAIProvider(apiKey: string, model: string): LLMProvider {
  const client = new OpenAI({ apiKey });

  return {
    name: 'openai',
    async generate({ text, system, maxTokens, signal }) {
      const response = await client.responses.create(
        {
          model,
          instructions: system,
          input: text,
          max_output_tokens: maxTokens,
          // Reasoning tokens count toward max_output_tokens; low effort leaves room for the reply.
          reasoning: { effort: 'low' },
          store: false, // don't keep requests on OpenAI's side
        },
        { signal },
      );

      const output = response.output_text;
      if (!output) throw emptyReplyError();

      return {
        output,
        model: response.model,
        usage: {
          inputTokens: response.usage?.input_tokens ?? 0,
          outputTokens: response.usage?.output_tokens ?? 0,
        },
      };
    },
  };
}
