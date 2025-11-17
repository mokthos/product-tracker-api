import { Actor } from 'apify';
import dotenv from 'dotenv';

import { buildAppConfig } from './config/appConfig';
import { runTracker } from './services/trackerService';

dotenv.config();

type TrackerInput = {
  productQuery?: string;
  sourceUrl?: string | null;
  maxResultsPerPlatform?: number;
};

Actor.main(async () => {
  let input: TrackerInput | null = await Actor.getInput<TrackerInput>();

  if (!input) {
    const raw = process.env.APIFY_INPUT;
    if (raw && raw.trim().length > 0) {
      try {
        input = JSON.parse(raw) as TrackerInput;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to parse APIFY_INPUT env var as JSON: ${message}`);
      }
    }
  }

  const productQuery = input?.productQuery?.trim();
  if (!productQuery) {
    throw new Error('productQuery is required');
  }

  const overrides =
    typeof input?.maxResultsPerPlatform === 'number' && input.maxResultsPerPlatform > 0
      ? { maxResultsPerPlatform: input.maxResultsPerPlatform }
      : undefined;

  const config = buildAppConfig(process.env, overrides);
  const sourceUrl = input?.sourceUrl ?? '';
  const data = await runTracker(productQuery, sourceUrl, config);
  const payload = { status: 'ok', data };

  await Actor.pushData(payload);

  console.log(
    `[tracker] status=${payload.status} matches={amazon:${data.matches.amazon.length}, aliexpress:${data.matches.aliexpress.length}, shopify:${data.matches.shopify.length}}`,
  );
});


