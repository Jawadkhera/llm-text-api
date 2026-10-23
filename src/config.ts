export const PROVIDERS = ['anthropic', 'openai', 'mock'] as const;
export type ProviderName = (typeof PROVIDERS)[number];

export interface Config {
  port: number;
  serviceApiKey: string;
  provider: ProviderName;
  /** API key for the selected provider. Undefined for the mock provider. */
  providerApiKey?: string;
  /** Model ID sent to the provider (LLM_MODEL, or the provider's default). */
  model: string;
  /** How long to wait for the provider before returning 504. */
  upstreamTimeoutMs: number;
}

export class ConfigError extends Error {}

const PROVIDER_SETTINGS: Record<ProviderName, { keyVar: string | null; defaultModel: string }> = {
  anthropic: { keyVar: 'ANTHROPIC_API_KEY', defaultModel: 'claude-opus-5-5' },
  openai: { keyVar: 'OPENAI_API_KEY', defaultModel: 'gpt-6-astra' },
  mock: { keyVar: null, defaultModel: 'mock-model' },
};

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new ConfigError(`Missing required environment variable ${name}`);
  }
  return value;
}

function isProvider(value: string): value is ProviderName {
  return (PROVIDERS as readonly string[]).includes(value);
}

/** Reads and validates configuration from the environment. Throws ConfigError on problems. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const serviceApiKey = required(env, 'SERVICE_API_KEY');

  const provider = required(env, 'LLM_PROVIDER').toLowerCase();
  if (!isProvider(provider)) {
    throw new ConfigError(
      `Invalid LLM_PROVIDER "${provider}". Expected one of: ${PROVIDERS.join(', ')}`,
    );
  }

  const { keyVar, defaultModel } = PROVIDER_SETTINGS[provider];
  const providerApiKey = keyVar ? required(env, keyVar) : undefined;
  const model = env.LLM_MODEL?.trim() || defaultModel;

  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigError(`Invalid PORT "${env.PORT}". Expected an integer between 1 and 65535`);
  }

  return { port, serviceApiKey, provider, providerApiKey, model, upstreamTimeoutMs: 30_000 };
}
