'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Trophy, TrendingUp, TrendingDown, Minus, Target, BarChart3 } from 'lucide-react'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'

interface TrackRecordProps {
  stats: {
    totalPnl: number
    won: number
    lost: number
    winRate: number | null
    total: number
  }
  recentPositions?: Array<{
    id: string
    marketId: string
    side: 'yes' | 'no'
    entryPrice: number
    pnlUsd: number
    status: string
    settledAt?: string
    txHash?: string
    explorerUrl?: string
  }>
}

export function TrackRecord({ stats, recentPositions = [] }: TrackRecordProps) {
  const winRate = stats.winRate ?? 0
  const winRatePercent = (winRate * 100).toFixed(1)

  const settledPositions = recentPositions
    .filter(p => p.settledAt && p.status !== 'open')
    .sort((a, b) => new Date(a.settledAt!).getTime() - new Date(b.settledAt!).getTime())

  let cumulativePnl = 0
  const chartData = settledPositions.map(pos => {
    cumulativePnl += pos.pnlUsd ?? 0
    return {
      time: new Date(pos.settledAt!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      pnl: cumulativePnl,
    }
  })

  const showChart = chartData.length >= 2

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="card-surface">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center",
                stats.totalPnl >= 0 ? "bg-emerald-50" : "bg-red-50"
              )}>
                {stats.totalPnl >= 0 ? (
                  <TrendingUp className="w-5 h-5 text-emerald-600" />
                ) : (
                  <TrendingDown className="w-5 h-5 text-red-600" />
                )}
              </div>
              <div>
                <p className="text-xs text-slate-500">Total P&L</p>
                <p className={cn(
                  "text-lg font-bold",
                  stats.totalPnl >= 0 ? "text-emerald-600" : "text-red-600"
                )}>
                  {stats.totalPnl >= 0 ? '+' : ''}{stats.totalPnl.toFixed(4)} STT
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="card-surface">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-sky-50">
                <Target className="w-5 h-5 text-sky-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Win Rate</p>
                <p className="text-lg font-bold text-slate-900">
                  {winRatePercent}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="card-surface">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-50">
                <Trophy className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Won</p>
                <p className="text-lg font-bold text-emerald-600">{stats.won}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="card-surface">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-red-50">
                <Minus className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Lost</p>
                <p className="text-lg font-bold text-red-600">{stats.lost}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {showChart && (
        <Card className="card-surface">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-700 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Cumulative P&L
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={cumulativePnl >= 0 ? "#10b981" : "#ef4444"} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={cumulativePnl >= 0 ? "#10b981" : "#ef4444"} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" tickFormatter={v => `${v.toFixed(2)}`} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    formatter={(value: number) => [`${value >= 0 ? '+' : ''}${value.toFixed(4)} STT`, 'P&L']}
                  />
                  <Area
                    type="monotone"
                    dataKey="pnl"
                    stroke={cumulativePnl >= 0 ? "#10b981" : "#ef4444"}
                    strokeWidth={2}
                    fill="url(#pnlGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {recentPositions.length > 0 && (
        <Card className="card-surface">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-700">Recent Positions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentPositions.map((pos) => (
                <div
                  key={pos.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-50/80"
                >
                  <div className="flex items-center gap-3">
                    <Badge
                      variant={pos.side === 'yes' ? 'default' : 'secondary'}
                      className={cn(
                        "w-12 justify-center",
                        pos.side === 'yes' ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                      )}
                    >
                      {pos.side.toUpperCase()}
                    </Badge>
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {pos.marketId.slice(0, 8)}...
                      </p>
                      <p className="text-xs text-slate-500">
                        Entry: {((pos.entryPrice ?? 0.5) * 100).toFixed(0)}¢
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge
                      variant={pos.status === 'won' ? 'default' : pos.status === 'lost' ? 'destructive' : 'secondary'}
                      className={cn(
                        pos.status === 'won' && "bg-emerald-100 text-emerald-700",
                        pos.status === 'lost' && "bg-red-100 text-red-700"
                      )}
                    >
                      {pos.status}
                    </Badge>
                    {pos.pnlUsd !== null && (
                      <p className={cn(
                        "text-sm font-semibold mt-1",
                        pos.pnlUsd >= 0 ? "text-emerald-600" : "text-red-600"
                      )}>
                        {(pos.pnlUsd ?? 0) >= 0 ? '+' : ''}{(pos.pnlUsd ?? 0).toFixed(4)} STT
                      </p>
                    )}
                    {pos.explorerUrl && (
                      <a
                        href={pos.explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-violet-500 hover:text-violet-600 mt-0.5 inline-block"
                      >
                        View Tx ↗
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
