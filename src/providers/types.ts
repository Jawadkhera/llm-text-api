import type { ProviderName } from '../config.js';
import { ApiError } from '../middleware/errors.js';

export interface GenerateInput {
  text: string;
  system?: string;
  maxTokens: number;
  /** Aborted when the request times out. Providers should pass it to their SDK. */
  signal: AbortSignal;
}

export interface GenerateResult {
  output: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

/**
 * Every LLM provider implements this interface. Errors thrown by `generate` are mapped
 * to 502 UPSTREAM_ERROR, or 429 RATE_LIMITED if the error has `status: 429`
 * (as the Anthropic and OpenAI SDK errors do). An ApiError is passed through unchanged.
 */
export interface LLMProvider {
  name: ProviderName;
  generate(input: GenerateInput): Promise<GenerateResult>;
}

/** Thrown when the model spent its whole token budget (e.g. on reasoning) without replying. */
export const emptyReplyError = () =>
  new ApiError(
    502,
    'UPSTREAM_ERROR',
    'The model used its token budget before writing a reply. Try a higher maxTokens',
  );
