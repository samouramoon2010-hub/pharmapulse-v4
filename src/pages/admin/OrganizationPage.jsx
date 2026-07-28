// ============================================================
// Organization — consolidated Branches / Regions / Districts /
// Classifications tabs (Sidebar-2 consolidation).
//
// Pure navigation/layout consolidation: each tab renders the existing,
// unmodified page component (PharmaciesPage/RegionsPage/DistrictsPage/
// BranchClassificationsPage) exactly as before — no business logic,
// permissions, or data behavior changed. Only the sidebar entry point
// and tab chrome are new.
// ============================================================
import React, { useState } from 'react'
import { Building2, Map, Layers, GitBranch } from 'lucide-react'
import PharmaciesPage from './PharmaciesPage.jsx'
import RegionsPage from './RegionsPage.tsx'
import DistrictsPage from './DistrictsPage.tsx'
import BranchClassificationsPage from './BranchClassificationsPage.tsx'

const TABS = [
  { key: 'branches',       label: 'Branches',       icon: Building2, Component: PharmaciesPage },
  { key: 'regions',        label: 'Regions',        icon: Map,       Component: RegionsPage },
  { key: 'districts',      label: 'Districts',      icon: Layers,    Component: DistrictsPage },
  { key: 'classifications', label: 'Classifications', icon: GitBranch, Component: BranchClassificationsPage },
]

export default function OrganizationPage() {
  const [activeTab, setActiveTab] = useState('branches')
  const Active = TABS.find((t) => t.key === activeTab)?.Component ?? PharmaciesPage

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div>
        <h1 style={{ fontSize: '15px', fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text-primary)', fontFamily: "'Inter',sans-serif" }}>
          Organization
        </h1>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
          Branches, regions, districts, and branch classifications in one place.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--border-default)' }}>
        {TABS.map(({ key, label, icon: Icon }) => {
          const active = activeTab === key
          return (
            <button key={key} onClick={() => setActiveTab(key)} style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '8px 14px', fontSize: '13px', fontWeight: active ? 600 : 400,
              cursor: 'pointer', border: 'none', background: 'none',
              color: active ? 'var(--accent)' : 'var(--text-muted)',
              borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: '-1px', transition: 'all 0.15s',
            }}>
              <Icon size={13} /> {label}
            </button>
          )
        })}
      </div>

      <Active />
    </div>
  )
}
