import { load, type Cheerio } from 'cheerio';
import type { Element } from 'domhandler';
import { isAxiosError } from 'axios';

import { BaseScraper } from '../baseScraper';
import { PlatformProduct } from '../../types';

const ALIEXPRESS_BASE_URL = 'https://www.aliexpress.com';
const PRODUCT_SELECTORS = [
  '[data-widget="productList"] li',
  '[data-product-id]',
  '.manhattan--container--1lP57Ag',
  '.list-item',
].join(',');

const BOT_PATTERNS = [/captcha/i, /robot/i, /verification/i];

export class AliExpressScraper extends BaseScraper {
  constructor(
    query: string,
    sourceUrl: string | undefined,
    timeoutMs: number,
    private readonly maxResults: number,
  ) {
    super('aliexpress', query, sourceUrl, timeoutMs);
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
            `[aliexpress] request failed with status ${status} on attempt ${attempt}/${maxRetries}`,
          );
          await this.maybeRetry(attempt, maxRetries);
          continue;
        }

        const html = response.data ?? '';
        if (typeof html !== 'string' || html.trim().length === 0) {
          console.warn(`[aliexpress] empty HTML response on attempt ${attempt}/${maxRetries}`);
          await this.maybeRetry(attempt, maxRetries);
          continue;
        }

        if (this.isBotPage(html)) {
          console.warn('[aliexpress] received a verification / captcha page');
          return [];
        }

        return this.parseProducts(html);
      } catch (error) {
        if (isAxiosError(error)) {
          const status = error.response?.status;
          if (status) {
            console.warn(
              `[aliexpress] request failed with status ${status} on attempt ${attempt}/${maxRetries}`,
            );
          } else {
            console.warn(`[aliexpress] network error: ${error.message}`);
          }
        } else {
          const message = error instanceof Error ? error.message : String(error);
          console.error('[aliexpress] scraper error:', message);
        }

        await this.maybeRetry(attempt, maxRetries);
      }
    }

    return [];
  }

  protected getSearchUrl(): string {
    const encodedQuery = encodeURIComponent(this.query.trim());
    return `${ALIEXPRESS_BASE_URL}/wholesale?SearchText=${encodedQuery}&SortType=default`;
  }

  protected parseProducts(html: string): PlatformProduct[] {
    const $ = load(html);
    const products: PlatformProduct[] = [];

    $(PRODUCT_SELECTORS).each((_idx, element) => {
      if (products.length >= this.maxResults) {
        return false;
      }

      const container = $(element) as Cheerio<Element>;
      const anchor =
        container.find('a[href*="/item/"]').first().length > 0
          ? container.find('a[href*="/item/"]').first()
          : container.closest('a[href*="/item/"]');

      const href = anchor.attr('href') ?? container.attr('href');
      const title =
        anchor.attr('title') ??
        container.find('.multi--titleText--nXeOvyr').text() ??
        container.find('.manhattan--titleText--WccSjUS').text() ??
        anchor.text();

      if (!href || !title?.trim()) {
        return;
      }

      const url = this.ensureAbsoluteUrl(href);
      if (!url) {
        return;
      }

      const image =
        container.find('img').attr('src') ??
        container.find('img').attr('data-src') ??
        container.find('img').attr('image-src') ??
        null;

      const priceText = this.extractPriceText(container);
      const { price, currency } = this.parsePrice(priceText);

      products.push({
        platform: 'aliexpress',
        title: title.trim(),
        url,
        price,
        currency,
        image,
        imageUrl: image,
        sourcePlatform: 'aliexpress',
      });
    });

    return products;
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

  private isBotPage(html: string): boolean {
    return BOT_PATTERNS.some((pattern) => pattern.test(html));
  }

  private ensureAbsoluteUrl(relative: string): string | null {
    try {
      const normalized = relative.startsWith('http')
        ? relative
        : `${ALIEXPRESS_BASE_URL}${relative.startsWith('/') ? '' : '/'}${relative.replace(
            /^\/+/,
            '',
          )}`;
      return new URL(normalized).toString();
    } catch {
      return null;
    }
  }

  private extractPriceText(container: Cheerio<Element>): string {
    return (
      container.find('.multi--price-sale--U-S0jtj').text() ||
      container.find('.manhattan--price-sale--1CCEZfK').text() ||
      container.find('.price').text() ||
      container.find('.price-current').text() ||
      ''
    );
  }

  private parsePrice(raw: string): { price: number | null; currency: string | null } {
    if (!raw) {
      return { price: null, currency: null };
    }

    const match = raw.match(/([$€£]|[A-Z]{3})?\s*([\d.,]+)/);
    if (!match) {
      return { price: null, currency: null };
    }

    const currencySymbol = match[1] ?? null;
    const numericPart = match[2]?.replace(/,/g, '').replace(/[^\d.]/g, '');
    const price = numericPart ? Number.parseFloat(numericPart) : null;

    return {
      price: Number.isNaN(price) ? null : price,
      currency: currencySymbol?.trim() ?? null,
    };
  }
}

