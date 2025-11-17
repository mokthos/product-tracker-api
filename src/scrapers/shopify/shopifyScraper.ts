import { load } from 'cheerio';
import { isAxiosError } from 'axios';

import { BaseScraper } from '../baseScraper';
import { PlatformProduct } from '../../types';

const SHOPIFY_SEARCH_BASE_URL = 'https://duckduckgo.com/html/';
const SHOPIFY_DOMAIN_REGEX = /(myshopify\.com|\.shopify\.com)/i;
const BOT_PATTERNS = [/captcha/i, /verification/i, /enable javascript/i];

export class ShopifyScraper extends BaseScraper {
  constructor(
    query: string,
    sourceUrl: string | undefined,
    timeoutMs: number,
    private readonly maxResults: number,
  ) {
    super('shopify', query, sourceUrl, timeoutMs);
  }

  async search(): Promise<PlatformProduct[]> {
    const searchUrl = this.getSearchUrl();
    if (!searchUrl) {
      return [];
    }

    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      try {
        const http = await this.getHttpClient();
        const response = await http.get<string>(searchUrl, {
          responseType: 'text',
          headers: this.buildRequestHeaders(),
          decompress: true,
        });

        const status = response.status;
        if (status === 429 || status === 503) {
          console.warn(
            `[shopify] request failed with status ${status} on attempt ${attempt}/${maxRetries}`,
          );
          await this.maybeRetry(attempt, maxRetries);
          continue;
        }

        const html = response.data ?? '';
        if (typeof html !== 'string' || html.trim().length === 0) {
          console.warn(`[shopify] empty HTML response on attempt ${attempt}/${maxRetries}`);
          await this.maybeRetry(attempt, maxRetries);
          continue;
        }

        if (this.isBotPage(html)) {
          console.warn('[shopify] DuckDuckGo returned a captcha / bot page');
          return [];
        }

        return this.parseProducts(html);
      } catch (error) {
        if (isAxiosError(error)) {
          const status = error.response?.status;
          if (status) {
            console.warn(
              `[shopify] request failed with status ${status} on attempt ${attempt}/${maxRetries}`,
            );
          } else {
            console.warn(`[shopify] network error: ${error.message}`);
          }
        } else {
          const message = error instanceof Error ? error.message : String(error);
          console.error('[shopify] scraper error:', message);
        }

        await this.maybeRetry(attempt, maxRetries);
      }
    }

    return [];
  }

  protected getSearchUrl(): string {
    const query = `${this.query} site:myshopify.com product`;
    const params = new URLSearchParams({
      q: query,
      ia: 'web',
    });
    return `${SHOPIFY_SEARCH_BASE_URL}?${params.toString()}`;
  }

  protected parseProducts(html: string): PlatformProduct[] {
    const $ = load(html);
    const products: PlatformProduct[] = [];

    $('.result').each((_idx, element) => {
      if (products.length >= this.maxResults) {
        return false;
      }

      const container = $(element);
      const anchor = container.find('a.result__a').first();
      const rawHref = anchor.attr('href');
      const url = this.normalizeResultLink(rawHref);

      if (!url || !SHOPIFY_DOMAIN_REGEX.test(url)) {
        return;
      }

      const title = anchor.text().trim();
      if (!title) {
        return;
      }

      products.push({
        platform: 'shopify',
        title,
        url,
        price: null,
        currency: null,
        image: null,
        imageUrl: null,
        sourcePlatform: 'shopify',
      });
    });

    return products;
  }

  private normalizeResultLink(rawHref?: string): string | null {
    if (!rawHref) {
      return null;
    }

    if (rawHref.startsWith('/l/?')) {
      try {
        const url = new URL(rawHref, SHOPIFY_SEARCH_BASE_URL);
        const encoded = url.searchParams.get('uddg');
        if (encoded) {
          return decodeURIComponent(encoded);
        }
      } catch {
        return null;
      }
    }

    if (rawHref.startsWith('http')) {
      return rawHref;
    }

    return null;
  }

  private async maybeRetry(attempt: number, maxRetries: number): Promise<void> {
    if (attempt >= maxRetries) {
      return;
    }

    const delay = 300 + Math.floor(Math.random() * 300);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  private isBotPage(html: string): boolean {
    return BOT_PATTERNS.some((pattern) => pattern.test(html));
  }

  private buildRequestHeaders(): Record<string, string> {
    return {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
      DNT: '1',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-User': '?1',
    };
  }
}

