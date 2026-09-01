'use client'

import { useState, useEffect } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { TrackRecord } from '@/components/TrackRecord'
import { eventContractsService, Position, TrackRecordStats } from '@/services/event-contracts'
import { toast } from 'sonner'

export default function TrackRecordPage() {
  const [stats, setStats] = useState<TrackRecordStats | null>(null)
  const [positions, setPositions] = useState<Position[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [historyData] = await Promise.all([
          eventContractsService.getHistory(),
        ])
        setStats(historyData.stats)
        setPositions(historyData.positions)
      } catch {
        toast.error('Failed to load track record')
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Track Record</h2>
        <p className="text-sm text-slate-500 mt-1">Historical performance and settled positions</p>
      </div>

      <TrackRecord
        stats={stats ?? { totalPnl: 0, won: 0, lost: 0, winRate: null, total: 0 }}
        recentPositions={positions}
      />
    </div>
  )
}
