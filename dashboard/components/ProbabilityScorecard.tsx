'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Brain, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react'
import { eventContractsService } from '@/services/event-contracts'

interface Analysis {
  agentProbability: number
  currentPrice: number
  edge: number
  confidence: string
  signals: string[]
  riskFactors: string[]
  recommendation: string
}

interface ProbabilityScorecardProps {
  isOpen: boolean
  onClose: () => void
  marketId: string
  marketTitle?: string
}

export function ProbabilityScorecard({
  isOpen,
  onClose,
  marketId,
  marketTitle,
}: ProbabilityScorecardProps) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchAnalysis = async () => {
    if (!marketId) return
    setLoading(true)
    setError(null)
    try {
      const markets = await eventContractsService.getMarkets()
      const market = markets.find(m => m.id === marketId || m.marketId === marketId)
      if (!market) {
        setError('Market not found')
        return
      }

      const yesProb = market.impliedUpProbability ?? market.yesPrice
      const currentPrice = market.yesPrice
      const edge = yesProb - currentPrice

      const signals: string[] = []
      const riskFactors: string[] = []

      if (market.impliedUpProbability != null) {
        signals.push(`Order book implied probability: ${(yesProb * 100).toFixed(1)}%`)
      }
      if (market.volume > 1000) {
        signals.push(`Healthy volume: $${(market.volume / 1000).toFixed(1)}K`)
      } else {
        riskFactors.push('Low volume market')
      }
      if (market.liquidity > 500) {
        signals.push(`Good liquidity: $${(market.liquidity / 1000).toFixed(1)}K`)
      } else {
        riskFactors.push('Thin liquidity — slippage risk')
      }
      if (market.bestBid != null && market.bestAsk != null) {
        const spread = market.bestAsk - market.bestBid
        if (spread < 0.05) {
          signals.push(`Tight spread: ${(spread * 100).toFixed(1)}¢`)
        } else {
          riskFactors.push(`Wide spread: ${(spread * 100).toFixed(1)}¢`)
        }
      }

      const absEdge = Math.abs(edge)
      const confidence = absEdge > 0.1 ? 'high' : absEdge > 0.05 ? 'medium' : 'low'
      const recommendation = edge > 0.05 ? 'BUY' : edge < -0.05 ? 'SELL' : 'HOLD'

      if (absEdge < 0.02) {
        riskFactors.push('Edge within noise range — no clear signal')
      }
      if (riskFactors.length === 0) {
        riskFactors.push('No significant risk factors detected')
      }
      if (signals.length === 0) {
        signals.push('Insufficient data for signal generation')
      }

      setAnalysis({
        agentProbability: yesProb,
        currentPrice,
        edge,
        confidence,
        signals,
        riskFactors,
        recommendation,
      })
    } catch {
      setError('Failed to load analysis')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen && marketId) {
      fetchAnalysis()
    } else {
      setAnalysis(null)
      setError(null)
    }
  }, [isOpen, marketId])

  if (!isOpen) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-sky-500" />
            {loading ? 'Analyzing...' : 'Probability Analysis'}
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <div className="w-10 h-10 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
            <p className="text-sm text-slate-500">Running agent analysis...</p>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <AlertTriangle className="w-10 h-10 text-amber-400" />
            <p className="text-sm text-slate-500">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchAnalysis}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </div>
        )}

        {analysis && !loading && (
          <div className="space-y-6">
            {marketTitle && (
              <p className="text-sm text-slate-600 line-clamp-2">{marketTitle}</p>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-xs text-slate-500 uppercase tracking-wide">Agent Probability</p>
                <span className="text-3xl font-bold text-slate-900">
                  {((analysis.agentProbability ?? 0.5) * 100).toFixed(1)}%
                </span>
                <Progress value={(analysis.agentProbability ?? 0.5) * 100} className="h-2" />
              </div>

              <div className="space-y-2">
                <p className="text-xs text-slate-500 uppercase tracking-wide">Current Price</p>
                <span className="text-3xl font-bold text-slate-900">
                  {((analysis.currentPrice ?? 0.5) * 100).toFixed(1)}%
                </span>
                <Progress value={(analysis.currentPrice ?? 0.5) * 100} className="h-2" />
              </div>
            </div>

            <div className={cn("p-4 rounded-xl", analysis.edge > 0 ? 'bg-emerald-50' : analysis.edge < 0 ? 'bg-red-50' : 'bg-slate-50')}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">Edge</span>
                <span className={cn("text-2xl font-bold", analysis.edge > 0 ? 'text-emerald-600' : analysis.edge < 0 ? 'text-red-600' : 'text-slate-600')}>
                  {analysis.edge > 0 ? '+' : ''}{(analysis.edge * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant={analysis.confidence === 'high' ? 'default' : 'secondary'}>
                  {analysis.confidence} confidence
                </Badge>
                <Badge variant={analysis.recommendation === 'BUY' ? 'default' : analysis.recommendation === 'SELL' ? 'destructive' : 'secondary'}>
                  {analysis.recommendation}
                </Badge>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-700">Signals</p>
              <div className="space-y-2">
                {analysis.signals.map((signal, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                    <span className="text-slate-600">{signal}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-700">Risk Factors</p>
              <div className="space-y-2">
                {analysis.riskFactors.map((risk, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                    <span className="text-slate-600">{risk}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
