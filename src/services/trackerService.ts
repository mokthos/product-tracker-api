import { ScraperManager } from '../scrapers/scraperManager';
import { AppConfig, TrackerResponse } from '../types';

export async function runTracker(
  productQuery: string,
  sourceUrl: string | undefined,
  config: AppConfig,
): Promise<TrackerResponse> {
  const scraperManager = new ScraperManager(productQuery, sourceUrl, config);
  const matches = await scraperManager.runAll();

  const topAmazon = matches.amazon[0] ?? null;
  const topAliExpress = matches.aliexpress[0] ?? null;
  const topShopify = matches.shopify[0] ?? null;

  return {
    productQuery,
    sourceUrl,
    productPageUrl: sourceUrl,
    matches,
    analysis: {
      dropshippingProbability: 0,
    },
    amazonProductUrl: topAmazon?.url ?? null,
    aliexpressProductUrl: topAliExpress?.url ?? null,
    shopifyProductUrl: topShopify?.url ?? null,
  };
}


