import axios from 'axios';
import { logger } from '../utils/logger.util';

interface BinanceKline {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
};

/**
 * Price Data Service
 * Uses CoinGecko API for OHLCV data (Binance is blocked from this network)
 * No authentication required for public endpoints
 */
class BinanceService {
  private baseUrl = 'https://api.coingecko.com/api/v3';

  hasSymbol(symbol: string): boolean {
    return symbol in COINGECKO_IDS;
  }

  async getOHLCV(
    symbol: string,
    interval: string = '1h',
    days: number = 3
  ): Promise<BinanceKline[]> {
    const coinId = COINGECKO_IDS[symbol];
    if (!coinId) {
      logger.debug(`CoinGecko: No mapping for symbol ${symbol}`);
      return [];
    }

    try {
      const validDays = [1, 7, 14, 30, 90, 180, 365];
      const coingeckoDays = validDays.find(d => d >= days) ?? 1;

      const response = await axios.get(`${this.baseUrl}/coins/${coinId}/ohlc`, {
        params: {
          vs_currency: 'usd',
          days: coingeckoDays,
        },
        timeout: 30000,
        headers: { 'User-Agent': 'Pryzm/1.0' },
      });

      if (!response.data || !Array.isArray(response.data)) {
        return [];
      }

      const klines: BinanceKline[] = response.data.map((k: any[]) => ({
        timestamp: k[0],
        open: k[1],
        high: k[2],
        low: k[3],
        close: k[4],
        volume: 0,
      }));

      logger.debug(`CoinGecko: Fetched ${klines.length} candles for ${symbol}`);
      return klines;
    } catch (error: any) {
      logger.warn(`CoinGecko API error for ${symbol}:`, error.message);
      return [];
    }
  }

  async getPrice(symbol: string): Promise<number | null> {
    const coinId = COINGECKO_IDS[symbol];
    if (!coinId) return null;

    try {
      const response = await axios.get(`${this.baseUrl}/simple/price`, {
        params: { ids: coinId, vs_currencies: 'usd' },
        timeout: 10000,
        headers: { 'User-Agent': 'Pryzm/1.0' },
      });
      return response.data?.[coinId]?.usd ?? null;
    } catch {
      return null;
    }
  }
}

export const binanceService = new BinanceService();
