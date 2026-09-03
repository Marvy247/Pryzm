import { api } from '@/lib/api'

export interface Market {
  id: string
  marketId: string
  title: string
  description: string
  category: string
  endDate: string
  status: string
  yesPrice: number
  noPrice: number
  volume: number
  liquidity: number
  impliedUpProbability?: number
  impliedDownProbability?: number
  bestBid?: number
  bestAsk?: number
  intervalLabel?: string
  timeLeft?: string
}

export interface Position {
  id: string
  marketId: string
  side: 'yes' | 'no'
  entryPrice: number
  currentPrice: number
  size: number
  pnlUsd: number
  status: string
  createdAt: string
  settledAt?: string
  label?: string
  reasoning?: any
  txHash?: string
  explorerUrl?: string
}

export interface RunLog {
  id: string
  timestamp: string
  level: string
  message: string
  agent?: string
  data?: any
}

export interface TrackRecordStats {
  totalPnl: number
  won: number
  lost: number
  winRate: number | null
  total: number
}

export interface WalletBalance {
  address: string
  balance: string
  chainId: number
}

export const eventContractsService = {
  async getMarkets(): Promise<Market[]> {
    const { data } = await api.get('/api/ec/markets')
    return (data.markets ?? []).map((m: any) => {
      const assetName = m.asset === 'BTC' ? 'Bitcoin' : m.asset === 'ETH' ? 'Ethereum' : m.asset ?? 'Crypto'
      const intervalLabel = m.intervalSec <= 60 ? '1-Minute' : m.intervalSec <= 300 ? '5-Minute' : m.intervalSec <= 900 ? '15-Minute' : m.intervalSec <= 3600 ? '1-Hour' : '4-Hour'
      const timeLeft = m.secondsLeft > 0 ? ` · ${Math.floor(m.secondsLeft / 60)}m left` : ' · Expired'
      return {
        id: m.marketId,
        marketId: m.marketId,
        title: `${assetName} ${intervalLabel} Price`,
        description: `Will ${assetName} price be UP or DOWN in the next ${intervalLabel.toLowerCase()}?`,
        category: m.asset ?? 'BTC',
        endDate: m.expiry ? new Date(m.expiry * 1000).toISOString() : new Date().toISOString(),
        status: (m.secondsLeft ?? 0) > 0 ? 'active' : 'expired',
        yesPrice: m.impliedUpProbability ?? 0.5,
        noPrice: m.impliedDownProbability ?? 0.5,
        volume: 0,
        liquidity: 0,
        impliedUpProbability: m.impliedUpProbability ?? 0.5,
        impliedDownProbability: m.impliedDownProbability ?? 0.5,
        bestBid: m.bestBid,
        bestAsk: m.bestAsk,
        intervalLabel: m.label,
        timeLeft,
      }
    })
  },

  async runCycle(): Promise<{ message: string; startedAt: string }> {
    const { data } = await api.post('/api/ec/run')
    return data
  },

  async getStatus(): Promise<{ isRunning: boolean; lastRunAt: string | null; cycleCount: number }> {
    const { data } = await api.get('/api/ec/status')
    return data
  },

  async getLogs(): Promise<RunLog[]> {
    const { data } = await api.get('/api/ec/logs')
    return data.logs
  },

  async getPositions(): Promise<Position[]> {
    const { data } = await api.get('/api/ec/positions')
    return data.positions
  },

  async getHistory(limit = 50): Promise<{ positions: Position[]; stats: TrackRecordStats }> {
    const { data } = await api.get(`/api/ec/history?limit=${limit}`)
    return data
  },

  async getTrackRecord(): Promise<{ markets: any[] }> {
    const { data } = await api.get('/api/ec/track-record')
    return data
  },

  async getWalletBalance(): Promise<WalletBalance> {
    const { data } = await api.get('/api/ec/wallet-balance')
    return data.balance
  },

  async getRuns(): Promise<any[]> {
    const { data } = await api.get('/api/ec/runs')
    return data.runs
  },

  createLogStream(onMessage: (log: RunLog) => void): EventSource {
    const eventSource = new EventSource(`${api.defaults.baseURL}/api/ec/logs/stream`)
    eventSource.onmessage = (event) => {
      try {
        const log = JSON.parse(event.data)
        onMessage(log)
      } catch {}
    }
    return eventSource
  },
}
