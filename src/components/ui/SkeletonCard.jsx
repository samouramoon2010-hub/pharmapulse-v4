// Skeleton loader cards
import React from 'react'

export function SkeletonStatCard() {
  return (
    <div className="card card-p space-y-3">
      <div className="flex items-center justify-between">
        <div className="skeleton w-10 h-10 rounded-xl" />
        <div className="skeleton w-16 h-5 rounded-full" />
      </div>
      <div className="skeleton w-24 h-7 rounded-lg" />
      <div className="skeleton w-32 h-4 rounded" />
    </div>
  )
}

export function SkeletonTable({ rows = 5 }) {
  return (
    <div className="card overflow-hidden">
      <div className="p-4 border-b border-slate-800 skeleton h-10 rounded-none" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5 border-b border-slate-800/50">
          <div className="skeleton w-8 h-8 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-4 w-40 rounded" />
            <div className="skeleton h-3 w-24 rounded" />
          </div>
          <div className="skeleton h-6 w-16 rounded-full" />
          <div className="skeleton h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonChart() {
  return (
    <div className="card card-p space-y-4">
      <div className="flex items-center justify-between">
        <div className="skeleton w-32 h-5 rounded" />
        <div className="skeleton w-20 h-7 rounded-lg" />
      </div>
      <div className="flex items-end gap-2 h-48">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="flex-1 skeleton rounded-t"
               style={{ height: `${30 + Math.random() * 70}%` }} />
        ))}
      </div>
    </div>
  )
}
