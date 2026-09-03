'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { eventContractsService, Position, RunLog, WalletBalance } from '@/services/event-contracts'
import { Wallet, Activity, TrendingUp, TrendingDown, Play, Clock, Zap, AlertCircle, CheckCircle } from 'lucide-react'
import Link from 'next/link'

interface CycleRun {
  id: string
  started_at: string
  completed_at: string | null
  status: string
  markets_scanned: number
  edges_found: number
  orders_placed: number
}

export function DashboardOverview() {
  const [balance, setBalance] = useState<WalletBalance | null>(null)
  const [positions, setPositions] = useState<Position[]>([])
  const [status, setStatus] = useState<{ isRunning: boolean; lastRunAt: string | null; cycleCount: number } | null>(null)
  const [recentLogs, setRecentLogs] = useState<RunLog[]>([])
  const [runs, setRuns] = useState<CycleRun[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const [bal, pos, stat, logs, runData] = await Promise.allSettled([
          eventContractsService.getWalletBalance(),
          eventContractsService.getPositions(),
          eventContractsService.getStatus(),
          eventContractsService.getLogs(),
          eventContractsService.getRuns(),
        ])
        if (bal.status === 'fulfilled') setBalance(bal.value)
        if (pos.status === 'fulfilled') setPositions(pos.value)
        if (stat.status === 'fulfilled') setStatus(stat.value)
        if (logs.status === 'fulfilled') setRecentLogs(logs.value.slice(-5).reverse())
        if (runData.status === 'fulfilled') setRuns(runData.value.slice(0, 10))
      } catch {
        setError('Could not connect to backend')
      }
    }
    load()
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [])

  const handleRunCycle = async () => {
    try {
      await eventContractsService.runCycle()
      setStatus(prev => prev ? { ...prev, isRunning: true } : prev)
    } catch {}
  }

  return (
    <div className="space-y-6">
      {error && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
            <p className="text-sm text-amber-700">{error}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}>
          <Card className="card-surface">
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center">
                  <Wallet className="w-5 h-5 text-sky-600" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Wallet Balance</p>
                  <p className="text-lg font-bold text-slate-900">
                    {balance ? `${Number(balance.balance).toFixed(4)} STT` : '—'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card className="card-surface">
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", status?.isRunning ? "bg-emerald-50" : "bg-slate-100")}>
                  <Activity className={cn("w-5 h-5", status?.isRunning ? "text-emerald-600" : "text-slate-400")} />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Orchestrator</p>
                  <div className="flex items-center gap-2">
                    <p className="text-lg font-bold text-slate-900">
                      {status?.isRunning ? 'Running' : 'Idle'}
                    </p>
                    {status?.isRunning && (
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="card-surface">
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Open Positions</p>
                  <p className="text-lg font-bold text-slate-900">{positions.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card className="card-surface">
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-violet-600" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Cycles Run</p>
                  <p className="text-lg font-bold text-slate-900">{status?.cycleCount ?? 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Card className="card-surface">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-900">Quick Actions</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Button
                  onClick={handleRunCycle}
                  disabled={status?.isRunning}
                  className="btn-sky h-auto py-4 flex-col gap-1"
                >
                  <Play className="w-5 h-5" />
                  <span className="text-sm font-semibold">
                    {status?.isRunning ? 'Running...' : 'Run Cycle'}
                  </span>
                </Button>
                <Link href="/dashboard/event-contracts">
                  <Button variant="outline" className="w-full h-auto py-4 flex-col gap-1 border-slate-200">
                    <Activity className="w-5 h-5" />
                    <span className="text-sm font-semibold">View Markets</span>
                  </Button>
                </Link>
                <Link href="/dashboard/track-record">
                  <Button variant="outline" className="w-full h-auto py-4 flex-col gap-1 border-slate-200">
                    <TrendingUp className="w-5 h-5" />
                    <span className="text-sm font-semibold">Track Record</span>
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="card-surface">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">Last Run</h3>
              {status?.lastRunAt && (
                <Badge variant="secondary" className="text-[10px]">
                  <Clock className="w-3 h-3 mr-1" />
                  {timeAgo(status.lastRunAt)}
                </Badge>
              )}
            </div>
            {status?.lastRunAt ? (
              <p className="text-sm text-slate-500">
                Last cycle completed {timeAgo(status.lastRunAt)}
              </p>
            ) : (
              <p className="text-sm text-slate-500">No cycles run yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {recentLogs.length > 0 && (
        <Card className="card-surface">
          <CardContent className="p-6">
            <h3 className="font-semibold text-slate-900 mb-4">Recent Activity</h3>
            <div className="space-y-2">
              {recentLogs.map((log, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50/80">
                  <Badge
                    variant={log.level === 'error' ? 'destructive' : log.level === 'warn' ? 'secondary' : 'default'}
                    className="shrink-0 text-[10px] mt-0.5"
                  >
                    {log.level}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700 truncate">{log.message}</p>
                    {log.agent && (
                      <p className="text-xs text-sky-600 mt-0.5">{log.agent}</p>
                    )}
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {runs.length > 0 && (
        <Card className="card-surface">
          <CardContent className="p-6">
            <h3 className="font-semibold text-slate-900 mb-4">Cycle History</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2 px-3 text-xs font-medium text-slate-500">Time</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-slate-500">Markets</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-slate-500">Edges</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-slate-500">Orders</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-slate-500">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id} className="border-b border-slate-50 last:border-0">
                      <td className="py-2.5 px-3 text-slate-600">{timeAgo(run.started_at)}</td>
                      <td className="py-2.5 px-3 text-slate-700 font-medium">{run.markets_scanned}</td>
                      <td className="py-2.5 px-3 text-slate-700">{run.edges_found}</td>
                      <td className="py-2.5 px-3 text-slate-700">{run.orders_placed}</td>
                      <td className="py-2.5 px-3">
                        {run.status === 'completed' ? (
                          <Badge className="bg-emerald-50 text-emerald-700 text-[10px]">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            OK
                          </Badge>
                        ) : run.status === 'running' ? (
                          <Badge className="bg-sky-50 text-sky-700 text-[10px] animate-pulse">
                            <Activity className="w-3 h-3 mr-1" />
                            Running
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px]">
                            <AlertCircle className="w-3 h-3 mr-1" />
                            Failed
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = now - then
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}
