import type { Config } from '../config.js';
import { createMockProvider } from './mock.js';
import type { LLMProvider } from './types.js';

export function createProvider(config: Config): LLMProvider {
  switch (config.provider) {
    case 'mock':
      return createMockProvider();
    case 'anthropic':
    case 'openai':
      throw new Error(`Provider "${config.provider}" is not implemented yet`);
  }
}
