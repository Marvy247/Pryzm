'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { eventContractsService, Position } from '@/services/event-contracts'
import { TrendingUp, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

export default function PositionsPage() {
  const [positions, setPositions] = useState<Position[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const data = await eventContractsService.getPositions()
        setPositions(data)
      } catch (err) {
        setError('Failed to load positions')
        toast.error('Failed to load positions')
      } finally {
        setIsLoading(false)
      }
    }
    load()
    const interval = setInterval(load, 15000)
    return () => clearInterval(interval)
  }, [])

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Open Positions</h2>
        <p className="text-sm text-slate-500 mt-1">Active trades across all event contracts</p>
      </div>

      {error && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
            <p className="text-sm text-amber-700">{error}</p>
          </CardContent>
        </Card>
      )}

      {positions.length === 0 ? (
        <Card className="card-surface">
          <CardContent className="py-12 text-center">
            <TrendingUp className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No open positions</p>
            <p className="text-sm text-slate-400 mt-1">Run a cycle to start trading</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {positions.map((pos) => (
            <Card key={pos.id} className="card-surface">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Badge
                      variant={pos.side === 'yes' ? 'default' : 'secondary'}
                      className={pos.side === 'yes' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}
                    >
                      {pos.side.toUpperCase()}
                    </Badge>
                    <div>
                      <p className="font-medium text-slate-900">{pos.marketId}</p>
                      <p className="text-sm text-slate-500">
                        Entry: {(pos.entryPrice * 100).toFixed(0)}¢ | Current: {(pos.currentPrice * 100).toFixed(0)}¢
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold text-lg ${pos.pnlUsd >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {pos.pnlUsd >= 0 ? '+' : ''}{pos.pnlUsd.toFixed(4)} STT
                    </p>
                    <p className="text-xs text-slate-500">{pos.size} STT size</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
