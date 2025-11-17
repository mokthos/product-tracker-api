import { load, type Cheerio } from 'cheerio';
import { isAxiosError } from 'axios';
import type { Element } from 'domhandler';

import { BaseScraper } from '../baseScraper';
import { PlatformProduct } from '../../types';

const AMAZON_BASE_URL = 'https://www.amazon.com';
const CURRENCY_SYMBOLS: Record<string, string> = {
  $: 'USD',
  '\u20AC': 'EUR',
  '\u00A3': 'GBP',
};

export class AmazonScraper extends BaseScraper {
  constructor(
    query: string,
    sourceUrl: string | undefined,
    timeoutMs: number,
    private readonly maxResults: number,
  ) {
    super('amazon', query, sourceUrl, timeoutMs);
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
        if (status === 503 || status === 429) {
          console.warn(
            `[amazon] request failed with status ${status} on attempt ${attempt}/${maxRetries}`,
          );
          await this.maybeRetry(attempt, maxRetries);
          continue;
        }

        const html = response.data ?? '';
        if (typeof html !== 'string' || html.trim().length === 0) {
          console.warn(`[amazon] empty HTML response on attempt ${attempt}/${maxRetries}`);
          await this.maybeRetry(attempt, maxRetries);
          continue;
        }

        console.log('=== AMAZON SCRAPER DEBUG ===');
        console.log('Request URL:', searchUrl);
        console.log('Status Code:', status);
        console.log('HTML Length:', html.length);

        if (/Robot Check/i.test(html) || /captcha/i.test(html)) {
          console.warn('[amazon] Amazon returned a CAPTCHA / Robot Check page.');
          return [];
        }

        console.log('HTML Preview:', html.slice(0, 500));

        return this.parseProducts(html);
      } catch (error) {
        if (isAxiosError(error)) {
          const status = error.response?.status;
          if (status) {
            console.warn(
              `[amazon] request failed with status ${status} on attempt ${attempt}/${maxRetries}`,
            );
          } else {
            console.warn(`[amazon] network error: ${error.message}`);
          }
        } else {
          const message = error instanceof Error ? error.message : String(error);
          console.error('[amazon] scraper error:', message);
        }

        await this.maybeRetry(attempt, maxRetries);
      }
    }

    return [];
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
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
    };
  }

  private async maybeRetry(attempt: number, maxRetries: number): Promise<void> {
    if (attempt >= maxRetries) {
      return;
    }

    const delay = 300 + Math.floor(Math.random() * 300);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  protected getSearchUrl(): string {
    const encodedQuery = encodeURIComponent(this.query.trim());
    return `${AMAZON_BASE_URL}/s?k=${encodedQuery}`;
  }

  protected parseProducts(html: string): PlatformProduct[] {
    const $ = load(html);
    const products: PlatformProduct[] = [];

    $('.s-main-slot .s-result-item[data-component-type="s-search-result"]').each(
      (_idx, element) => {
        if (products.length >= this.maxResults) {
          return false;
        }

        const container = $(element);
        const sponsored =
          container.attr('data-component-type') === 'sp-sponsored-result' ||
          container.find('[aria-label="Sponsored"], .s-sponsored-label-text').length > 0;
        if (sponsored) {
          return;
        }

        const title = container.find('h2 a span').text().trim();
        const rawLink = container.find('h2 a').attr('href');

        if (!title || !rawLink) {
          return;
        }

        const url = this.normalizeProductLink(rawLink);
        if (!url) {
          return;
        }

        const image =
          container.find('img.s-image').attr('src') ??
          container.find('img').first().attr('src') ??
          null;

        const priceInfo = this.extractPrice(container);

        products.push({
          platform: 'amazon',
          title,
          url,
          price: priceInfo.price,
          currency: priceInfo.currency,
          image,
          imageUrl: image,
          sourcePlatform: 'amazon',
        });
      },
    );

    return products;
  }

  private normalizeProductLink(rawLink: string): string | null {
    if (!rawLink) {
      return null;
    }

    let candidate = rawLink.trim();

    try {
      if (!candidate.startsWith('http')) {
        candidate = `${AMAZON_BASE_URL}${candidate.startsWith('/') ? '' : '/'}${candidate.replace(
          /^\/+/,
          '',
        )}`;
      }

      let urlObject = new URL(candidate);
      const redirectTarget = urlObject.searchParams.get('url') ?? urlObject.searchParams.get('location');
      if (redirectTarget) {
        const decoded = decodeURIComponent(redirectTarget);
        urlObject = new URL(decoded.startsWith('http') ? decoded : `${AMAZON_BASE_URL}${decoded}`);
      }

      const asinMatch =
        urlObject.pathname.match(/\/dp\/([A-Z0-9]{10})/i) ||
        urlObject.pathname.match(/\/gp\/product\/([A-Z0-9]{10})/i);

      if (asinMatch) {
        return `${AMAZON_BASE_URL}/dp/${asinMatch[1].toUpperCase()}`;
      }

      return `${urlObject.origin}${urlObject.pathname}`.replace(/\/+$/, '');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.debug('[amazon] failed to normalize product link:', message);
      return null;
    }
  }

  private extractPrice(container: Cheerio<Element>): {
    price: number | null;
    currency: string | null;
  } {
    let price: number | null = null;
    let currency: string | null = null;

    try {
      const priceContainer = container.find('.a-price');
      if (priceContainer.length > 0) {
        const symbol = priceContainer.find('.a-price-symbol').first().text().trim();
        const whole = priceContainer.find('.a-price-whole').first().text().trim();
        const fraction = priceContainer.find('.a-price-fraction').first().text().trim();

        if (whole) {
          const normalizedWhole = whole.replace(/[^\d]/g, '');
          const normalizedFraction = fraction.replace(/[^\d]/g, '');
          price = parseFloat(`${normalizedWhole}.${normalizedFraction || '00'}`);
        }

        if (symbol) {
          currency = CURRENCY_SYMBOLS[symbol] ?? symbol;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.debug('[amazon] price parsing failed:', message);
    }

    return { price, currency };
  }
}


