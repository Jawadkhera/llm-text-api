import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  const base = { SERVICE_API_KEY: 'secret', LLM_PROVIDER: 'mock' };

  it('loads a valid mock config without a provider key', () => {
    expect(loadConfig(base)).toEqual({
      port: 3000,
      serviceApiKey: 'secret',
      provider: 'mock',
      providerApiKey: undefined,
    });
  });

  it('requires SERVICE_API_KEY', () => {
    expect(() => loadConfig({ LLM_PROVIDER: 'mock' })).toThrow(/SERVICE_API_KEY/);
  });

  it('requires the selected provider key', () => {
    expect(() => loadConfig({ ...base, LLM_PROVIDER: 'anthropic' })).toThrow(/ANTHROPIC_API_KEY/);
    expect(() => loadConfig({ ...base, LLM_PROVIDER: 'openai' })).toThrow(/OPENAI_API_KEY/);
  });

  it('rejects an unknown provider', () => {
    expect(() => loadConfig({ ...base, LLM_PROVIDER: 'gemini' })).toThrow(ConfigError);
  });
});
