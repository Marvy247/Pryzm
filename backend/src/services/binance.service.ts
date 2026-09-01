import axios from 'axios';
import { logger } from '../utils/logger.util';
import { TRADEABLE_TOKENS_MAP, getBinanceSymbol, isTradeableSymbol } from '../constants/tradeable-tokens.constant';

interface BinanceKline {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Binance Public API Service
 * Provides real OHLCV data from Binance USDT-M Perpetual Futures
 * Uses the unified TRADEABLE_TOKENS constant for symbol mapping
 * No authentication required for public market data endpoints
 */
class BinanceService {
  // Using Binance Futures API for perpetual data (more relevant for trading)
  private baseUrl = 'https://fapi.binance.com/fapi/v1';
  private spotUrl = 'https://api.binance.com/api/v3';

  /**
   * Check if we have a Binance pair for this symbol
   * Uses the unified TRADEABLE_TOKENS constant
   */
  hasSymbol(symbol: string): boolean {
    return isTradeableSymbol(symbol);
  }

  /**
   * Get the Binance symbol for a given token
   * Uses the unified TRADEABLE_TOKENS constant
   */
  private getBinancePair(symbol: string): string | undefined {
    return getBinanceSymbol(symbol);
  }

  /**
   * Get real OHLCV data from Binance Futures
   * @param symbol Token symbol (e.g., 'BTC', 'ETH', 'SOL')
   * @param interval Kline interval ('1h', '4h', '1d')
   * @param days Number of days of history
   */
  async getOHLCV(
    symbol: string,
    interval: '1m' | '5m' | '15m' | '1h' | '4h' | '1d' = '1h',
    days: number = 30
  ): Promise<BinanceKline[]> {
    const binanceSymbol = this.getBinancePair(symbol);
    
    if (!binanceSymbol) {
      logger.debug(`Binance: No mapping for symbol ${symbol} - not in TRADEABLE_TOKENS`);
      return [];
    }

    try {
      // Calculate limit based on interval and days
      // 1h = 24 candles/day, 4h = 6 candles/day, 1d = 1 candle/day
      const candlesPerDay = interval === '1m' ? 1440 : interval === '5m' ? 288 : interval === '15m' ? 96 : interval === '1h' ? 24 : interval === '4h' ? 6 : 1;
      const limit = Math.min(days * candlesPerDay, 1500); // Binance Futures max is 1500

      const response = await axios.get(`${this.baseUrl}/klines`, {
        params: {
          symbol: binanceSymbol,
          interval: interval,
          limit: limit
        },
        timeout: 10000
      });

      if (!response.data || !Array.isArray(response.data)) {
        return [];
      }

      // Binance kline format: [openTime, open, high, low, close, volume, closeTime, ...]
      const klines: BinanceKline[] = response.data.map((k: any[]) => ({
        timestamp: k[0],
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5])
      }));

      logger.debug(`Binance Futures: Fetched ${klines.length} candles for ${binanceSymbol}`);
      return klines;

    } catch (error: any) {
      if (error.response?.status === 400) {
        // Symbol doesn't exist on Binance Futures, try spot
        logger.debug(`Binance Futures: Symbol ${binanceSymbol} not found, trying spot`);
        return this.getSpotOHLCV(binanceSymbol, interval, days);
      } else {
        logger.warn(`Binance API error for ${symbol}:`, error.message);
      }
      return [];
    }
  }

  /**
   * Fallback to spot market if futures doesn't have the pair
   */
  private async getSpotOHLCV(
    binanceSymbol: string,
    interval: string,
    days: number
  ): Promise<BinanceKline[]> {
    try {
      const candlesPerDay = interval === '1h' ? 24 : interval === '4h' ? 6 : interval === '1d' ? 1 : 24;
      const limit = Math.min(days * candlesPerDay, 1000);

      const response = await axios.get(`${this.spotUrl}/klines`, {
        params: {
          symbol: binanceSymbol,
          interval: interval,
          limit: limit
        },
        timeout: 10000
      });

      if (!response.data || !Array.isArray(response.data)) {
        return [];
      }

      const klines: BinanceKline[] = response.data.map((k: any[]) => ({
        timestamp: k[0],
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5])
      }));

      logger.debug(`Binance Spot: Fetched ${klines.length} candles for ${binanceSymbol}`);
      return klines;
    } catch (error) {
      return [];
    }
  }

  /**
   * Get current price from Binance Futures
   */
  async getPrice(symbol: string): Promise<number | null> {
    const binanceSymbol = this.getBinancePair(symbol);
    
    if (!binanceSymbol) {
      return null;
    }

    try {
      const response = await axios.get(`${this.baseUrl}/ticker/price`, {
        params: { symbol: binanceSymbol },
        timeout: 5000
      });

      return parseFloat(response.data.price);
    } catch (error) {
      // Try spot as fallback
      try {
        const response = await axios.get(`${this.spotUrl}/ticker/price`, {
          params: { symbol: binanceSymbol },
          timeout: 5000
        });
        return parseFloat(response.data.price);
      } catch {
        return null;
      }
    }
  }

  /**
   * Get 24h ticker stats (volume, price change, etc.)
   */
  async get24hStats(symbol: string): Promise<{
    priceChange: number;
    priceChangePercent: number;
    volume: number;
    quoteVolume: number;
    highPrice: number;
    lowPrice: number;
  } | null> {
    const binanceSymbol = this.getBinancePair(symbol);
    
    if (!binanceSymbol) {
      return null;
    }

    try {
      const response = await axios.get(`${this.baseUrl}/ticker/24hr`, {
        params: { symbol: binanceSymbol },
        timeout: 5000
      });

      return {
        priceChange: parseFloat(response.data.priceChange),
        priceChangePercent: parseFloat(response.data.priceChangePercent),
        volume: parseFloat(response.data.volume),
        quoteVolume: parseFloat(response.data.quoteVolume),
        highPrice: parseFloat(response.data.highPrice),
        lowPrice: parseFloat(response.data.lowPrice)
      };
    } catch (error) {
      // Try spot as fallback
      try {
        const response = await axios.get(`${this.spotUrl}/ticker/24hr`, {
          params: { symbol: binanceSymbol },
          timeout: 5000
        });
        return {
          priceChange: parseFloat(response.data.priceChange),
          priceChangePercent: parseFloat(response.data.priceChangePercent),
          volume: parseFloat(response.data.volume),
          quoteVolume: parseFloat(response.data.quoteVolume),
          highPrice: parseFloat(response.data.highPrice),
          lowPrice: parseFloat(response.data.lowPrice)
        };
      } catch {
        return null;
      }
    }
  }
}

export const binanceService = new BinanceService();
