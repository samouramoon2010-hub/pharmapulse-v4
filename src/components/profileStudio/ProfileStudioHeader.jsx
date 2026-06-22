// ============================================================
// ProfileStudioHeader — Page header with refresh + create (Phase 2A)
// ============================================================
import React from 'react'
import { RefreshCw, Plus, BookOpen, FileSpreadsheet } from 'lucide-react'

export default function ProfileStudioHeader({ canCreate, isRefreshing, onRefresh, onCreate, onImport }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: '20px', paddingBottom: '16px',
      borderBottom: '1px solid var(--border-subtle)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: 32, height: 32, borderRadius: '8px',
          background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <BookOpen style={{ width: 16, height: 16, color: '#818cf8' }} strokeWidth={1.5} />
        </div>
        <div>
          <h1 style={{
            margin: 0, fontSize: '16px', fontWeight: 600,
            color: 'var(--text-primary)', fontFamily: "'Inter', sans-serif",
            letterSpacing: '-0.02em',
          }}>
            Profile Studio
          </h1>
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', marginTop: '1px' }}>
            Manage pharmacist profiles and simulations
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          aria-label="Refresh profiles"
          style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            fontSize: '11px', fontWeight: 500, color: 'var(--text-secondary)',
            background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
            borderRadius: '6px', padding: '5px 10px', cursor: 'pointer',
            opacity: isRefreshing ? 0.6 : 1, transition: 'opacity 0.15s',
          }}
        >
          <RefreshCw style={{ width: 12, height: 12 }} />
          {isRefreshing ? 'Refreshing…' : 'Refresh'}
        </button>

        {canCreate && (
          <button
            onClick={onImport}
            aria-label="Import profile from Excel or CSV"
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              fontSize: '11px', fontWeight: 500, color: 'var(--text-secondary)',
              background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
              borderRadius: '6px', padding: '5px 10px', cursor: 'pointer',
            }}
          >
            <FileSpreadsheet style={{ width: 12, height: 12 }} />
            Import
          </button>
        )}

        {canCreate && (
          <button
            onClick={onCreate}
            aria-label="Create new profile"
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              fontSize: '11px', fontWeight: 500, color: '#818cf8',
              background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
              borderRadius: '6px', padding: '5px 10px', cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            <Plus style={{ width: 12, height: 12 }} />
            New Profile
          </button>
        )}
      </div>
    </div>
  )
}
