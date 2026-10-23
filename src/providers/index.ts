import type { Config } from '../config.js';
import { createAnthropicProvider } from './anthropic.js';
import { createMockProvider } from './mock.js';
import { createOpenAIProvider } from './openai.js';
import type { LLMProvider } from './types.js';

export function createProvider(config: Config): LLMProvider {
  // loadConfig guarantees providerApiKey is set for every provider except mock.
  switch (config.provider) {
    case 'anthropic':
      return createAnthropicProvider(config.providerApiKey!, config.model);
    case 'openai':
      return createOpenAIProvider(config.providerApiKey!, config.model);
    case 'mock':
      return createMockProvider(config.model);
  }
}
