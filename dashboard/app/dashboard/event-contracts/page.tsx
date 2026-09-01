'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MarketCard } from '@/components/MarketCard'
import { ProbabilityScorecard } from '@/components/ProbabilityScorecard'
import { TrackRecord } from '@/components/TrackRecord'
import { Skeleton } from '@/components/ui/skeleton'
import { eventContractsService, Market, Position, RunLog, TrackRecordStats } from '@/services/event-contracts'
import { Activity, Play, RefreshCw, Terminal, TrendingUp, BarChart3, AlertCircle, Wifi, WifiOff, Search, X } from 'lucide-react'
import { toast } from 'sonner'

export default function EventContractsPage() {
  const [markets, setMarkets] = useState<Market[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [logs, setLogs] = useState<RunLog[]>([])
  const [stats, setStats] = useState<TrackRecordStats | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedMarket, setSelectedMarket] = useState<string | null>(null)
  const [selectedMarketTitle, setSelectedMarketTitle] = useState<string>('')
  const [activeTab, setActiveTab] = useState('markets')

  const [logFilter, setLogFilter] = useState<string>('all')
  const [logSearch, setLogSearch] = useState('')
  const [sseConnected, setSseConnected] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const connectSSE = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    const eventSource = eventContractsService.createLogStream((log) => {
      setLogs((prev) => [...prev.slice(-500), log])
    })

    eventSource.onopen = () => setSseConnected(true)
    eventSource.onerror = () => {
      setSseConnected(false)
      reconnectTimeoutRef.current = setTimeout(connectSSE, 5000)
    }

    eventSourceRef.current = eventSource
  }, [])

  const fetchData = useCallback(async () => {
    try {
      setError(null)
      const [marketsData, positionsData, statusData] = await Promise.all([
        eventContractsService.getMarkets(),
        eventContractsService.getPositions(),
        eventContractsService.getStatus(),
      ])
      setMarkets(marketsData)
      setPositions(positionsData)
      setIsRunning(statusData.isRunning)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch data'
      setError(msg)
      toast.error('Failed to load markets', { description: msg })
    } finally {
      setIsLoading(false)
    }
  }, [])

  const fetchHistory = useCallback(async () => {
    try {
      const historyData = await eventContractsService.getHistory()
      setStats(historyData.stats)
    } catch {}
  }, [])

  const fetchLogs = useCallback(async () => {
    try {
      const existingLogs = await eventContractsService.getLogs()
      setLogs(existingLogs)
    } catch {}
  }, [])

  useEffect(() => {
    fetchData()
    fetchHistory()
    fetchLogs()
    connectSSE()

    return () => {
      eventSourceRef.current?.close()
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
    }
  }, [fetchData, fetchHistory, fetchLogs, connectSSE])

  const handleRunCycle = async () => {
    try {
      await eventContractsService.runCycle()
      setIsRunning(true)
      toast.success('Cycle started', { description: 'Trading cycle is now running' })

      const poll = setInterval(async () => {
        try {
          const s = await eventContractsService.getStatus()
          if (!s.isRunning) {
            setIsRunning(false)
            clearInterval(poll)
            toast.success('Cycle completed')
            fetchData()
            fetchHistory()
          }
        } catch {}
      }, 3000)

      setTimeout(() => clearInterval(poll), 300000)
    } catch (err) {
      setIsRunning(false)
      toast.error('Failed to start cycle')
    }
  }

  const handleRefresh = async () => {
    setIsLoading(true)
    await Promise.all([fetchData(), fetchHistory()])
  }

  const handleExplainMarket = (marketId: string) => {
    const market = markets.find(m => m.id === marketId)
    setSelectedMarketTitle(market?.title ?? '')
    setSelectedMarket(marketId)
  }

  const filteredLogs = logs.filter(log => {
    if (logFilter !== 'all' && log.level !== logFilter) return false
    if (logSearch && !log.message.toLowerCase().includes(logSearch.toLowerCase())) return false
    return true
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="flex gap-3">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-28" />
          </div>
        </div>
        <Skeleton className="h-10 w-96" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="card-surface">
              <CardContent className="p-6 space-y-4">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-2 w-full" />
                <Skeleton className="h-2 w-full" />
                <div className="grid grid-cols-3 gap-2">
                  <Skeleton className="h-10" />
                  <Skeleton className="h-10" />
                  <Skeleton className="h-10" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
              <p className="text-sm text-amber-700">{error}</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleRefresh} className="border-amber-300">
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Event Contracts</h2>
          <p className="text-sm text-slate-500 mt-1">
            Somnia DreamDEX AI Trading Agent
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRunning}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isRunning ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={handleRunCycle}
            disabled={isRunning}
            className="btn-sky"
          >
            <Play className="w-4 h-4 mr-2" />
            {isRunning ? 'Running...' : 'Run Cycle'}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="markets" className="flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Markets
            <Badge variant="secondary" className="ml-1">
              {markets.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="positions" className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Positions
            <Badge variant="secondary" className="ml-1">
              {positions.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="track-record" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Track Record
          </TabsTrigger>
          <TabsTrigger value="terminal" className="flex items-center gap-2">
            <Terminal className="w-4 h-4" />
            Terminal
          </TabsTrigger>
        </TabsList>

        <TabsContent value="markets" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {markets.map((market) => (
              <MarketCard
                key={market.id}
                market={market}
                onExplain={handleExplainMarket}
              />
            ))}
            {markets.length === 0 && (
              <Card className="col-span-full">
                <CardContent className="py-12 text-center">
                  <Activity className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 font-medium">No markets available</p>
                  <p className="text-sm text-slate-400 mt-1">Check back later or run a cycle to discover new markets</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={handleRefresh}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh Markets
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="positions" className="mt-6">
          {positions.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <TrendingUp className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">No open positions</p>
                <p className="text-sm text-slate-400 mt-1">Run a cycle to start trading on event contracts</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {positions.map((pos) => (
                <Card key={pos.id} className="card-surface">
                  <CardContent className="p-4">
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
                        <p className={`font-semibold ${pos.pnlUsd >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
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
        </TabsContent>

        <TabsContent value="track-record" className="mt-6">
          <TrackRecord
            stats={stats ?? { totalPnl: 0, won: 0, lost: 0, winRate: null, total: 0 }}
          />
        </TabsContent>

        <TabsContent value="terminal" className="mt-6">
          <Card className="card-surface">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-slate-700 flex items-center gap-2">
                  <Terminal className="w-4 h-4" />
                  Agent Logs
                  <Badge variant={sseConnected ? 'default' : 'destructive'} className="text-[10px] ml-1">
                    {sseConnected ? <Wifi className="w-3 h-3 mr-1" /> : <WifiOff className="w-3 h-3 mr-1" />}
                    {sseConnected ? 'Connected' : 'Disconnected'}
                  </Badge>
                </CardTitle>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search logs..."
                      value={logSearch}
                      onChange={e => setLogSearch(e.target.value)}
                      className="pl-8 pr-8 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                    />
                    {logSearch && (
                      <button onClick={() => setLogSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {['all', 'info', 'warn', 'error'].map(level => (
                      <button
                        key={level}
                        onClick={() => setLogFilter(level)}
                        className={`px-2 py-1 text-[10px] font-medium rounded-md transition-colors ${
                          logFilter === level
                            ? level === 'error' ? 'bg-red-100 text-red-700' : level === 'warn' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'
                            : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="bg-slate-900 rounded-xl p-4 h-96 overflow-y-auto font-mono text-sm">
                {filteredLogs.length === 0 ? (
                  <p className="text-slate-500">
                    {logs.length === 0 ? 'No logs yet. Run a cycle to see output.' : 'No logs match your filter.'}
                  </p>
                ) : (
                  filteredLogs.map((log, i) => (
                    <div key={i} className="flex items-start gap-2 mb-2">
                      <span className="text-slate-500 shrink-0">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      <Badge
                        variant={log.level === 'error' ? 'destructive' : log.level === 'warn' ? 'secondary' : 'default'}
                        className="shrink-0 text-[10px]"
                      >
                        {log.level}
                      </Badge>
                      {log.agent && (
                        <span className="text-sky-400 shrink-0">[{log.agent}]</span>
                      )}
                      <span className="text-slate-300">{log.message}</span>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ProbabilityScorecard
        isOpen={selectedMarket !== null}
        onClose={() => { setSelectedMarket(null); setSelectedMarketTitle('') }}
        marketId={selectedMarket ?? ''}
        marketTitle={selectedMarketTitle}
      />
    </div>
  )
}
