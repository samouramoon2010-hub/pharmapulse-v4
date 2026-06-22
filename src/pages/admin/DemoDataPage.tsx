// ============================================================
// Demo Data Page — RF-0E v1
// Admin-only. Dry-run → Generate → Delete.
// ============================================================
import React, { useEffect, useState } from 'react'
import {
  FlaskConical, Play, Trash2, AlertCircle, CheckCircle2,
  Loader2, ChevronDown, ChevronRight, Bug,
} from 'lucide-react'
import { useAuthStore }       from '../../store/authStore'
import { auth }               from '../../services/firebase'
import { runDryRun, generateDemoBatch, listDemoBatches } from '../../demo/demo-seeder'
import { deleteDemoBatch, deleteAllDemoData, scanAllDemoData } from '../../demo/demo-cleanup'
import { DEMO_BATCHES_COLLECTION } from '../../demo/constants'
import app                    from '../../services/firebase'
import type { DryRunReport, DemoBatchDoc } from '../../demo/types'
import type { GlobalCleanupScan, GlobalCleanupResult } from '../../demo/demo-cleanup'

// ── Styles ────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--border-default)',
  borderRadius: '10px', padding: '20px 24px', marginBottom: '20px',
}
const secTitle: React.CSSProperties = {
  fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)',
  marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px',
}
const pill = (color: string): React.CSSProperties => ({
  display: 'inline-block', padding: '1px 8px', borderRadius: '10px', fontSize: '10px',
  fontWeight: 600, background: color + '22', color, border: '1px solid ' + color + '44',
})
const btnPrimary = (disabled: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: '7px',
  padding: '0 18px', height: '36px', borderRadius: '8px',
  fontSize: '12px', fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
  background: disabled ? 'var(--bg-surface)' : 'var(--accent)', color: disabled ? 'var(--text-muted)' : '#fff',
  border: disabled ? '1px solid var(--border-default)' : 'none', transition: 'all 0.15s',
  opacity: disabled ? 0.7 : 1,
})
const btnDanger = (disabled: boolean): React.CSSProperties => ({
  ...btnPrimary(disabled),
  background: disabled ? 'var(--bg-surface)' : '#dc262222',
  color:      disabled ? 'var(--text-muted)' : '#ef4444',
  border:     disabled ? '1px solid var(--border-default)' : '1px solid #dc262244',
})

// ── Page ──────────────────────────────────────────────────────

export default function DemoDataPage() {
  const { userProfile } = useAuthStore()

  const [month,         setMonth]         = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [dryRunReport,  setDryRunReport]  = useState<DryRunReport | null>(null)
  const [dryRunExpanded, setDryRunExpanded] = useState(false)
  const [batches,       setBatches]       = useState<DemoBatchDoc[]>([])
  const [batchesError,  setBatchesError]  = useState<string | null>(null)
  const [running,       setRunning]       = useState(false)
  const [generating,    setGenerating]    = useState(false)
  const [deleting,      setDeleting]      = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [status,        setStatus]        = useState<{ type: 'success' | 'error', msg: string } | null>(null)
  const [debugInfo,     setDebugInfo]     = useState<Record<string, string>>({})
  const [showDebug,     setShowDebug]     = useState(false)

  // Global cleanup state
  const [globalScan,      setGlobalScan]      = useState<GlobalCleanupScan | null>(null)
  const [scanning,        setScanning]        = useState(false)
  const [globalDeleting,  setGlobalDeleting]  = useState(false)
  const [globalResult,    setGlobalResult]    = useState<GlobalCleanupResult | null>(null)
  const [confirmGlobal,   setConfirmGlobal]   = useState(0)   // 0=idle, 1=first, 2=confirmed

  const loadBatches = async () => {
    setBatchesError(null)

    // Capture debug info on every load attempt
    const currentUser = auth?.currentUser
    const projectId   = (app as any)?.options?.projectId ?? 'unknown'
    setDebugInfo({
      'Auth UID':              currentUser?.uid ?? '⚠ not authenticated',
      'Auth email':            currentUser?.email ?? '—',
      'User role (store)':     userProfile?.role ?? '⚠ profile not loaded',
      'User ID (store)':       userProfile?.uid  ?? userProfile?.id ?? '—',
      'Firebase projectId':    projectId,
      'Collection: batches':   DEMO_BATCHES_COLLECTION,
      'Collection: users':     'users',
      'Collection: kpi_entries': 'kpi_entries',
      'COL match':             DEMO_BATCHES_COLLECTION === 'demo_batches' ? '✓ demo_batches' : '✗ MISMATCH',
      'KPI rule bypass':       'isAdmin() && isDemoData==true (required in deployed rules)',
    })

    try {
      setBatches(await listDemoBatches())
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setBatchesError(msg)
      // Add raw error code to debug info
      setDebugInfo((prev) => ({
        ...prev,
        'Error message': msg,
        'Error code':    (e as any)?.code ?? '—',
      }))
    }
  }

  useEffect(() => { loadBatches() }, [])

  const handleDryRun = () => {
    setRunning(true)
    setStatus(null)
    try {
      const report = runDryRun('standard_mixed_environment', month)
      setDryRunReport(report)
      setDryRunExpanded(true)
    } catch (e) {
      setStatus({ type: 'error', msg: e instanceof Error ? e.message : String(e) })
    } finally {
      setRunning(false)
    }
  }

  const handleGenerate = async () => {
    if (!dryRunReport) return
    setGenerating(true)
    setStatus(null)
    try {
      const { batchId, counts } = await generateDemoBatch(
        'standard_mixed_environment',
        userProfile?.uid ?? 'admin',
        month,
      )
      setStatus({ type: 'success', msg: `✓ Demo batch ${batchId} generated — ${counts.kpiEntries} KPI entries across ${counts.pharmacies} branches` })
      setDryRunReport(null)
      await loadBatches()
    } catch (e) {
      setStatus({ type: 'error', msg: e instanceof Error ? e.message : String(e) })
    } finally {
      setGenerating(false)
    }
  }

  const handleDelete = async (batchId: string) => {
    if (confirmDelete !== batchId) { setConfirmDelete(batchId); return }
    setConfirmDelete(null)
    setDeleting(batchId)
    setStatus(null)
    try {
      const result = await deleteDemoBatch(batchId)
      setStatus({ type: 'success', msg: `✓ Deleted ${result.total} documents from batch ${batchId}` })
      await loadBatches()
    } catch (e) {
      setStatus({ type: 'error', msg: e instanceof Error ? e.message : String(e) })
    } finally {
      setDeleting(null)
    }
  }

  const handleScan = async () => {
    setScanning(true)
    setGlobalScan(null)
    setGlobalResult(null)
    try { setGlobalScan(await scanAllDemoData()) }
    catch (e) { setStatus({ type: 'error', msg: e instanceof Error ? e.message : String(e) }) }
    finally { setScanning(false) }
  }

  const handleGlobalDelete = async () => {
    if (confirmGlobal < 2) { setConfirmGlobal(confirmGlobal + 1); return }
    setConfirmGlobal(0)
    setGlobalDeleting(true)
    setStatus(null)
    try {
      const result = await deleteAllDemoData()
      setGlobalResult(result)
      setGlobalScan(null)
      await loadBatches()
      if (result.verificationPass) {
        setStatus({ type: 'success', msg: `✓ All demo data deleted — ${result.totalDeleted} documents removed. Environment is clean.` })
      } else {
        setStatus({ type: 'error', msg: `Deletion completed but verification found remaining demo docs. Check the report below.` })
      }
    } catch (e) {
      setStatus({ type: 'error', msg: e instanceof Error ? e.message : String(e) })
    } finally {
      setGlobalDeleting(false)
    }
  }

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '24px 20px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <FlaskConical size={20} style={{ color: 'var(--accent)' }} />
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Demo Data Seeder
          </h1>
          <span style={{ ...pill('#f59e0b'), textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            RF-0E · Admin Only
          </span>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
          Generate realistic test data for evaluations and rankings. All documents are tagged
          with <code>isDemoData: true</code> and can be deleted as a batch.
          <strong style={{ color: '#ef4444' }}> Never touches real data.</strong>
        </p>
      </div>

      {/* Status banner */}
      {status && (
        <div style={{
          display: 'flex', gap: '10px', padding: '12px 16px', marginBottom: '16px',
          background: status.type === 'success' ? '#22c55e22' : '#dc262222',
          border: `1px solid ${status.type === 'success' ? '#22c55e44' : '#dc262244'}`,
          borderRadius: '8px',
        }}>
          {status.type === 'success'
            ? <CheckCircle2 size={15} style={{ color: '#22c55e', flexShrink: 0 }} />
            : <AlertCircle  size={15} style={{ color: '#ef4444', flexShrink: 0 }} />}
          <div style={{ fontSize: '12px', color: status.type === 'success' ? '#22c55e' : '#ef4444' }}>
            {status.msg}
          </div>
        </div>
      )}

      {/* Firestore rules deployment reminder */}
      {batchesError && (
        <div style={{
          display: 'flex', gap: '10px', padding: '14px 16px', marginBottom: '16px',
          background: '#f59e0b11', border: '1px solid #f59e0b44', borderRadius: '8px',
        }}>
          <AlertCircle size={15} style={{ color: '#f59e0b', flexShrink: 0, marginTop: '1px' }} />
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#f59e0b', marginBottom: '4px' }}>
              Cannot read demo_batches — Firestore rules not deployed
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              The <code>demo_batches</code> collection rule exists in <code>firestore.rules</code> but
              has not been published to Firebase yet.<br />
              <strong>To fix:</strong> Firebase Console → Firestore → Rules → paste <code>firestore.rules</code> → Publish.
              Then reload this page.
            </div>
            <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace',
              background: 'var(--bg-surface)', padding: '6px 10px', borderRadius: '6px' }}>
              {batchesError}
            </div>
            <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
              Note: Dry-run and Generate work without reading demo_batches — you can still generate data.
            </div>
          </div>
        </div>
      )}

      {/* Debug panel — always visible, helps diagnose auth/project/path issues */}
      <div style={{ ...card, borderColor: showDebug ? 'var(--border-default)' : 'transparent',
        background: showDebug ? 'var(--bg-card)' : 'transparent',
        padding: showDebug ? '20px 24px' : '0 24px 8px',
        marginBottom: showDebug ? '20px' : '0',
      }}>
        <button
          onClick={() => setShowDebug(!showDebug)}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none',
            border: 'none', cursor: 'pointer', fontSize: '11px',
            color: batchesError ? '#f59e0b' : 'var(--text-muted)',
            padding: showDebug ? '0 0 12px' : '0',
          }}
        >
          <Bug size={12} />
          {showDebug ? 'Hide' : 'Show'} Diagnostics
          {batchesError && <span style={{ color: '#f59e0b' }}> ← click to diagnose</span>}
        </button>

        {showDebug && (
          <div style={{ fontFamily: 'monospace', fontSize: '11px', lineHeight: 1.8 }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)',
              marginBottom: '10px' }}>
              Diagnostics — Auth · Project · Collection
            </div>
            {Object.entries(debugInfo).map(([key, val]) => (
              <div key={key} style={{ display: 'flex', gap: '12px',
                padding: '3px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ color: 'var(--text-muted)', minWidth: '180px', flexShrink: 0 }}>{key}</span>
                <span style={{
                  color: val.startsWith('⚠') ? '#ef4444'
                       : val.startsWith('✓') ? '#22c55e'
                       : val.startsWith('✗') ? '#ef4444'
                       : 'var(--text-primary)',
                  wordBreak: 'break-all',
                }}>{val}</span>
              </div>
            ))}
            {Object.keys(debugInfo).length === 0 && (
              <span style={{ color: 'var(--text-muted)' }}>Loading…</span>
            )}
            <div style={{ marginTop: '12px', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              <strong>Common causes of permission-denied:</strong><br />
              1. <code>User role (store)</code> is not <code>admin</code> — isAdmin() will reject<br />
              2. <code>Firebase projectId</code> doesn't match the project where rules were deployed<br />
              3. <code>Auth UID</code> is missing — user not signed in<br />
              4. Rules deployed to the wrong Firebase project (check Firebase Console URL)
            </div>
          </div>
        )}
      </div>

      {/* Scenario selector + controls */}
      <div style={card}>
        <div style={secTitle}><FlaskConical size={14} />Scenario</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 500,
              color: 'var(--text-muted)', textTransform: 'uppercase',
              letterSpacing: '0.07em', marginBottom: '5px' }}>Scenario</label>
            <select style={{ height: '34px', fontSize: '12px', padding: '0 10px',
              border: '1px solid var(--border-default)', borderRadius: '7px',
              background: 'var(--bg-input)', color: 'var(--text-primary)', width: '260px' }}>
              <option value="standard_mixed_environment">Standard Mixed Environment</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 500,
              color: 'var(--text-muted)', textTransform: 'uppercase',
              letterSpacing: '0.07em', marginBottom: '5px' }}>Month</label>
            <input type="month" value={month} onChange={(e) => { setMonth(e.target.value); setDryRunReport(null) }}
              style={{ height: '34px', fontSize: '12px', padding: '0 10px',
                border: '1px solid var(--border-default)', borderRadius: '7px',
                background: 'var(--bg-input)', color: 'var(--text-primary)', width: '160px' }} />
          </div>
        </div>

        {/* Dry-run */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={handleDryRun} disabled={running} style={btnPrimary(running)}>
            {running
              ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />Running…</>
              : <><Play size={13} />Dry Run</>}
          </button>
          <button onClick={handleGenerate} disabled={!dryRunReport || generating} style={btnPrimary(!dryRunReport || generating)}>
            {generating
              ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />Generating…</>
              : <><FlaskConical size={13} />Generate Demo Data</>}
          </button>
          {!dryRunReport && !generating && (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Run dry-run first to preview what will be generated.
            </span>
          )}
        </div>
      </div>

      {/* Dry-run report */}
      {dryRunReport && (
        <div style={card}>
          <div style={{ ...secTitle, cursor: 'pointer' }} onClick={() => setDryRunExpanded(!dryRunExpanded)}>
            {dryRunExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            Dry-Run Preview — {dryRunReport.scenarioName} · {dryRunReport.month}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: dryRunExpanded ? '16px' : '0' }}>
            {[
              { label: 'Branches',         value: dryRunReport.branches.length },
              { label: 'Pharmacists',      value: dryRunReport.pharmacists.length },
              { label: 'Targets',          value: dryRunReport.targetCount },
              { label: 'Personal Targets', value: dryRunReport.personalTargetCount },
              { label: 'KPI Entries',      value: dryRunReport.kpiEntryCount },
              { label: 'Est. Writes',      value: dryRunReport.estimatedWrites, color: '#f59e0b' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ padding: '8px 14px', background: 'var(--bg-surface)',
                borderRadius: '7px', border: `1px solid ${color ? color + '33' : 'var(--border-subtle)'}` }}>
                <div style={{ fontSize: '20px', fontWeight: 700, color: color ?? 'var(--text-primary)' }}>{value}</div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{label}</div>
              </div>
            ))}
          </div>

          {dryRunExpanded && (
            <>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
                Branches
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px' }}>
                {dryRunReport.branches.map((b) => (
                  <div key={b.code} style={{ padding: '4px 10px', background: 'var(--bg-surface)',
                    borderRadius: '6px', border: '1px solid var(--border-subtle)', fontSize: '11px' }}>
                    <strong>{b.name}</strong>
                    <span style={{ color: 'var(--text-muted)', marginRight: '6px' }}> ({b.code})</span>
                    <span style={pill('#6b7280')}>{b.classification}</span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
                Pharmacists
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {dryRunReport.pharmacists.map((p, i) => (
                  <div key={i} style={{ padding: '4px 10px', background: 'var(--bg-surface)',
                    borderRadius: '6px', border: '1px solid var(--border-subtle)', fontSize: '11px' }}>
                    {p.name}
                    <span style={{
                      ...pill(p.performerType === 'high' ? '#22c55e'
                        : p.performerType === 'average' ? '#3b82f6'
                        : p.performerType === 'underperformer' ? '#f59e0b' : '#6b7280'),
                      marginRight: '6px', marginTop: '0',
                    }}>{p.performerType}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Active demo batches */}
      <div style={card}>
        <div style={secTitle}><FlaskConical size={14} />Active Demo Batches ({batches.length})</div>
        {batchesError && (
          <div style={{ fontSize: '12px', color: '#f59e0b', marginBottom: '8px' }}>
            ⚠ Cannot load batches — deploy Firestore rules first (see banner above).
          </div>
        )}
        {!batchesError && batches.length === 0 && (
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>
            No demo batches yet. Generate one above.
          </div>
        )}
        {batches.map((b) => (
          <div key={b.demoBatchId} style={{
            display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
            padding: '12px 16px', background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)', borderRadius: '8px', marginBottom: '8px',
          }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)', marginBottom: '4px' }}>
                <code style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{b.demoBatchId}</code>
                {'  '}<span style={pill('#22c55e')}>{b.scenarioName}</span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {b.entityCounts.pharmacies} branches · {b.entityCounts.users > 0
                  ? <span style={{ color: '#22c55e' }}>{b.entityCounts.users} pharmacists ✓</span>
                  : <span style={{ color: '#ef4444' }}>⚠ 0 pharmacists written — deploy Firestore rules</span>
                } · {b.entityCounts.kpiEntries} KPI entries ·
                Generated by {b.generatedBy}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {confirmDelete === b.demoBatchId && (
                <span style={{ fontSize: '11px', color: '#ef4444' }}>Click again to confirm</span>
              )}
              <button
                onClick={() => handleDelete(b.demoBatchId)}
                disabled={deleting === b.demoBatchId}
                style={btnDanger(deleting === b.demoBatchId)}
              >
                {deleting === b.demoBatchId
                  ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />Deleting…</>
                  : <><Trash2 size={12} />{confirmDelete === b.demoBatchId ? 'Confirm Delete' : 'Delete'}</>}
              </button>
            </div>
          </div>
        ))}
      </div>
    {/* ── Global Cleanup Section ─────────────────────────── */}
      <div style={{ ...card, borderTop: '2px solid #dc262233', background: '#1a00001a' }}>
        <div style={secTitle}>
          <Trash2 size={14} style={{ color: '#ef4444' }} />
          <span style={{ color: '#ef4444' }}>Global Demo Data Reset</span>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '14px' }}>
          Deletes <strong>all</strong> documents carrying <code>isDemoData: true</code> across all
          collections. Only demo-tagged documents are affected — real data is never touched.
        </p>

        {/* Step 1: Scan */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '14px' }}>
          <button onClick={handleScan} disabled={scanning || globalDeleting} style={btnPrimary(scanning || globalDeleting)}>
            {scanning
              ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />Scanning…</>
              : <><Play size={13} />Scan Demo Data</>}
          </button>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Scan first to see what will be deleted.
          </span>
        </div>

        {/* Scan results */}
        {globalScan && (
          <div style={{ marginBottom: '14px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
              Demo documents found ({globalScan.totalDocs} total)
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
              {globalScan.counts.map((c) => (
                <div key={c.collection} style={{
                  padding: '6px 12px', borderRadius: '7px',
                  background: c.count > 0 ? '#ef444422' : 'var(--bg-surface)',
                  border: `1px solid ${c.count > 0 ? '#ef444444' : 'var(--border-subtle)'}`,
                  fontSize: '11px',
                }}>
                  <strong style={{ color: c.count > 0 ? '#ef4444' : 'var(--text-muted)' }}>
                    {c.count}
                  </strong>
                  <span style={{ color: 'var(--text-muted)', marginRight: '4px' }}> {c.collection}</span>
                </div>
              ))}
            </div>
            {globalScan.totalDocs === 0 && (
              <div style={{ fontSize: '12px', color: '#22c55e', fontWeight: 500 }}>
                ✓ Environment is already clean — no demo data found.
              </div>
            )}
          </div>
        )}

        {/* Step 2: Delete (only shown after scan with data) */}
        {globalScan && globalScan.totalDocs > 0 && (
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={handleGlobalDelete}
              disabled={globalDeleting}
              style={btnDanger(globalDeleting)}
            >
              {globalDeleting
                ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />Deleting…</>
                : confirmGlobal === 0
                  ? <><Trash2 size={13} />Delete All Demo Data</>
                  : confirmGlobal === 1
                    ? <><Trash2 size={13} />Are you sure? Click again to confirm</>
                    : <><Trash2 size={13} />FINAL CONFIRM — this cannot be undone</>
              }
            </button>
            {confirmGlobal > 0 && !globalDeleting && (
              <button onClick={() => setConfirmGlobal(0)}
                style={{ ...btnPrimary(false), background: 'var(--bg-surface)',
                  color: 'var(--text-muted)', border: '1px solid var(--border-default)' }}>
                Cancel
              </button>
            )}
          </div>
        )}

        {/* Cleanup result + verification */}
        {globalResult && (
          <div style={{ marginTop: '16px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
              Cleanup Report
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
              {Object.entries(globalResult.deleted).map(([col, count]) => count > 0 && (
                <div key={col} style={{ padding: '4px 10px', background: 'var(--bg-surface)',
                  borderRadius: '6px', border: '1px solid var(--border-subtle)', fontSize: '11px' }}>
                  <strong>{count}</strong>
                  <span style={{ color: 'var(--text-muted)', marginRight: '4px' }}> {col}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px',
              color: globalResult.verificationPass ? '#22c55e' : '#ef4444' }}>
              Verification: {globalResult.verificationPass ? '✓ Environment Clean' : '⚠ Remaining demo docs found'}
            </div>
            {!globalResult.verificationPass && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {Object.entries(globalResult.verification)
                  .filter(([, count]) => count !== 0)
                  .map(([col, count]) => (
                    <div key={col} style={{ padding: '4px 10px', background: '#ef444422',
                      borderRadius: '6px', border: '1px solid #ef444444', fontSize: '11px', color: '#ef4444' }}>
                      {col}: {count === -1 ? 'could not verify' : `${count} remaining`}
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  )
}
