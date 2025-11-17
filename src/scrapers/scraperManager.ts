import { AppConfig, PlatformMatches, PlatformName, PlatformProduct } from '../types';
import { AmazonScraper } from './amazon/amazonScraper';
import { AliExpressScraper } from './aliexpress/aliexpressScraper';
import { ShopifyScraper } from './shopify/shopifyScraper';

export class ScraperManager {
  constructor(
    private readonly query: string,
    private readonly sourceUrl: string | undefined,
    private readonly config: AppConfig,
  ) {}

  async runAll(): Promise<PlatformMatches> {
    const scrapers: Record<PlatformName, () => Promise<PlatformProduct[]>> = {
      amazon: () =>
        new AmazonScraper(
          this.query,
          this.sourceUrl,
          this.config.scraperTimeouts.amazon,
          this.config.maxResultsPerPlatform,
        ).search(),
      aliexpress: () =>
        new AliExpressScraper(
          this.query,
          this.sourceUrl,
          this.config.scraperTimeouts.aliexpress,
          this.config.maxResultsPerPlatform,
        ).search(),
      shopify: () =>
        new ShopifyScraper(
          this.query,
          this.sourceUrl,
          this.config.scraperTimeouts.shopify,
          this.config.maxResultsPerPlatform,
        ).search(),
    };

    const platforms = Object.keys(scrapers) as PlatformName[];
    const results = await Promise.all(
      platforms.map(async (platform) => {
        try {
          const products = await scrapers[platform]();
          return this.sortByRelevance(products);
        } catch (error) {
          console.error(`[${platform}] scraper crashed:`, error);
          return [];
        }
      }),
    );

    return platforms.reduce<PlatformMatches>((acc, platform, index) => {
      acc[platform] = results[index];
      return acc;
    }, { amazon: [], aliexpress: [], shopify: [] });
  }

  private sortByRelevance(products: PlatformProduct[]): PlatformProduct[] {
    return [...products].sort(
      (a, b) => this.computeScore(b) - this.computeScore(a),
    );
  }

  private computeScore(product: PlatformProduct): number {
    if (!product.title) {
      return 0;
    }

    const normalizedQuery = this.query.toLowerCase();
    const normalizedTitle = product.title.toLowerCase();
    let score = 0;

    if (normalizedTitle.includes(normalizedQuery)) {
      score += 2;
    }

    const lengthDifference = Math.abs(normalizedTitle.length - normalizedQuery.length);
    score += Math.max(0, 1 - lengthDifference / Math.max(normalizedQuery.length, 1));

    return score;
  }
}
