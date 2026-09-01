import { config } from '../config/env.config';
import { logger } from '../utils/logger.util';
import { retry } from '../utils/retry.util';

class TavilyService {
  private baseUrl = 'https://api.tavily.com';

  private get apiKey() {
    return config.TAVILY_API_KEY;
  }

  constructor() {
    if (!this.apiKey) {
      logger.warn('⚠️ TAVILY_API_KEY missing. Tavily service will not function.');
    }
  }

  async search(query: string, options: { include_domains?: string[], exclude_domains?: string[], search_depth?: 'basic' | 'advanced' } = {}): Promise<any> {
    const apiKey = this.apiKey;
    if (!apiKey) {
      logger.warn('Skipping Tavily search: No API key');
      return { results: [] };
    }

    return retry(async () => {
      try {
        const response = await fetch(`${this.baseUrl}/search`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            api_key: apiKey,
            query,
            search_depth: options.search_depth || 'basic',
            include_domains: options.include_domains,
            exclude_domains: options.exclude_domains,
            include_answer: true,
            include_images: false,
            include_raw_content: false,
            max_results: 5,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          logger.error('Tavily API error', errorData);
          throw new Error(`Tavily API error: ${response.status}`);
        }

        const data = await response.json();
        return data;
      } catch (error: any) {
        logger.error('Failed to search Tavily', error.message);
        throw error;
      }
    });
  }

  async searchNews(query: string): Promise<any> {
    // Tavily is great for general search, but we can tune it for news/social
    // by adding keywords or using specific domains if needed.
    // For now, a general search with "news" or "latest" in query might help,
    // or just relying on Tavily's freshness.
    return this.search(query, { search_depth: 'advanced' });
  }
}

export const tavilyService = new TavilyService();
