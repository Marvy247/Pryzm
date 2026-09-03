'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { TrendingUp, TrendingDown, Clock, BarChart3 } from 'lucide-react'

interface MarketCardProps {
  market: {
    id: string
    title: string
    category: string
    endDate: string
    yesPrice: number
    noPrice: number
    volume: number
    liquidity: number
    impliedUpProbability?: number
    impliedDownProbability?: number
    bestBid?: number
    bestAsk?: number
  }
  onExplain?: (marketId: string) => void
}

function YesBar({ value }: { value: number }) {
  return (
    <div className="relative h-2 bg-slate-100 rounded-full overflow-hidden">
      <div
        className="absolute inset-y-0 left-0 bg-emerald-500 rounded-full transition-all duration-500"
        style={{ width: `${value}%` }}
      />
    </div>
  )
}

function NoBar({ value }: { value: number }) {
  return (
    <div className="relative h-2 bg-slate-100 rounded-full overflow-hidden">
      <div
        className="absolute inset-y-0 left-0 bg-red-400 rounded-full transition-all duration-500"
        style={{ width: `${value}%` }}
      />
    </div>
  )
}

export function MarketCard({ market, onExplain }: MarketCardProps) {
  const yesProb = market.impliedUpProbability ?? market.yesPrice ?? 0.5
  const noProb = market.impliedDownProbability ?? market.noPrice ?? 0.5
  const timeLeft = getTimeLeft(market.endDate)
  const isUrgent = timeLeft.includes('h') && !timeLeft.includes('d')

  return (
    <Card className="card-surface hover:shadow-lg hover:shadow-sky-500/5 transition-all duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base font-semibold text-slate-900 line-clamp-2">
              {market.title}
            </CardTitle>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="secondary" className="badge-sky">
                {market.category}
              </Badge>
              {isUrgent && (
                <Badge variant="destructive" className="text-[10px]">
                  <Clock className="w-3 h-3 mr-1" />
                  Urgent
                </Badge>
              )}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              YES
            </span>
            <span className="font-semibold text-slate-900">
              {(yesProb * 100).toFixed(1)}%
            </span>
          </div>
          <YesBar value={yesProb * 100} />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600 flex items-center gap-1.5">
              <TrendingDown className="w-4 h-4 text-red-500" />
              NO
            </span>
            <span className="font-semibold text-slate-900">
              {(noProb * 100).toFixed(1)}%
            </span>
          </div>
          <NoBar value={noProb * 100} />
        </div>

        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100">
          <div className="text-center">
            <p className="text-xs text-slate-500">Volume</p>
            <p className="text-sm font-semibold text-slate-900">
              ${formatNumber(market.volume)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-slate-500">Liquidity</p>
            <p className="text-sm font-semibold text-slate-900">
              ${formatNumber(market.liquidity)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-slate-500">Ends</p>
            <p className="text-sm font-semibold text-slate-900">
              {timeLeft}
            </p>
          </div>
        </div>

        {market.bestBid != null && market.bestAsk != null && (
          <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
            <span>Bid: ${(market.bestBid * 100).toFixed(0)}¢</span>
            <span>Ask: ${(market.bestAsk * 100).toFixed(0)}¢</span>
            <span className="text-slate-400">Spread: {((market.bestAsk - market.bestBid) * 100).toFixed(1)}¢</span>
          </div>
        )}

        {onExplain && (
          <Button
            variant="outline"
            size="sm"
            className="w-full mt-2 border-slate-200 hover:bg-slate-50"
            onClick={() => onExplain(market.id)}
          >
            <BarChart3 className="w-4 h-4 mr-2" />
            Explain This Trade
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function getTimeLeft(endDate: string): string {
  const now = new Date()
  const end = new Date(endDate)
  const diff = end.getTime() - now.getTime()
  if (diff <= 0) return 'Ended'
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function formatNumber(num: number | undefined | null): string {
  const n = num ?? 0
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return n.toFixed(0)
}
