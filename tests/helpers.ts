import type { Config } from '../src/config.js';

export const TEST_API_KEY = 'test-service-key';

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    port: 0,
    serviceApiKey: TEST_API_KEY,
    provider: 'mock',
    upstreamTimeoutMs: 30_000,
    ...overrides,
  };
}
