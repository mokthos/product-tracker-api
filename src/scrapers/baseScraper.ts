import type { Agent } from 'node:http';

import { Actor } from 'apify';
import axios, { AxiosInstance, isAxiosError } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

import { PlatformName, PlatformProduct } from '../types';

export abstract class BaseScraper {
  private httpClientPromise?: Promise<AxiosInstance>;
  private proxyAgentPromise?: Promise<Agent | undefined>;

  constructor(
    public readonly platform: PlatformName,
    protected readonly query: string,
    protected readonly sourceUrl: string | undefined,
    protected readonly timeoutMs: number,
  ) {
    this.proxyAgentPromise = this.resolveProxyAgent();
  }

  protected abstract getSearchUrl(): string;
  protected abstract parseProducts(html: string): PlatformProduct[];

  async search(): Promise<PlatformProduct[]> {
    const searchUrl = this.getSearchUrl();
    if (!searchUrl) {
      return [];
    }

    try {
      const http = await this.getHttpClient();
      const response = await http.get<string>(searchUrl, {
        responseType: 'text',
      });
      return this.parseProducts(response.data);
    } catch (error) {
      if (isAxiosError(error)) {
        const status = error.response?.status;
        if (status) {
          console.warn(
            `[${this.platform}] request failed with status ${status} for URL ${searchUrl}`,
          );
        } else {
          console.warn(`[${this.platform}] network error: ${error.message}`);
        }
      } else {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[${this.platform}] scraper error: ${message}`);
      }
      return [];
    }
  }

  protected async getHttpClient(): Promise<AxiosInstance> {
    if (!this.httpClientPromise) {
      this.httpClientPromise = this.buildAxiosInstance();
    }
    return this.httpClientPromise;
  }

  private async buildAxiosInstance(): Promise<AxiosInstance> {
    const agent = await this.getProxyAgent();

    const axiosConfig = {
      timeout: this.timeoutMs,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      },
      ...(agent
        ? {
            httpAgent: agent,
            httpsAgent: agent,
            proxy: false as const,
          }
        : {}),
    };

    return axios.create(axiosConfig);
  }

  private getProxyAgent(): Promise<Agent | undefined> {
    if (!this.proxyAgentPromise) {
      this.proxyAgentPromise = this.resolveProxyAgent();
    }
    return this.proxyAgentPromise;
  }

  private async resolveProxyAgent(): Promise<Agent | undefined> {
    const proxyUrl = process.env.APIFY_PROXY_URL;
    const proxyGroups = process.env.APIFY_PROXY_GROUPS;

    if (!proxyUrl && !proxyGroups) {
      return undefined;
    }

    try {
      if (proxyUrl) {
        return new HttpsProxyAgent(proxyUrl);
      }

      const groups = proxyGroups
        ?.split(',')
        .map((group) => group.trim())
        .filter(Boolean);

      const proxyConfiguration = await Actor.createProxyConfiguration({
        groups,
      });
      if (!proxyConfiguration) {
        console.warn('Failed to initialize Apify proxy configuration');
        return undefined;
      }
      const proxyInfo = await proxyConfiguration.newProxyInfo();
      if (!proxyInfo?.url) {
        console.warn('Failed to acquire Apify proxy URL');
        return undefined;
      }
      return new HttpsProxyAgent(proxyInfo.url);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Failed to configure Apify proxy: ${message}`);
      return undefined;
    }
  }
}


