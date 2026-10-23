export const PROVIDERS = ['anthropic', 'openai', 'mock'] as const;
export type ProviderName = (typeof PROVIDERS)[number];

export interface Config {
  port: number;
  serviceApiKey: string;
  provider: ProviderName;
  /** API key for the selected provider. Undefined for the mock provider. */
  providerApiKey?: string;
}

export class ConfigError extends Error {}

const PROVIDER_KEY_VARS: Record<ProviderName, string | null> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  mock: null,
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

  const keyVar = PROVIDER_KEY_VARS[provider];
  const providerApiKey = keyVar ? required(env, keyVar) : undefined;

  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigError(`Invalid PORT "${env.PORT}". Expected an integer between 1 and 65535`);
  }

  return { port, serviceApiKey, provider, providerApiKey };
}
