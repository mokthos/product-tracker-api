import { AppConfig } from '../types';

export interface AppConfigOverrides {
  maxResultsPerPlatform?: number;
}

export function buildAppConfig(
  env: NodeJS.ProcessEnv,
  overrides: AppConfigOverrides = {},
): AppConfig {
  const {
    PORT = '3000',
    INTERNAL_API_KEY = '',
    AMAZON_SCRAPER_TIMEOUT = '10000',
    ALIEXPRESS_SCRAPER_TIMEOUT = '10000',
    SHOPIFY_SCRAPER_TIMEOUT = '10000',
    MAX_RESULTS_PER_PLATFORM = '10',
  } = env;

  const config: AppConfig = {
    port: Number(PORT) || 3000,
    internalApiKey: INTERNAL_API_KEY,
    scraperTimeouts: {
      amazon: Number(AMAZON_SCRAPER_TIMEOUT) || 10000,
      aliexpress: Number(ALIEXPRESS_SCRAPER_TIMEOUT) || 10000,
      shopify: Number(SHOPIFY_SCRAPER_TIMEOUT) || 10000,
    },
    maxResultsPerPlatform:
      overrides.maxResultsPerPlatform ?? (Number(MAX_RESULTS_PER_PLATFORM) || 10),
  };

  return config;
}


