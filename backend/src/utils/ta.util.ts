export interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export class TechnicalAnalysis {
  static calculateSMA(data: number[], period: number): number[] {
    if (data.length < period) return [];
    const sma: number[] = [];
    for (let i = period - 1; i < data.length; i++) {
      const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      sma.push(sum / period);
    }
    return sma;
  }

  static calculateEMA(data: number[], period: number): number[] {
    if (data.length < period) return [];
    const k = 2 / (period + 1);
    const ema: number[] = [data[0]]; // Start with first price as initial EMA
    
    // Calculate initial SMA for the first period to be more accurate if needed, 
    // but standard EMA often starts with first price or SMA of first period.
    // Let's use SMA of first 'period' elements as the starting point for the rest.
    const firstSMA = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
    const result: number[] = [];
    
    // We need to align the result array with the input data or just return the latest values.
    // Usually indicators return an array corresponding to the input time series.
    // Let's do a simple loop.
    
    let currentEma = firstSMA;
    // We can't calculate EMA for the first 'period-1' points properly without history, 
    // but usually we just start calculating.
    
    // Let's use a standard implementation:
    // EMA_today = (Price_today * k) + (EMA_yesterday * (1-k))
    
    const emaArray: number[] = new Array(data.length).fill(0);
    
    // Initialize first valid EMA at index 'period - 1'
    emaArray[period - 1] = firstSMA;
    
    for (let i = period; i < data.length; i++) {
      emaArray[i] = (data[i] * k) + (emaArray[i - 1] * (1 - k));
    }
    
    // Return only the valid part, or all? Let's return all, but 0s for initial.
    // Or better, return the aligned array.
    return emaArray;
  }

  static calculateRSI(data: number[], period: number = 14): number[] {
    if (data.length < period + 1) return [];
    
    const changes = data.slice(1).map((price, i) => price - data[i]);
    const gains = changes.map(c => c > 0 ? c : 0);
    const losses = changes.map(c => c < 0 ? -c : 0);
    
    const rsi: number[] = new Array(data.length).fill(0);
    
    let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
    
    // First RSI
    let rs = avgGain / avgLoss;
    rsi[period] = 100 - (100 / (1 + rs));
    
    for (let i = period + 1; i < data.length; i++) {
      const change = changes[i - 1];
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? -change : 0;
      
      avgGain = ((avgGain * (period - 1)) + gain) / period;
      avgLoss = ((avgLoss * (period - 1)) + loss) / period;
      
      if (avgLoss === 0) {
        rsi[i] = 100;
      } else {
        rs = avgGain / avgLoss;
        rsi[i] = 100 - (100 / (1 + rs));
      }
    }
    
    return rsi;
  }

  static calculateMACD(data: number[], fastPeriod: number = 12, slowPeriod: number = 26, signalPeriod: number = 9): { macd: number[], signal: number[], histogram: number[] } {
    const fastEMA = this.calculateEMA(data, fastPeriod);
    const slowEMA = this.calculateEMA(data, slowPeriod);
    
    const macdLine: number[] = new Array(data.length).fill(0);
    
    for (let i = 0; i < data.length; i++) {
      if (i >= slowPeriod - 1) {
        macdLine[i] = fastEMA[i] - slowEMA[i];
      }
    }
    
    // Calculate Signal Line (EMA of MACD Line)
    // We need to pass the non-zero part of MACD line to EMA calculation?
    // Or just pass the whole thing. The EMA function handles the start index.
    // But our EMA function expects valid data from start.
    // Let's slice the valid MACD part.
    
    const validMacdStart = slowPeriod - 1;
    const validMacdData = macdLine.slice(validMacdStart);
    const signalLineValid = this.calculateEMA(validMacdData, signalPeriod);
    
    const signalLine: number[] = new Array(data.length).fill(0);
    // Map valid signal line back to original indices
    // signalLineValid starts at index 'signalPeriod - 1' relative to validMacdData
    // validMacdData starts at 'validMacdStart' relative to original
    
    for (let i = 0; i < signalLineValid.length; i++) {
        // The index in original array
        const originalIndex = validMacdStart + i;
        signalLine[originalIndex] = signalLineValid[i];
    }

    const histogram: number[] = new Array(data.length).fill(0);
    for(let i = 0; i < data.length; i++) {
        if (signalLine[i] !== 0 || i > validMacdStart + signalPeriod) { // Simple check
             histogram[i] = macdLine[i] - signalLine[i];
        }
    }

    return { macd: macdLine, signal: signalLine, histogram };
  }

  // ========== ADVANCED TA INDICATORS (2025 META) ==========

  /**
   * 1. Cumulative Volume Delta (CVD) - Orderflow Analysis
   * Tracks cumulative buy vs sell pressure by analyzing volume imbalances
   * CVD rising while price falls = bullish divergence (accumulation)
   */
  static calculateCVD(ohlcv: OHLCV[]): { cvd: number[], divergence: boolean } {
    if (ohlcv.length === 0) return { cvd: [], divergence: false };
    
    const cvd: number[] = [];
    let cumulativeDelta = 0;
    
    for (let i = 0; i < ohlcv.length; i++) {
      const candle = ohlcv[i];
      // Estimate buy/sell volume based on close vs open
      // If close > open (green candle), assume more buying pressure
      // This is simplified - with orderbook data you'd use actual buy/sell volumes
      const delta = candle.close > candle.open 
        ? candle.volume  // Bullish candle - buying pressure
        : -candle.volume; // Bearish candle - selling pressure
      
      cumulativeDelta += delta;
      cvd.push(cumulativeDelta);
    }
    
    // Detect divergence: CVD rising while price falling (last 10 candles)
    const lookback = Math.min(10, ohlcv.length);
    const recentCVD = cvd.slice(-lookback);
    const recentPrices = ohlcv.slice(-lookback).map(c => c.close);
    
    const cvdTrend = recentCVD[recentCVD.length - 1] > recentCVD[0];
    const priceTrend = recentPrices[recentPrices.length - 1] < recentPrices[0];
    const divergence = cvdTrend && priceTrend; // Bullish divergence
    
    return { cvd, divergence };
  }

  /**
   * 2. ICT Order Blocks & Fair Value Gaps (FVG)
   * Order Block: High-volume reversal zone where institutions placed orders
   * FVG: Price gap that acts as magnet for price to fill
   */
  static detectOrderBlocksAndFVG(ohlcv: OHLCV[]): { 
    orderBlocks: Array<{ price: number, type: 'bullish' | 'bearish', strength: number }>,
    fairValueGaps: Array<{ high: number, low: number, index: number }>
  } {
    const orderBlocks: Array<{ price: number, type: 'bullish' | 'bearish', strength: number }> = [];
    const fairValueGaps: Array<{ high: number, low: number, index: number }> = [];
    
    // Detect Order Blocks (last swing high/low with high volume)
    for (let i = 2; i < ohlcv.length - 2; i++) {
      const curr = ohlcv[i];
      const prev = ohlcv[i - 1];
      const next = ohlcv[i + 1];
      
      // Bullish Order Block: Low before rally
      if (curr.low < prev.low && curr.low < next.low && curr.volume > prev.volume * 1.5) {
        orderBlocks.push({
          price: curr.low,
          type: 'bullish',
          strength: curr.volume / prev.volume
        });
      }
      
      // Bearish Order Block: High before dump
      if (curr.high > prev.high && curr.high > next.high && curr.volume > prev.volume * 1.5) {
        orderBlocks.push({
          price: curr.high,
          type: 'bearish',
          strength: curr.volume / prev.volume
        });
      }
    }
    
    // Detect Fair Value Gaps (price gaps between candles)
    for (let i = 1; i < ohlcv.length - 1; i++) {
      const prev = ohlcv[i - 1];
      const curr = ohlcv[i];
      const next = ohlcv[i + 1];
      
      // Bullish FVG: Gap up (prev.high < next.low)
      if (prev.high < next.low) {
        fairValueGaps.push({
          high: next.low,
          low: prev.high,
          index: i
        });
      }
      
      // Bearish FVG: Gap down (prev.low > next.high)
      if (prev.low > next.high) {
        fairValueGaps.push({
          high: prev.low,
          low: next.high,
          index: i
        });
      }
    }
    
    return { orderBlocks: orderBlocks.slice(-5), fairValueGaps: fairValueGaps.slice(-3) };
  }

  /**
   * 3. Volume Profile Fixed Range (VPFR)
   * Shows where most volume traded in price range - high volume nodes = support/resistance
   */
  static calculateVolumeProfile(ohlcv: OHLCV[], bins: number = 20): {
    poc: number, // Point of Control (highest volume)
    valueArea: { high: number, low: number },
    profile: Array<{ price: number, volume: number }>
  } {
    if (ohlcv.length === 0) return { poc: 0, valueArea: { high: 0, low: 0 }, profile: [] };
    
    const priceRange = ohlcv.reduce((acc, c) => {
      return { min: Math.min(acc.min, c.low), max: Math.max(acc.max, c.high) };
    }, { min: Infinity, max: -Infinity });
    
    const binSize = (priceRange.max - priceRange.min) / bins;
    const volumeBins: number[] = new Array(bins).fill(0);
    
    // Distribute volume across price bins
    ohlcv.forEach(candle => {
      const avgPrice = (candle.high + candle.low + candle.close) / 3;
      const binIndex = Math.min(Math.floor((avgPrice - priceRange.min) / binSize), bins - 1);
      volumeBins[binIndex] += candle.volume;
    });
    
    // Find POC (highest volume bin)
    let maxVolume = 0;
    let pocIndex = 0;
    volumeBins.forEach((vol, idx) => {
      if (vol > maxVolume) {
        maxVolume = vol;
        pocIndex = idx;
      }
    });
    
    const poc = priceRange.min + (pocIndex + 0.5) * binSize;
    
    // Value Area: 70% of volume around POC
    const totalVolume = volumeBins.reduce((a, b) => a + b, 0);
    const targetVolume = totalVolume * 0.7;
    let accumulatedVolume = volumeBins[pocIndex];
    let lowIndex = pocIndex;
    let highIndex = pocIndex;
    
    while (accumulatedVolume < targetVolume && (lowIndex > 0 || highIndex < bins - 1)) {
      const lowVol = lowIndex > 0 ? volumeBins[lowIndex - 1] : 0;
      const highVol = highIndex < bins - 1 ? volumeBins[highIndex + 1] : 0;
      
      if (lowVol > highVol) {
        lowIndex--;
        accumulatedVolume += lowVol;
      } else {
        highIndex++;
        accumulatedVolume += highVol;
      }
    }
    
    const valueArea = {
      high: priceRange.min + (highIndex + 1) * binSize,
      low: priceRange.min + lowIndex * binSize
    };
    
    const profile = volumeBins.map((vol, idx) => ({
      price: priceRange.min + (idx + 0.5) * binSize,
      volume: vol
    }));
    
    return { poc, valueArea, profile };
  }

  /**
   * 4. Heikin-Ashi Candles
   * Smoothed candles that filter noise and show cleaner trends
   */
  static calculateHeikinAshi(ohlcv: OHLCV[]): OHLCV[] {
    if (ohlcv.length === 0) return [];
    
    const ha: OHLCV[] = [];
    let prevHAClose = ohlcv[0].close;
    let prevHAOpen = ohlcv[0].open;
    
    ohlcv.forEach((candle, i) => {
      const haClose = (candle.open + candle.high + candle.low + candle.close) / 4;
      const haOpen = i === 0 ? candle.open : (prevHAOpen + prevHAClose) / 2;
      const haHigh = Math.max(candle.high, haOpen, haClose);
      const haLow = Math.min(candle.low, haOpen, haClose);
      
      ha.push({
        timestamp: candle.timestamp,
        open: haOpen,
        high: haHigh,
        low: haLow,
        close: haClose,
        volume: candle.volume
      });
      
      prevHAClose = haClose;
      prevHAOpen = haOpen;
    });
    
    return ha;
  }

  /**
   * 5. SuperTrend Indicator
   * ATR-based trend filter - price above = bullish, below = bearish
   */
  static calculateSuperTrend(ohlcv: OHLCV[], period: number = 10, multiplier: number = 3): {
    trend: ('up' | 'down')[],
    supertrend: number[]
  } {
    if (ohlcv.length < period) return { trend: [], supertrend: [] };
    
    // Calculate ATR
    const atr = this.calculateATR(ohlcv, period);
    const trend: ('up' | 'down')[] = [];
    const supertrend: number[] = [];
    
    let currentTrend: 'up' | 'down' = 'up';
    let upperBand = 0;
    let lowerBand = 0;
    
    for (let i = 0; i < ohlcv.length; i++) {
      if (i < period) {
        trend.push('up');
        supertrend.push(0);
        continue;
      }
      
      const hl2 = (ohlcv[i].high + ohlcv[i].low) / 2;
      const basicUpperBand = hl2 + (multiplier * atr[i]);
      const basicLowerBand = hl2 - (multiplier * atr[i]);
      
      // Final bands
      upperBand = basicUpperBand < upperBand || ohlcv[i - 1].close > upperBand 
        ? basicUpperBand : upperBand;
      lowerBand = basicLowerBand > lowerBand || ohlcv[i - 1].close < lowerBand 
        ? basicLowerBand : lowerBand;
      
      // Determine trend
      if (currentTrend === 'up') {
        currentTrend = ohlcv[i].close <= lowerBand ? 'down' : 'up';
      } else {
        currentTrend = ohlcv[i].close >= upperBand ? 'up' : 'down';
      }
      
      trend.push(currentTrend);
      supertrend.push(currentTrend === 'up' ? lowerBand : upperBand);
    }
    
    return { trend, supertrend };
  }

  /**
   * 6. Bollinger Bands & Keltner Channel (for squeeze detection)
   */
  static calculateBollingerBands(data: number[], period: number = 20, stdDev: number = 2): {
    upper: number[],
    middle: number[],
    lower: number[],
    squeeze: boolean
  } {
    const sma = this.calculateSMA(data, period);
    const upper: number[] = [];
    const lower: number[] = [];
    
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        upper.push(0);
        lower.push(0);
      } else {
        const slice = data.slice(i - period + 1, i + 1);
        const std = Math.sqrt(
          slice.reduce((sum, val) => sum + Math.pow(val - sma[i - period + 1], 2), 0) / period
        );
        upper.push(sma[i - period + 1] + (stdDev * std));
        lower.push(sma[i - period + 1] - (stdDev * std));
      }
    }
    
    // Detect squeeze: BB width at historic lows
    const bandwidths = upper.slice(-20).map((u, i) => u - lower[lower.length - 20 + i]);
    const avgWidth = bandwidths.reduce((a, b) => a + b, 0) / bandwidths.length;
    const currentWidth = upper[upper.length - 1] - lower[lower.length - 1];
    const squeeze = currentWidth < avgWidth * 0.7; // Squeeze if 30% narrower than avg
    
    return { upper, middle: sma, lower, squeeze };
  }

  static calculateKeltnerChannel(ohlcv: OHLCV[], period: number = 20, atrMultiplier: number = 2): {
    upper: number[],
    middle: number[],
    lower: number[]
  } {
    const closes = ohlcv.map(c => c.close);
    const ema = this.calculateEMA(closes, period);
    const atr = this.calculateATR(ohlcv, period);
    
    const upper = ema.map((e, i) => e + (atrMultiplier * atr[i]));
    const lower = ema.map((e, i) => e - (atrMultiplier * atr[i]));
    
    return { upper, middle: ema, lower };
  }

  /**
   * 7. Volume-Weighted MACD
   * MACD weighted by volume for better accuracy on low-liquidity chains
   */
  static calculateVolumeWeightedMACD(ohlcv: OHLCV[], fastPeriod: number = 12, slowPeriod: number = 26, signalPeriod: number = 9): {
    macd: number[],
    signal: number[],
    histogram: number[]
  } {
    // Calculate VWAP instead of regular price
    const vwap: number[] = [];
    let cumulativeTPV = 0; // Typical Price * Volume
    let cumulativeVolume = 0;
    
    ohlcv.forEach(candle => {
      const typicalPrice = (candle.high + candle.low + candle.close) / 3;
      cumulativeTPV += typicalPrice * candle.volume;
      cumulativeVolume += candle.volume;
      vwap.push(cumulativeTPV / cumulativeVolume);
    });
    
    // Run MACD on VWAP instead of close
    return this.calculateMACD(vwap, fastPeriod, slowPeriod, signalPeriod);
  }

  /**
   * 8. Fibonacci Retracement & Extension Levels
   */
  static calculateFibonacci(swingHigh: number, swingLow: number): {
    retracement: { [key: string]: number },
    extension: { [key: string]: number }
  } {
    const diff = swingHigh - swingLow;
    
    return {
      retracement: {
        '0': swingHigh,
        '23.6': swingHigh - (diff * 0.236),
        '38.2': swingHigh - (diff * 0.382),
        '50': swingHigh - (diff * 0.5),
        '61.8': swingHigh - (diff * 0.618),
        '78.6': swingHigh - (diff * 0.786),
        '100': swingLow
      },
      extension: {
        '127.2': swingLow - (diff * 0.272),
        '161.8': swingLow - (diff * 0.618),
        '200': swingLow - diff,
        '261.8': swingLow - (diff * 1.618)
      }
    };
  }

  /**
   * Multi-Timeframe Alignment Score
   * Checks confluence across different EMA periods to simulate MTF analysis
   */
  static calculateMTFAlignment(data: number[]): {
    score: number,
    aligned: boolean,
    bias: 'bullish' | 'bearish' | 'neutral'
  } {
    const currentPrice = data[data.length - 1];
    
    // Simulate different timeframes with different EMA periods
    const ema9 = this.calculateEMA(data, 9);
    const ema21 = this.calculateEMA(data, 21);
    const ema50 = this.calculateEMA(data, 50);
    const ema200 = this.calculateEMA(data, 200);
    
    const emas = [
      ema9[ema9.length - 1],
      ema21[ema21.length - 1],
      ema50[ema50.length - 1],
      ema200[ema200.length - 1]
    ].filter(e => e > 0);
    
    // Check how many EMAs price is above
    const bullishCount = emas.filter(e => currentPrice > e).length;
    const score = (bullishCount / emas.length) * 100;
    
    // Check if EMAs are in order (strong trend)
    const aligned = emas.every((ema, i) => i === 0 || emas[i - 1] >= ema) || 
                    emas.every((ema, i) => i === 0 || emas[i - 1] <= ema);
    
    const bias = score > 60 ? 'bullish' : score < 40 ? 'bearish' : 'neutral';
    
    return { score, aligned, bias };
  }

  // Helper: Calculate ATR (Average True Range)
  static calculateATR(ohlcv: OHLCV[], period: number = 14): number[] {
    if (ohlcv.length < 2) return [];
    
    const tr: number[] = [ohlcv[0].high - ohlcv[0].low]; // First TR
    
    for (let i = 1; i < ohlcv.length; i++) {
      const high = ohlcv[i].high;
      const low = ohlcv[i].low;
      const prevClose = ohlcv[i - 1].close;
      
      const trueRange = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      tr.push(trueRange);
    }
    
    // Calculate ATR as SMA of TR
    const atr: number[] = new Array(ohlcv.length).fill(0);
    
    if (ohlcv.length >= period) {
      let sum = tr.slice(0, period).reduce((a, b) => a + b, 0);
      atr[period - 1] = sum / period;
      
      for (let i = period; i < ohlcv.length; i++) {
        atr[i] = ((atr[i - 1] * (period - 1)) + tr[i]) / period;
      }
    }
    
    return atr;
  }

  // Helper: Detect swing highs and lows for Fibonacci
  static detectSwingPoints(ohlcv: OHLCV[], lookback: number = 20): {
    swingHigh: number,
    swingLow: number
  } {
    const recentCandles = ohlcv.slice(-lookback);
    const swingHigh = Math.max(...recentCandles.map(c => c.high));
    const swingLow = Math.min(...recentCandles.map(c => c.low));
    
    return { swingHigh, swingLow };
  }
}
