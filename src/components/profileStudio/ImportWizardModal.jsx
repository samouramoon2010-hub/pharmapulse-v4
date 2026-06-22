// ============================================================
// ImportWizardModal — Excel/CSV Import Wizard (Phase 1 Closure Bundle)
//
// Guided, non-automatic flow, matching the bundle's required steps:
//   Upload file → Detect template → Column mapping →
//   Parsed profile preview → Validation report → Save as Draft only.
//
// Uses the pure importWizard.ts kernel for every parsing/validation
// step. This component only does file I/O (FileReader + XLSX, same
// pattern as src/services/importService.js) and persists the final
// result via the EXISTING createProfileDocument() service — with
// status hardcoded to DRAFT regardless of kernel output (defense in
// depth on top of the kernel already forcing DRAFT).
//
// Save is blocked whenever canSaveImportedProfile(report) is false —
// invalid weights, unknown KPI keys, invalid/unknown processors,
// incomplete thresholds, invalid caps, or any basket with no elements.
//
// NO AI. NO formula DSL. NO executable expressions. NO auto-import —
// every step requires explicit user action to advance.
// ============================================================
import React, { useState } from 'react'
import * as XLSX from 'xlsx'
import { X, Loader2, FileSpreadsheet, Upload, ArrowRight, ArrowLeft, AlertTriangle, CheckCircle2 } from 'lucide-react'

import {
  detectImportTemplate,
  buildColumnMapping,
  isColumnMappingComplete,
  buildProfileFromImportRows,
  buildImportValidationReport,
  canSaveImportedProfile,
  IMPORT_CANONICAL_FIELDS,
  IMPORT_REQUIRED_FIELDS,
} from '../../profileStudio/importWizard'
import { createProfileDocument } from '../../profileStudio/profileStudioService'
import { calculateProfileHash } from '../../profileStudio/integrity'
import { normalizeError } from '../../profileStudio/profileStudioStore'
import { useToastStore } from '../ui/Toast'

const STEPS = ['upload', 'mapping', 'preview', 'report']

function readSheetRows(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
        resolve(rows)
      } catch {
        reject(new Error('Could not read file — make sure it is a valid Excel or CSV file'))
      }
    }
    reader.onerror = () => reject(new Error('Failed to load file'))
    reader.readAsArrayBuffer(file)
  })
}

function summarizeHierarchy(rootNode) {
  const baskets = rootNode.baskets ?? []
  let elementCount = 0
  let ruleCount = 0
  for (const b of baskets) {
    const elements = b.elements ?? []
    elementCount += elements.length
    for (const e of elements) ruleCount += (e.rules ?? []).length
  }
  return { rootId: rootNode.id, rootLabel: rootNode.label, basketCount: baskets.length, elementCount, ruleCount, payload: rootNode }
}

function summarizeProcessors(rootNode) {
  const types = new Set()
  let totalStepCount = 0
  const walk = (steps) => { for (const s of (steps ?? [])) { types.add(s.processorType); totalStepCount++ } }
  for (const b of (rootNode.baskets ?? [])) {
    walk(b.pipeline?.steps)
    for (const e of (b.elements ?? [])) {
      walk(e.pipeline?.steps)
      for (const r of (e.rules ?? [])) walk(r.pipeline?.steps)
    }
  }
  return {
    processorTypes: [...types], totalStepCount,
    hasZeroTargetGuard:  types.has('ZERO_TARGET_GUARD'),
    hasBandEvaluator:    types.has('BAND_EVALUATOR'),
    hasPenaltyEvaluator: types.has('PENALTY_EVALUATOR'),
    hasNodeAggregator:   types.has('NODE_AGGREGATOR'),
  }
}

const FIELD_LABELS = {
  basketId: 'Basket ID', basketLabel: 'Basket Label', basketWeight: 'Basket Weight',
  elementId: 'Element ID', elementLabel: 'Element Label', elementWeight: 'Element Weight',
  ruleId: 'Rule ID', kpiKey: 'KPI Key', ruleLabel: 'Rule Label', ruleWeight: 'Rule Weight',
  metricType: 'Metric Type (optional)', cap: 'Cap (optional)', floor: 'Floor (optional)',
  processorType: 'Processor Type (optional)', thresholdBands: 'Threshold Bands (optional)',
}

export default function ImportWizardModal({ open, onClose, actor, onImported }) {
  const [step, setStep] = useState('upload')
  const [name, setName] = useState('')
  const [rows, setRows] = useState([])
  const [headers, setHeaders] = useState([])
  const [detection, setDetection] = useState(null)
  const [mapping, setMapping] = useState(null)
  const [profile, setProfile] = useState(null)
  const [rowIssues, setRowIssues] = useState([])
  const [report, setReport] = useState(null)
  const [busy, setBusy] = useState(false)
  const [fileError, setFileError] = useState(null)
  const toast = useToastStore()

  if (!open) return null

  const reset = () => {
    setStep('upload'); setName(''); setRows([]); setHeaders([]); setDetection(null)
    setMapping(null); setProfile(null); setRowIssues([]); setReport(null); setBusy(false); setFileError(null)
  }

  const handleClose = () => { if (!busy) { reset(); onClose?.() } }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileError(null)
    setBusy(true)
    try {
      const parsedRows = await readSheetRows(file)
      if (!parsedRows.length) throw new Error('The file has no data rows')
      const hdrs = Object.keys(parsedRows[0])
      const det = detectImportTemplate(hdrs)
      setRows(parsedRows)
      setHeaders(hdrs)
      setDetection(det)
      setMapping(buildColumnMapping(det))
      setStep('mapping')
    } catch (err) {
      setFileError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleMappingChange = (field, header) => {
    setMapping((m) => ({ ...m, [field]: header || null }))
  }

  const handleBuildPreview = () => {
    const { profile: built, rowIssues: issues } = buildProfileFromImportRows(rows, mapping, {
      name: name.trim() || 'Imported Profile',
      createdBy: actor?.uid,
    })
    setProfile(built)
    setRowIssues(issues)
    setStep('preview')
  }

  const handleRunValidation = () => {
    const r = buildImportValidationReport(profile)
    setReport(r)
    setStep('report')
  }

  const handleSaveDraft = async () => {
    if (!canSaveImportedProfile(report)) return
    setBusy(true)
    try {
      const root = profile.root
      await createProfileDocument({
        id:      profile.metadata.id,
        name:    profile.metadata.name,
        version: profile.metadata.version,
        // Hardcoded DRAFT — defense in depth on top of the kernel's own
        // forced-DRAFT output. Imported profiles are never auto-activated.
        status:  'DRAFT',
        scope:   profile.metadata.scope,
        metadata: {
          description: profile.metadata.description,
          scope:        profile.metadata.scope,
          validFrom:    profile.metadata.validFrom,
        },
        hierarchy:  summarizeHierarchy(root),
        processors: summarizeProcessors(root),
        validationSummary: {
          valid: report.valid, issueCount: report.issues.length,
          errorCount: report.blockingIssues.length,
          warningCount: report.issues.length - report.blockingIssues.length,
          lastValidatedAt: new Date().toISOString(),
        },
        simulationSummary: null,
        hash: calculateProfileHash(profile),
        createdBy:   actor?.uid,
        approvedBy:  null,
        publishedBy: null,
        publishedAt: null,
      }, actor)

      toast.success('Profile imported as Draft')
      onImported?.()
      reset()
      onClose?.()
    } catch (err) {
      toast.error(normalizeError(err).message)
    } finally {
      setBusy(false)
    }
  }

  const stepIndex = STEPS.indexOf(step)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />
      <div
        className="relative w-full max-w-lg animate-scale-in rounded-xl p-5"
        style={{
          background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)',
          maxHeight: '85vh', overflowY: 'auto',
        }}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                 style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
              <FileSpreadsheet className="w-4 h-4" style={{ color: '#818cf8' }} strokeWidth={1.75} />
            </div>
            <div>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                Import Profile (Excel/CSV)
              </h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Step {stepIndex + 1} of {STEPS.length} — always saves as Draft
              </p>
            </div>
          </div>
          <button type="button" onClick={handleClose} disabled={busy} aria-label="Close"
                  className="btn btn-ghost btn-icon -mt-0.5 -mr-0.5 opacity-50 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {step === 'upload' && (
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
              Profile Name
            </label>
            <input
              type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Q3 Pharmacist Standard"
              style={{
                width: '100%', fontSize: '12px', padding: '7px 10px', borderRadius: '8px',
                background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)',
                marginBottom: '14px', boxSizing: 'border-box',
              }}
            />
            <label style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
              padding: '24px', borderRadius: '10px', border: '1px dashed var(--border-default)',
              cursor: 'pointer', textAlign: 'center',
            }}>
              <Upload className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Click to upload .xlsx or .csv</span>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>One row per rule — basket/element/rule columns</span>
              <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} disabled={busy} style={{ display: 'none' }} />
            </label>
            {busy && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>Reading file…</div>}
            {fileError && (
              <div style={{ fontSize: '11px', color: '#f87171', marginTop: '8px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                <AlertTriangle className="w-3 h-3" /> {fileError}
              </div>
            )}
          </div>
        )}

        {step === 'mapping' && mapping && (
          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px' }}>
              {detection?.detected
                ? 'Template auto-detected — review the mapping below.'
                : 'Could not auto-detect every required column — map them manually.'}
            </div>
            {IMPORT_CANONICAL_FIELDS.map((field) => (
              <div key={field} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <span style={{ fontSize: '11px', width: '160px', flexShrink: 0, color: 'var(--text-secondary)' }}>
                  {FIELD_LABELS[field]}{IMPORT_REQUIRED_FIELDS.includes(field) ? ' *' : ''}
                </span>
                <select
                  value={mapping[field] ?? ''}
                  onChange={(e) => handleMappingChange(field, e.target.value)}
                  style={{
                    flex: 1, fontSize: '11px', padding: '5px 6px', borderRadius: '6px',
                    background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)',
                  }}
                >
                  <option value="">— none —</option>
                  {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
            <div className="flex gap-2.5 mt-4">
              <button type="button" onClick={() => setStep('upload')} className="btn btn-secondary flex-1 justify-center text-xs">
                <ArrowLeft className="w-3 h-3" /> Back
              </button>
              <button
                type="button" onClick={handleBuildPreview}
                disabled={!isColumnMappingComplete(mapping)}
                className="flex-1 justify-center text-xs btn btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                Preview <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {step === 'preview' && profile && (
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-primary)', marginBottom: '8px', fontWeight: 600 }}>
              Parsed Profile Preview
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
              {profile.root.baskets.length} basket(s) ·{' '}
              {profile.root.baskets.reduce((s, b) => s + (b.elements?.length ?? 0), 0)} element(s) ·{' '}
              {profile.root.baskets.reduce((s, b) => s + (b.elements ?? []).reduce((s2, e) => s2 + (e.rules?.length ?? 0), 0), 0)} rule(s)
            </div>
            {profile.root.baskets.map((b) => (
              <div key={b.id} style={{ fontSize: '11px', color: 'var(--text-secondary)', padding: '4px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <strong style={{ color: 'var(--text-primary)' }}>{b.label}</strong> (weight {b.weight}) — {b.elements.length} element(s)
              </div>
            ))}
            {rowIssues.length > 0 && (
              <div style={{ marginTop: '10px', fontSize: '11px', color: '#fbbf24' }}>
                {rowIssues.map((iss, i) => <div key={i}>{iss}</div>)}
              </div>
            )}
            <div className="flex gap-2.5 mt-4">
              <button type="button" onClick={() => setStep('mapping')} className="btn btn-secondary flex-1 justify-center text-xs">
                <ArrowLeft className="w-3 h-3" /> Back
              </button>
              <button type="button" onClick={handleRunValidation} className="flex-1 justify-center text-xs btn btn-primary"
                      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                Run Validation <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {step === 'report' && report && (
          <div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px',
              padding: '8px 10px', borderRadius: '8px',
              background: report.valid ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
              border: `1px solid ${report.valid ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
            }}>
              {report.valid
                ? <CheckCircle2 className="w-4 h-4" style={{ color: '#10b981' }} />
                : <AlertTriangle className="w-4 h-4" style={{ color: '#f87171' }} />}
              <span style={{ fontSize: '12px', color: 'var(--text-primary)' }}>
                {report.valid ? 'Ready to save as Draft' : `${report.blockingIssues.length} blocking issue(s) — save disabled`}
              </span>
            </div>
            <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
              {report.issues.map((iss, i) => (
                <div key={i} style={{
                  fontSize: '11px', padding: '4px 0', borderBottom: '1px solid var(--border-subtle)',
                  color: iss.severity === 'error' ? '#f87171' : '#fbbf24',
                }}>
                  [{iss.severity}] {iss.code}: {iss.message}
                </div>
              ))}
              {report.issues.length === 0 && (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>No issues found</div>
              )}
            </div>
            <div className="flex gap-2.5 mt-4">
              <button type="button" onClick={() => setStep('preview')} disabled={busy} className="btn btn-secondary flex-1 justify-center text-xs">
                <ArrowLeft className="w-3 h-3" /> Back
              </button>
              <button
                type="button" onClick={handleSaveDraft}
                disabled={busy || !canSaveImportedProfile(report)}
                className="flex-1 justify-center text-xs btn btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {busy && <Loader2 className="w-3 h-3 animate-spin" />}
                {busy ? 'Saving…' : 'Save as Draft'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
