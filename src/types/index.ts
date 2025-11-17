export type PlatformName = 'amazon' | 'aliexpress' | 'shopify';

export interface PlatformProduct {
  platform: PlatformName;
  title: string;
  url: string;
  id?: string;
  price?: number | null;
  currency?: string | null;
  image?: string | null;
  imageUrl?: string | null;
  rating?: number;
  reviewsCount?: number;
  isSponsored?: boolean;
  sourcePlatform?: PlatformName;
  raw?: unknown;
}

export interface PlatformMatches {
  amazon: PlatformProduct[];
  aliexpress: PlatformProduct[];
  shopify: PlatformProduct[];
}

export interface MarginAnalysis {
  originEstimate?: PlatformName;
  dropshippingProbability: number;
  bestSource?: PlatformProduct;
  influencerShop?: {
    price: number;
    currency: string;
    url?: string;
  };
  estimatedMarginMultiplier?: number;
}

export interface TrackerResponse {
  productQuery: string;
  sourceUrl?: string;
  productPageUrl?: string;
  matches: PlatformMatches;
  analysis: MarginAnalysis;
}

export interface ScraperTimeoutConfig {
  amazon: number;
  aliexpress: number;
  shopify: number;
}

export interface AppConfig {
  port: number;
  internalApiKey: string;
  scraperTimeouts: ScraperTimeoutConfig;
  maxResultsPerPlatform: number;
}


