// ============================================================
// KPI Management Page — Admin only · /admin/kpis
// Displays and manages KPI registry definitions.
// Changes are stored in session (localStorage with fallback)
// until a Firestore registry collection is implemented.
// Does NOT modify existing KPI calculations or Firestore data.
// ============================================================
import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { Database, Plus, RefreshCw, AlertTriangle, Info } from 'lucide-react'

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

  // Existing keys set for duplicate-key validation
  const existingKeys = useMemo(() => new Set(Object.keys(mergedRegistry)), [mergedRegistry])

  // Weight validation
  const weightsValid = useMemo(() => validateWeights(mergedRegistry), [mergedRegistry])

  // ── Editor state ──────────────────────────────────────────
  const [editorOpen,   setEditorOpen]   = useState(false)
  const [editingKpi,   setEditingKpi]   = useState(null)
  const [successMsg,   setSuccessMsg]   = useState('')

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

  const handleArchive = useCallback(async (key) => {
    if (PROTECTED_CORE_KEYS.has(key) && mergedRegistry[key]?.isCore) return
    try {
      await archiveKpiDefinition(key)
      flash(`KPI "${key}" archived.`)
    } catch (e) {
      flash(`Error archiving KPI: ${e.message}`)
    }
  }, [mergedRegistry])

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

      {/* Table */}
      <KpiRegistryTable
        kpis={allKpis}
        uiStatuses={uiStatuses}
        onEdit={openEdit}
        onArchive={handleArchive}
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
    </div>
  )
}
