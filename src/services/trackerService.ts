import { ScraperManager } from '../scrapers/scraperManager';
import { AppConfig, TrackerResponse } from '../types';

export async function runTracker(
  productQuery: string,
  sourceUrl: string | undefined,
  config: AppConfig,
): Promise<TrackerResponse> {
  const scraperManager = new ScraperManager(productQuery, sourceUrl, config);
  const matches = await scraperManager.runAll();

  return {
    productQuery,
    sourceUrl,
    productPageUrl: sourceUrl,
    matches,
    analysis: {
      dropshippingProbability: 0,
    },
  };
}


