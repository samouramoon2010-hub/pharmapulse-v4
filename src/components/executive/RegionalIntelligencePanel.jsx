// ============================================================
// RegionalIntelligencePanel
// Renders pre-computed RegionalIntelligenceOutput.
// No analytics logic — all data flows from the hook.
// ============================================================
import React, { useState } from 'react'
import {
  Globe, ChevronDown, ChevronUp,
  TrendingUp, TrendingDown, AlertTriangle,
  Activity, Zap, ShieldAlert, RotateCcw,
} from 'lucide-react'

// ── Risk level colours (matches executive layer palette) ───────

const RISK_CFG = {
  HIGH_RISK:   { label: 'High Risk',    color: '#ef4444', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.2)'   },
  MEDIUM_RISK: { label: 'Medium Risk',  color: '#f59e0b', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.2)'  },
  LOW_RISK:    { label: 'Low Risk',     color: '#00d2ad', bg: 'rgba(0,210,173,0.08)',   border: 'rgba(0,210,173,0.2)'   },
  ON_TRACK:    { label: 'On Track',     color: '#22c55e', bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.2)'   },
}

const URGENCY_CFG = {
  CRITICAL: { color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)', label: 'Critical' },
  HIGH:     { color: '#f97316', bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.2)', label: 'High'    },
  MEDIUM:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)', label: 'Medium'  },
}

const DQ_CFG = {
  ERROR:   { color: '#ef4444' },
  WARNING: { color: '#f59e0b' },
  INFO:    { color: '#a1a1aa' },
}

// ── Small helpers ──────────────────────────────────────────────

function RegionChip({ name, color, bg, border }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '2px 8px', borderRadius: '99px', fontSize: '11px',
      fontWeight: 500, color, background: bg,
      border: `1px solid ${border}`,
      whiteSpace: 'nowrap',
    }}>
      {name}
    </span>
  )
}

function RegionList({ names, color, bg, border, emptyText }) {
  if (!names.length) {
    return <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{emptyText}</span>
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
      {names.map((n) => (
        <RegionChip key={n} name={n} color={color} bg={bg} border={border} />
      ))}
    </div>
  )
}

function SectionRow({ icon: Icon, iconColor, label, children, noBorder }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '140px 1fr',
      gap: '8px', alignItems: 'start',
      padding: '6px 0',
      borderBottom: noBorder ? 'none' : '1px solid var(--border-subtle)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Icon style={{ width: 12, height: 12, color: iconColor ?? 'var(--text-muted)', flexShrink: 0 }} strokeWidth={1.75} />
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
      </div>
      <div>{children}</div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────

export default function RegionalIntelligencePanel({ intelligence }) {
  const [open, setOpen] = useState(false)

  if (!intelligence) return null

  const p      = intelligence.portfolioRegionalSummary
  const focus  = intelligence.recommendedExecutiveFocusAreas
  const dqWarn = intelligence.dataQualityWarnings

  const hasWarnings = dqWarn.length > 0
  const hasFocus    = focus.length > 0

  return (
    <div className="card" style={{ background: 'var(--bg-surface)', overflow: 'hidden' }}>

      {/* ── Collapsible header ─────────────────────────────── */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 20px',
          background: 'transparent', border: 'none', cursor: 'pointer',
          borderBottom: open ? '1px solid var(--border-subtle)' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Globe style={{ width: 15, height: 15, color: 'var(--text-muted)' }} strokeWidth={1.75} />
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Regional Intelligence
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>
              {p.totalRegions} region{p.totalRegions !== 1 ? 's' : ''} · {p.totalBranches} branches
              {hasFocus  && ` · ${focus.length} focus area${focus.length > 1 ? 's' : ''}`}
              {hasWarnings && ` · ${dqWarn.length} data warning${dqWarn.length > 1 ? 's' : ''}`}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Alert badges visible even when collapsed */}
          {p.highestRiskRegions.length > 0 && (
            <span style={{
              fontSize: '10px', fontWeight: 600, padding: '2px 6px',
              borderRadius: '99px', background: 'rgba(239,68,68,0.1)',
              color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)',
            }}>
              {p.highestRiskRegions.length} at risk
            </span>
          )}
          {open
            ? <ChevronUp style={{ width: 14, height: 14, color: 'var(--text-muted)' }} />
            : <ChevronDown style={{ width: 14, height: 14, color: 'var(--text-muted)' }} />
          }
        </div>
      </button>

      {/* ── Expanded content ───────────────────────────────── */}
      {open && (
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Portfolio overview grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
            {[
              { label: 'Regions',   value: p.totalRegions },
              { label: 'Branches',  value: p.totalBranches },
              { label: 'Active',    value: p.activeBranches },
              { label: 'Avg Score', value: p.averageRegionalScore },
            ].map(({ label, value }) => (
              <div key={label} style={{
                padding: '10px 12px', borderRadius: '8px',
                background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                  {value}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Region classification rows */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <SectionRow icon={AlertTriangle} iconColor="#ef4444" label="Highest Risk">
              <RegionList
                names={p.highestRiskRegions}
                color="#ef4444" bg="rgba(239,68,68,0.08)" border="rgba(239,68,68,0.2)"
                emptyText="None"
              />
            </SectionRow>
            <SectionRow icon={TrendingUp} iconColor="#22c55e" label="Strongest">
              <RegionList
                names={p.strongestRegions}
                color="#22c55e" bg="rgba(34,197,94,0.08)" border="rgba(34,197,94,0.2)"
                emptyText="—"
              />
            </SectionRow>
            <SectionRow icon={TrendingDown} iconColor="#f59e0b" label="Weakest">
              <RegionList
                names={p.weakestRegions}
                color="#f59e0b" bg="rgba(245,158,11,0.08)" border="rgba(245,158,11,0.2)"
                emptyText="—"
              />
            </SectionRow>
            <SectionRow icon={Activity} iconColor="#a78bfa" label="Volatile">
              <RegionList
                names={p.volatileRegions}
                color="#a78bfa" bg="rgba(167,139,250,0.08)" border="rgba(167,139,250,0.2)"
                emptyText="None"
              />
            </SectionRow>
            <SectionRow icon={RotateCcw} iconColor="#00d2ad" label="Recovering" noBorder>
              <RegionList
                names={p.recoveringRegions}
                color="#00d2ad" bg="rgba(0,210,173,0.08)" border="rgba(0,210,173,0.2)"
                emptyText="None"
              />
            </SectionRow>
          </div>

          {/* Executive focus areas */}
          {hasFocus && (
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                Executive Focus Areas
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {focus.map((area, i) => {
                  const cfg = URGENCY_CFG[area.urgency] ?? URGENCY_CFG.MEDIUM
                  return (
                    <div key={`focus-${area.regionName}-${area.urgency}-${i}`} style={{
                      padding: '8px 12px', borderRadius: '8px',
                      background: cfg.bg, border: `1px solid ${cfg.border}`,
                      display: 'flex', gap: '10px', alignItems: 'flex-start',
                    }}>
                      <Zap style={{ width: 12, height: 12, color: cfg.color, flexShrink: 0, marginTop: 2 }} strokeWidth={1.75} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '2px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {area.regionName}
                          </span>
                          <span style={{
                            fontSize: '10px', padding: '1px 5px', borderRadius: '99px',
                            color: cfg.color, background: 'var(--bg-surface)', border: `1px solid ${cfg.border}`,
                            fontWeight: 500,
                          }}>
                            {cfg.label}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{area.reason}</span>
                        </div>
                        <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.5' }}>
                          {area.detail}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Data quality warnings */}
          {hasWarnings && (
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                Data Quality
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {dqWarn.slice(0, 5).map((w, i) => {
                  const cfg = DQ_CFG[w.severity] ?? DQ_CFG.INFO
                  return (
                    <div key={`dq-${w.regionName}-${w.code}-${i}`} style={{
                      display: 'flex', alignItems: 'flex-start', gap: '8px',
                      padding: '6px 10px', borderRadius: '6px',
                      background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)',
                    }}>
                      <ShieldAlert style={{ width: 11, height: 11, color: cfg.color, flexShrink: 0, marginTop: 2 }} strokeWidth={1.75} />
                      <div>
                        <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-primary)', marginRight: '4px' }}>
                          {w.regionName}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{w.description}</span>
                      </div>
                    </div>
                  )
                })}
                {dqWarn.length > 5 && (
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, paddingLeft: '4px' }}>
                    +{dqWarn.length - 5} more warning{dqWarn.length - 5 > 1 ? 's' : ''}
                  </p>
                )}
              </div>
            </div>
          )}

          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'right' }}>
            Generated {new Date(intelligence.generatedAt).toLocaleTimeString()}
          </div>
        </div>
      )}
    </div>
  )
}
