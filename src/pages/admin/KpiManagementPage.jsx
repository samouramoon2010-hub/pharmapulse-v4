// ============================================================
// KPI Management Page — Admin only · /admin/kpis
// Displays and manages KPI registry definitions.
// Changes are stored in session (localStorage with fallback)
// until a Firestore registry collection is implemented.
// Does NOT modify existing KPI calculations or Firestore data.
// ============================================================
import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { Database, Plus, RefreshCw, AlertTriangle, Info, X, Loader2, ChevronDown, Eye, EyeOff } from 'lucide-react'

import {
  DEFAULT_KPI_REGISTRY,
  validateWeights,
} from '../../engine/kpiRegistry'
import {
  subscribeKpiRegistry,
  saveKpiDefinition,
  archiveKpiDefinition,
  hideKpiDefinition,
  resetKpiRegistryToDefaults,
  PROTECTED_CORE_KEYS,
} from '../../services/kpiRegistryService'
import { checkKpiArchiveDependencies } from '../../services/kpiArchiveGuard'

import KpiRegistryTable from '../../components/admin/kpi/KpiRegistryTable'
import KpiEditorModal   from '../../components/admin/kpi/KpiEditorModal'

// ─────────────────────────────────────────────────────────────

export default function KpiManagementPage() {
  // ── Firestore-backed registry state ───────────────────────
  const [mergedRegistry, setMergedRegistry] = useState(DEFAULT_KPI_REGISTRY)
  const [uiStatuses,     setUiStatuses]     = useState(() =>
    Object.fromEntries(Object.keys(DEFAULT_KPI_REGISTRY).map((k) => [k, DEFAULT_KPI_REGISTRY[k].isActive ? 'ACTIVE' : 'ARCHIVED']))
  )
  const [fsLoading, setFsLoading] = useState(true)
  const [saving,    setSaving]    = useState(false)

  // Subscribe to Firestore registry — real-time updates
  useEffect(() => {
    const unsub = subscribeKpiRegistry(
      (registry, statuses) => {
        setMergedRegistry(registry)
        setUiStatuses(statuses)
        setFsLoading(false)
      },
      () => setFsLoading(false), // on error — fall back to defaults
    )
    return unsub
  }, [])

  // All KPIs sorted by sortOrder
  const allKpis = useMemo(() =>
    Object.values(mergedRegistry).sort((a, b) => a.sortOrder - b.sortOrder),
    [mergedRegistry],
  )

  // Archived KPIs are hidden from this admin table by default — an
  // explicit toggle brings them back into view for management (e.g.
  // to unarchive one later). This is a view-only filter: archived
  // KPIs are never removed from the registry itself, and were already
  // excluded from every non-admin surface (target input, dashboard,
  // entry) via isActive/lifecycleStage filtering.
  const [showArchived, setShowArchived] = useState(false)
  const visibleKpis = useMemo(() => {
    if (showArchived) return allKpis
    return allKpis.filter((k) => (uiStatuses[k.key] ?? (k.isActive ? 'ACTIVE' : 'ARCHIVED')) !== 'ARCHIVED')
  }, [allKpis, uiStatuses, showArchived])

  // ── Registry health stats ──────────────────────────────────
  // PR-1C: warnings are split into blockers (prevent correct evaluation —
  // e.g. no primary KPI) and recommendations (content-completeness gaps,
  // safe to defer) instead of one flat, ungrouped list.
  const healthStats = useMemo(() => {
    const counts = { draft:0, pilot_tracking:0, shadow_evaluation:0, production_evaluation:0, archived:0 }
    const blockers = []
    const recommendations = []
    allKpis.forEach((kpi) => {
      const stage = kpi.lifecycleStage ?? 'production_evaluation'
      if (stage in counts) counts[stage] = counts[stage] + 1
      if (!kpi.labelAr || kpi.labelAr.trim() === kpi.label) recommendations.push(`"${kpi.label}" is missing an Arabic label.`)
      if (!kpi.coachingAction)   recommendations.push(`"${kpi.label}" is missing a coaching action (English).`)
      if (!kpi.coachingActionAr) recommendations.push(`"${kpi.label}" is missing a coaching action (Arabic).`)
    })
    const primaryKpis = allKpis.filter((k) => k.isPrimary)
    if (primaryKpis.length !== 1) blockers.push(`The registry must have exactly one primary KPI (found ${primaryKpis.length}).`)
    return { counts, blockers, recommendations, total: blockers.length + recommendations.length }
  }, [allKpis])

  // Existing keys set for duplicate-key validation
  const existingKeys = useMemo(() => new Set(Object.keys(mergedRegistry)), [mergedRegistry])

  // Weight validation
  const weightsValid = useMemo(() => validateWeights(mergedRegistry), [mergedRegistry])

  // ── Editor state ──────────────────────────────────────────
  const [editorOpen,   setEditorOpen]   = useState(false)
  const [editingKpi,   setEditingKpi]   = useState(null)
  const [successMsg,   setSuccessMsg]   = useState('')
  const [recsOpen,     setRecsOpen]     = useState(false)
  // PR-1C: archive dependency check — null while idle, then either
  // { key, loading:true } or { key, loading:false, result } from
  // checkKpiArchiveDependencies().
  const [archiveCheck, setArchiveCheck] = useState(null)

  const openAdd  = () => { setEditingKpi(null); setEditorOpen(true) }
  const openEdit = (kpi) => { setEditingKpi(kpi); setEditorOpen(true) }
  const closeEditor = () => { setEditorOpen(false); setEditingKpi(null) }

  function flash(msg) {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(''), 3000)
  }

  // ── Actions ───────────────────────────────────────────────

  const handleSave = useCallback(async (kpiDef, uiStatus) => {
    setSaving(true)
    try {
      await saveKpiDefinition(kpiDef, uiStatus, mergedRegistry)
      closeEditor()
      flash(`KPI "${kpiDef.label}" saved.`)
    } catch (e) {
      flash(`Error saving KPI: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }, [mergedRegistry])

  // PR-1C: clicking Archive no longer archives immediately — it runs the
  // dependency check first and opens a modal showing exactly what would be
  // affected. Archiving itself only proceeds from the modal, and only when
  // the check reports safe:true.
  //
  // 2026-07-07: the PROTECTED_CORE_KEYS early-return here was removed —
  // archiving a core KPI is now permitted (kpiRegistryService.ts no longer
  // blocks it). The dependency check below still applies uniformly to
  // every key, core or not.
  const requestArchive = useCallback(async (key) => {
    setArchiveCheck({ key, loading: true })
    try {
      const result = await checkKpiArchiveDependencies(key)
      setArchiveCheck({ key, loading: false, result })
    } catch (e) {
      setArchiveCheck({ key, loading: false, result: { safe: false, dependencies: [], error: e.message } })
    }
  }, [mergedRegistry])

  const confirmArchive = useCallback(async () => {
    if (!archiveCheck?.key) return
    const key = archiveCheck.key
    setArchiveCheck(null)
    try {
      await archiveKpiDefinition(key)
      flash(`KPI "${key}" archived.`)
    } catch (e) {
      flash(`Error archiving KPI: ${e.message}`)
    }
  }, [archiveCheck])

  const handleHide = useCallback(async (key) => {
    if (PROTECTED_CORE_KEYS.has(key) && mergedRegistry[key]?.isCore) return
    try {
      await hideKpiDefinition(key)
      flash(`KPI "${key}" hidden from input forms.`)
    } catch (e) {
      flash(`Error hiding KPI: ${e.message}`)
    }
  }, [mergedRegistry])

  const handleReset = async () => {
    setSaving(true)
    try {
      await resetKpiRegistryToDefaults()
      flash('Registry reset to defaults.')
    } catch (e) {
      flash(`Error resetting registry: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  // ─────────────────────────────────────────────────────────

  return (
    <div style={{ padding:'24px', display:'flex', flexDirection:'column', gap:'20px' }}>

      {/* Page header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
        <div>
          <h1 style={{ fontSize:'18px', fontWeight:700, color:'var(--text-primary)', margin:0, display:'flex', alignItems:'center', gap:'8px' }}>
            <Database style={{ width:18, height:18, color:'var(--text-muted)' }} />
            KPI Management
          </h1>
          <p style={{ fontSize:'13px', color:'var(--text-muted)', margin:'4px 0 0' }}>
            {fsLoading ? 'Loading…' : `${allKpis.length} definitions · ${allKpis.filter((k) => uiStatuses[k.key] === 'ACTIVE').length} active`}
            {!fsLoading && ' · Synced with Firestore'}
          </p>
        </div>
        <div style={{ display:'flex', gap:'8px' }}>
          <button
            onClick={() => setShowArchived((s) => !s)}
            style={{
              height:'32px', padding:'0 12px', borderRadius:'8px', fontSize:'12px', fontWeight:500,
              cursor:'pointer', background: showArchived ? 'rgba(96,165,250,0.10)' : 'transparent',
              border:'1px solid var(--border-default)',
              color: showArchived ? '#60a5fa' : 'var(--text-muted)', display:'flex', alignItems:'center', gap:'6px',
            }}
          >
            {showArchived ? <Eye style={{ width:12, height:12 }} /> : <EyeOff style={{ width:12, height:12 }} />}
            {showArchived ? 'Hide archived' : `Show archived (${healthStats.counts.archived})`}
          </button>
          <button
            onClick={handleReset}
            style={{
              height:'32px', padding:'0 12px', borderRadius:'8px', fontSize:'12px', fontWeight:500,
              cursor:'pointer', background:'transparent', border:'1px solid var(--border-default)',
              color:'var(--text-muted)', display:'flex', alignItems:'center', gap:'6px',
            }}
          >
            <RefreshCw style={{ width:12, height:12 }} />
            Reset to defaults
          </button>
          <button
            onClick={openAdd}
            style={{
              height:'32px', padding:'0 14px', borderRadius:'8px', fontSize:'12px', fontWeight:600,
              cursor:'pointer', background:'var(--brand-500)', border:'none', color:'#09090b',
              display:'flex', alignItems:'center', gap:'6px',
            }}
          >
            <Plus style={{ width:13, height:13 }} />
            Add KPI
          </button>
        </div>
      </div>

      {/* Weight warning */}
      {!weightsValid && (
        <div style={{ display:'flex', gap:'8px', padding:'10px 14px', borderRadius:'8px', background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.2)', fontSize:'12px', color:'#f59e0b' }}>
          <AlertTriangle style={{ width:14, height:14, flexShrink:0, marginTop:1 }} />
          Active core KPI weights do not sum to 1.0 — adjust weights before publishing changes.
        </div>
      )}

      {/* Success flash */}
      {successMsg && (
        <div style={{ padding:'8px 14px', borderRadius:'8px', background:'rgba(34,197,94,0.08)', border:'1px solid rgba(34,197,94,0.2)', fontSize:'12px', color:'#22c55e' }}>
          {successMsg}
        </div>
      )}

      {/* Info notice */}
      <div style={{ display:'flex', gap:'8px', padding:'8px 12px', borderRadius:'8px', background:'rgba(96,165,250,0.06)', border:'1px solid rgba(96,165,250,0.15)', fontSize:'11px', color:'#60a5fa' }}>
        <Info style={{ width:12, height:12, flexShrink:0, marginTop:2 }} />
        KPI changes are persisted to Firestore and shared across all devices.
        Protected core KPIs cannot be deleted or archived. No hard deletes — archive instead.
      </div>

      {/* ── Registry Health Dashboard (Part G) ─────────────────── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:'8px' }}>
        {[
          { label:'Total',       count: allKpis.length,                               color:'var(--text-primary)' },
          { label:'Draft',       count: healthStats.counts.draft,                     color:'#a1a1aa' },
          { label:'Pilot',       count: healthStats.counts.pilot_tracking,            color:'#f59e0b' },
          { label:'Shadow',      count: healthStats.counts.shadow_evaluation,         color:'#60a5fa' },
          { label:'Production',  count: healthStats.counts.production_evaluation,     color:'#22c55e' },
          { label:'Archived',    count: healthStats.counts.archived,                  color:'#6b7280' },
        ].map(({ label, count, color }) => (
          <div key={label} style={{
            padding:'10px 12px', borderRadius:'8px',
            background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)',
            display:'flex', flexDirection:'column', gap:'4px',
          }}>
            <div style={{ fontSize:'20px', fontWeight:700, color, fontVariantNumeric:'tabular-nums' }}>{count}</div>
            <div style={{ fontSize:'10px', color:'var(--text-muted)', fontWeight:500 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Validation warnings — PR-1C: blockers and recommendations are now
          visually separated. Blockers prevent correct evaluation and are
          always expanded; recommendations are content-completeness gaps,
          collapsed by default so they don't compete for attention. */}
      {healthStats.total > 0 && (
        <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
          {healthStats.blockers.length > 0 && (
            <div style={{ borderRadius:'8px', background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.2)', padding:'10px 14px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'6px', fontSize:'11px', fontWeight:600, color:'#f87171' }}>
                <AlertTriangle style={{ width:12, height:12 }} />
                Blockers ({healthStats.blockers.length}) — must be fixed
              </div>
              <ul style={{ margin:0, paddingLeft:'16px', display:'flex', flexDirection:'column', gap:'3px' }}>
                {healthStats.blockers.map((w, i) => (
                  <li key={i} style={{ fontSize:'11px', color:'#f87171', opacity:0.9 }}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {healthStats.recommendations.length > 0 && (
            <div style={{ borderRadius:'8px', background:'rgba(245,158,11,0.06)', border:'1px solid rgba(245,158,11,0.2)', padding:'10px 14px' }}>
              <button
                onClick={() => setRecsOpen((o) => !o)}
                style={{
                  display:'flex', alignItems:'center', gap:'6px', width:'100%',
                  background:'none', border:'none', cursor:'pointer', padding:0,
                  fontSize:'11px', fontWeight:600, color:'#f59e0b',
                }}
              >
                <ChevronDown style={{ width:12, height:12, transform: recsOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition:'transform 0.15s' }} />
                Recommendations ({healthStats.recommendations.length}) — safe to address later
              </button>
              {recsOpen && (
                <ul style={{ margin:'8px 0 0', paddingLeft:'16px', display:'flex', flexDirection:'column', gap:'3px' }}>
                  {healthStats.recommendations.map((w, i) => (
                    <li key={i} style={{ fontSize:'11px', color:'#f59e0b', opacity:0.85 }}>{w}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <KpiRegistryTable
        kpis={visibleKpis}
        uiStatuses={uiStatuses}
        onEdit={openEdit}
        onArchive={requestArchive}
        onHide={handleHide}
      />

      {/* Editor modal */}
      <KpiEditorModal
        open={editorOpen}
        onClose={closeEditor}
        onSave={handleSave}
        editingKpi={editingKpi}
        existingKeys={existingKeys}
      />

      {/* Archive dependency check modal — PR-1C */}
      {archiveCheck && (
        <div style={{ position:'fixed', inset:0, zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:'16px' }}>
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.55)', backdropFilter:'blur(6px)' }} onClick={() => setArchiveCheck(null)} />
          <div style={{
            position:'relative', width:'100%', maxWidth:'440px',
            background:'var(--bg-elevated)', border:'1px solid var(--border-strong)',
            borderRadius:'12px', boxShadow:'0 24px 64px rgba(0,0,0,0.6)',
            padding:'18px',
          }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px' }}>
              <div style={{ fontSize:'14px', fontWeight:600, color:'var(--text-primary)' }}>
                Archive "{archiveCheck.key}"
              </div>
              <button onClick={() => setArchiveCheck(null)} style={{ width:26, height:26, borderRadius:'6px', border:'none', background:'transparent', cursor:'pointer', color:'var(--text-muted)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <X style={{ width:13, height:13 }} />
              </button>
            </div>

            {archiveCheck.loading ? (
              <div style={{ display:'flex', alignItems:'center', gap:'8px', fontSize:'12px', color:'var(--text-muted)', padding:'12px 0' }}>
                <Loader2 style={{ width:14, height:14, animation:'spin 1s linear infinite' }} />
                Checking dependencies…
              </div>
            ) : (
              <>
                {archiveCheck.result.dependencies.length === 0 ? (
                  <p style={{ fontSize:'12px', color:'var(--text-secondary)', marginBottom:'14px' }}>
                    No dependencies found. This KPI is safe to archive — historical data, if any appears later, is always preserved.
                  </p>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:'8px', marginBottom:'14px' }}>
                    {archiveCheck.result.dependencies.map((dep) => (
                      <div key={dep.type} style={{
                        padding:'9px 11px', borderRadius:'8px', fontSize:'12px',
                        background: dep.type === 'active_profile' || dep.type === 'draft_profile' ? 'rgba(239,68,68,0.06)' : 'rgba(245,158,11,0.06)',
                        border: `1px solid ${dep.type === 'active_profile' || dep.type === 'draft_profile' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}`,
                      }}>
                        <div style={{ fontWeight:600, color: dep.type === 'active_profile' || dep.type === 'draft_profile' ? '#f87171' : '#f59e0b' }}>
                          {dep.reason}
                        </div>
                        <div style={{ color:'var(--text-muted)', marginTop:'3px' }}>{dep.recommendedAction}</div>
                      </div>
                    ))}
                  </div>
                )}

                {!archiveCheck.result.safe && (
                  <div style={{ display:'flex', gap:'8px', padding:'8px 12px', borderRadius:'8px', background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.15)', fontSize:'11px', color:'#f87171', marginBottom:'14px' }}>
                    <AlertTriangle style={{ width:13, height:13, flexShrink:0, marginTop:1 }} />
                    Archive is blocked until this KPI is removed from the active/draft profile(s) listed above.
                  </div>
                )}

                <div style={{ display:'flex', gap:'8px' }}>
                  <button onClick={() => setArchiveCheck(null)} className="btn btn-secondary" style={{ flex:1, justifyContent:'center', fontSize:'12px' }}>
                    {archiveCheck.result.safe ? 'Cancel' : 'Close'}
                  </button>
                  {archiveCheck.result.safe && (
                    <button onClick={confirmArchive} className="btn btn-primary" style={{ flex:1, justifyContent:'center', fontSize:'12px' }}>
                      Archive
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
