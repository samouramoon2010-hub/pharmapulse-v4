// ============================================================
// AI Data Intake — /ai-intake (Universal AI Intake, Phase 1)
//
// A single front door for Excel/CSV/pasted-text/PDF/image intake
// across 8 entity types, sitting entirely on top of the existing,
// already-secure Data Exchange import pipeline (import_jobs +
// per-domain adapters + Firestore-rules admin-only gating). No
// parallel backend, no new collection. Admin-only, same as Data
// Exchange Studio.
//
// Step machine: source -> detect -> preview -> approve -> result.
// No write occurs before the user explicitly approves (see the
// approve step) — validation/preview only ever reads.
// ============================================================
import React, { useState, useMemo, useCallback, useEffect } from 'react'
import {
  Sparkles, Upload, FileText, Image as ImageIcon, ClipboardPaste,
  CheckCircle2, AlertTriangle, XCircle, Loader2, ArrowRight, ArrowLeft, Bot,
} from 'lucide-react'
import * as XLSX from 'xlsx'

import { useAuthStore } from '../../store/authStore'
import EmptyState from '../../components/ui/EmptyState'
import { listRecentImportJobs } from '../../services/dataExchange/firestoreStagingRepository'

import { detectEntityType } from '../../services/dataExchange/entityDetection'
import { parsePastedText } from '../../services/dataExchange/textIntakeParser'
import { extractPdfText, PDF_REQUIRES_OCR_MESSAGE } from '../../services/dataExchange/pdfIntakeParser'
import { extractFromImage } from '../../services/dataExchange/imageIntakeAdapter'
import {
  fetchIntakeExistingData, createAdapterForDomain,
  SUPPORTED_INTAKE_DOMAINS, INTAKE_DOMAIN_LABELS,
} from '../../services/dataExchange/intakeDomainRegistry'
import {
  withIntakeMeta, withApproval, withExecution, toProposedAction,
} from '../../services/dataExchange/intakeSessionTypes'
import {
  findUnresolvedHeaders, applyManualHeaderMapping, DOMAIN_FIELD_LABELS,
} from '../../services/dataExchange/headerResolution'
import { createImportJob, runValidation, commitJob } from '../../services/dataExchange/importJobEngine'

// Above this many candidate rows, a normal confirm click is not enough —
// the admin must type the literal phrase, matching the spec's high-volume
// approval requirement.
const APPROVE_PHRASE_THRESHOLD = 50
const APPROVE_PHRASE = 'APPROVE IMPORT'

const STEPS = ['source', 'detect', 'preview', 'approve', 'result']

function StepHeader({ step }) {
  const labels = { source: 'Upload', detect: 'Detect & Map', preview: 'Preview', approve: 'Approve', result: 'Result' }
  const idx = STEPS.indexOf(step)
  return (
    <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
      {STEPS.map((s, i) => (
        <div key={s} style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 600,
          background: i === idx ? 'var(--brand-500)' : i < idx ? 'rgba(34,197,94,0.12)' : 'var(--bg-overlay)',
          color: i === idx ? '#09090b' : i < idx ? '#22c55e' : 'var(--text-muted)',
        }}>
          {i < idx && <CheckCircle2 style={{ width: 11, height: 11 }} />}
          {labels[s]}
        </div>
      ))}
    </div>
  )
}

function Card({ children, style }) {
  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
      borderRadius: '12px', padding: '16px', ...style,
    }}>
      {children}
    </div>
  )
}

async function parseExcelFile(file) {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const sheetNames = wb.SheetNames
  const sheets = {}
  for (const name of sheetNames) {
    sheets[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '' })
  }
  return { sheetNames, sheets }
}

function rowsToHeaderRow(rows) {
  const set = new Set()
  for (const row of rows) for (const key of Object.keys(row)) set.add(key)
  return [...set]
}

export default function AiIntakePage() {
  const { userProfile } = useAuthStore()
  const [step, setStep] = useState('source')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // ── Source state ──────────────────────────────────────────
  const [sourceType, setSourceType] = useState(null)   // 'EXCEL' | 'CSV' | 'TEXT' | 'PDF' | 'IMAGE'
  const [sourceFileName, setSourceFileName] = useState('')
  const [sourceMimeType, setSourceMimeType] = useState('')
  const [pastedText, setPastedText] = useState('')
  const [sheetNames, setSheetNames] = useState([])
  const [sheetsByName, setSheetsByName] = useState({})
  const [selectedSheet, setSelectedSheet] = useState('')
  const [parsedRows, setParsedRows] = useState([])
  const [headerRow, setHeaderRow] = useState([])
  const [imageUnsupported, setImageUnsupported] = useState('')

  // ── Detect / map state ─────────────────────────────────────
  const [detection, setDetection] = useState(null)
  const [selectedDomain, setSelectedDomain] = useState('')
  const [manualMapping, setManualMapping] = useState({})

  // ── Validation / preview state ─────────────────────────────
  const [job, setJob] = useState(null)
  const [rows, setRows] = useState([])
  const [summary, setSummary] = useState(null)
  const [excludedRowIds, setExcludedRowIds] = useState(new Set())
  const [filter, setFilter] = useState('all')

  // ── Approve / result state ─────────────────────────────────
  const [approvalText, setApprovalText] = useState('')
  const [executionResult, setExecutionResult] = useState(null)

  const guardCtx = userProfile
    ? { uid: userProfile.uid, role: userProfile.role, pharmacyId: userProfile.pharmacyId ?? null }
    : null

  const reset = useCallback(() => {
    setStep('source'); setBusy(false); setError('')
    setSourceType(null); setSourceFileName(''); setSourceMimeType('')
    setPastedText(''); setSheetNames([]); setSheetsByName({}); setSelectedSheet('')
    setParsedRows([]); setHeaderRow([]); setImageUnsupported('')
    setDetection(null); setSelectedDomain(''); setManualMapping({})
    setJob(null); setRows([]); setSummary(null); setExcludedRowIds(new Set()); setFilter('all')
    setApprovalText(''); setExecutionResult(null)
  }, [])

  // ── Step 1: source ─────────────────────────────────────────

  const handleFile = useCallback(async (file) => {
    setError(''); setBusy(true)
    try {
      setSourceFileName(file.name)
      setSourceMimeType(file.type)
      const lowerName = file.name.toLowerCase()

      if (lowerName.endsWith('.pdf')) {
        setSourceType('PDF')
        const buf = await file.arrayBuffer()
        const result = await extractPdfText(buf)
        if (result.status === 'REQUIRES_OCR') { setError(PDF_REQUIRES_OCR_MESSAGE); return }
        if (result.status === 'PASSWORD_PROTECTED') { setError(result.message); return }
        if (result.status === 'PARSE_ERROR') { setError(result.message); return }
        // Text-based PDF: try each page's text through the same
        // plain-text parser used for pasted text (TSV/CSV/JSON/KV-blocks).
        const combined = result.pageText.join('\n')
        const textResult = parsePastedText(combined)
        if (textResult.format === 'UNRECOGNIZED' || textResult.rows.length === 0) {
          setError('This PDF’s extracted text does not look like tabular data. Try pasting the relevant section as text instead.')
          return
        }
        setParsedRows(textResult.rows)
        setHeaderRow(textResult.headerRow)
      } else if (/\.(png|jpe?g|webp|gif|bmp)$/.test(lowerName)) {
        setSourceType('IMAGE')
        const buf = await file.arrayBuffer()
        const outcome = await extractFromImage({ fileName: file.name, mimeType: file.type, data: buf })
        if (outcome.status !== 'EXTRACTED') {
          setImageUnsupported(outcome.message)
          return
        }
        const rawRows = outcome.rows.map((r) => r.rawValues)
        setParsedRows(rawRows)
        setHeaderRow(rowsToHeaderRow(rawRows))
      } else if (lowerName.endsWith('.csv')) {
        setSourceType('CSV')
        const { sheetNames: names, sheets } = await parseExcelFile(file)
        const first = names[0]
        setSheetNames(names); setSheetsByName(sheets); setSelectedSheet(first)
        setParsedRows(sheets[first]); setHeaderRow(rowsToHeaderRow(sheets[first]))
      } else if (/\.(xlsx|xls)$/.test(lowerName)) {
        setSourceType('EXCEL')
        const { sheetNames: names, sheets } = await parseExcelFile(file)
        const first = names[0]
        setSheetNames(names); setSheetsByName(sheets); setSelectedSheet(first)
        setParsedRows(sheets[first]); setHeaderRow(rowsToHeaderRow(sheets[first]))
      } else {
        setError('Unsupported file type. Upload .xlsx, .xls, .csv, .pdf, or an image, or paste text below.')
        return
      }
      setStep('detect')
    } catch (e) {
      setError(e?.message ?? 'Could not read this file.')
    } finally {
      setBusy(false)
    }
  }, [])

  const handleSheetChange = useCallback((name) => {
    setSelectedSheet(name)
    const sheetRows = sheetsByName[name] ?? []
    setParsedRows(sheetRows)
    setHeaderRow(rowsToHeaderRow(sheetRows))
  }, [sheetsByName])

  const handlePasteSubmit = useCallback(() => {
    setError('')
    const result = parsePastedText(pastedText)
    if (result.format === 'UNRECOGNIZED' || result.rows.length === 0) {
      setError('This text doesn’t look like JSON, tab/comma-separated data, or key: value blocks. Try a different format.')
      return
    }
    setSourceType('TEXT')
    setParsedRows(result.rows)
    setHeaderRow(result.headerRow)
    setStep('detect')
  }, [pastedText])

  // ── Step 2: detect + map ────────────────────────────────────

  const runDetection = useCallback(() => {
    const result = detectEntityType(headerRow)
    setDetection(result)
    setSelectedDomain(result.best?.domain ?? '')
  }, [headerRow])

  useMemo(() => { if (step === 'detect' && !detection && headerRow.length > 0) runDetection() }, [step, detection, headerRow, runDetection])

  const unresolvedHeaders = useMemo(
    () => (selectedDomain ? findUnresolvedHeaders(selectedDomain, headerRow) : []),
    [selectedDomain, headerRow],
  )
  const domainFieldLabels = DOMAIN_FIELD_LABELS[selectedDomain] ?? {}

  const runDetectValidation = useCallback(async () => {
    if (!selectedDomain || !guardCtx) return
    setBusy(true); setError('')
    try {
      const mappedRows = Object.keys(manualMapping).length > 0
        ? applyManualHeaderMapping(selectedDomain, parsedRows, manualMapping)
        : parsedRows

      const existing = await fetchIntakeExistingData()
      const adapter = createAdapterForDomain(selectedDomain, existing, guardCtx, userProfile.role)

      let newJob = createImportJob({ jobId: `ai-intake-${Date.now()}`, domain: selectedDomain, createdBy: guardCtx.uid })
      newJob = withIntakeMeta(newJob, {
        sourceType, sourceFileName: sourceFileName || undefined, sourceMimeType: sourceMimeType || undefined,
        selectedSheet: selectedSheet || undefined, detectionConfidence: detection?.best?.confidence,
      })

      const rawRows = mappedRows.map((r, i) => adapter.parseRow(r, i + 1, { domain: selectedDomain }))
      const vCtx = { actorUid: guardCtx.uid, actorRole: userProfile.role }
      const aCtx = { actorUid: guardCtx.uid, actorRole: userProfile.role }
      const { job: validatedJob, rows: stagedRows, summary: validationSummary } =
        await runValidation(newJob, adapter, rawRows, vCtx, aCtx)

      setJob(validatedJob)
      setRows(stagedRows)
      setSummary(validationSummary)
      setExcludedRowIds(new Set())
      setStep('preview')
    } catch (e) {
      setError(e?.message ?? 'Validation failed.')
    } finally {
      setBusy(false)
    }
  }, [selectedDomain, guardCtx, manualMapping, parsedRows, sourceType, sourceFileName, sourceMimeType, selectedSheet, detection, userProfile])

  // ── Step 3: preview ─────────────────────────────────────────

  const visibleRows = useMemo(() => {
    if (filter === 'all') return rows
    if (filter === 'valid') return rows.filter((r) => r.classification === 'VALID')
    if (filter === 'warnings') return rows.filter((r) => r.classification === 'WARNING')
    if (filter === 'invalid') return rows.filter((r) => r.classification === 'ERROR')
    if (filter === 'duplicates') return rows.filter((r) => r.classification === 'DUPLICATE')
    if (filter === 'create') return rows.filter((r) => toProposedAction(r.classification) === 'create')
    if (filter === 'update') return rows.filter((r) => toProposedAction(r.classification) === 'update')
    if (filter === 'skip') return rows.filter((r) => toProposedAction(r.classification) === 'skip')
    return rows
  }, [rows, filter])

  const toggleExclude = useCallback((rowId) => {
    setExcludedRowIds((prev) => {
      const next = new Set(prev)
      if (next.has(rowId)) next.delete(rowId); else next.add(rowId)
      return next
    })
  }, [])

  const committableRows = useMemo(
    () => rows.filter((r) => !excludedRowIds.has(r.rowId) && (r.classification === 'VALID' || r.classification === 'WARNING' || r.classification === 'UPDATE')),
    [rows, excludedRowIds],
  )

  const requiresApprovalPhrase = committableRows.length > APPROVE_PHRASE_THRESHOLD

  // ── Step 4/5: approve + execute ──────────────────────────────

  const canApprove = requiresApprovalPhrase ? approvalText.trim() === APPROVE_PHRASE : true

  const handleApproveAndExecute = useCallback(async () => {
    if (!canApprove || !job || !guardCtx) return
    setBusy(true); setError('')
    try {
      const approvedJob = withApproval(job, new Date().toISOString())
      const existing = await fetchIntakeExistingData()
      const adapter = createAdapterForDomain(selectedDomain, existing, guardCtx, userProfile.role)
      const commitCtx = { actorUid: guardCtx.uid, actorRole: userProfile.role, jobId: approvedJob.jobId }
      const { job: finalJob, result } = await commitJob(approvedJob, adapter, committableRows, commitCtx, { chunkSize: 1 })
      const executedJob = withExecution(finalJob, new Date().toISOString())
      setJob(executedJob)
      setExecutionResult(result)
      setStep('result')
    } catch (e) {
      setError(e?.message ?? 'Execution failed.')
    } finally {
      setBusy(false)
    }
  }, [canApprove, job, guardCtx, selectedDomain, committableRows, userProfile])

  // ── Render ───────────────────────────────────────────────────

  return (
    <div style={{ padding: '24px', maxWidth: '960px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          <Sparkles style={{ width: 18, height: 18, color: 'var(--text-muted)' }} />
          AI Data Intake
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
          Upload or paste data for Regions, Groups, Pharmacies, Users, Assignments, KPI Definitions, KPI Targets, or KPI Actuals.
          Nothing is written until you explicitly approve.
        </p>
      </div>

      <StepHeader step={step} />

      {error && (
        <div style={{ display: 'flex', gap: '8px', padding: '10px 14px', borderRadius: '8px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', fontSize: '12px', color: '#f87171' }}>
          <AlertTriangle style={{ width: 14, height: 14, flexShrink: 0, marginTop: 1 }} />
          {error}
        </div>
      )}

      {step === 'source' && (
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <label
              htmlFor="ai-intake-file-input"
              style={{
                border: '1px dashed var(--border-default)', borderRadius: '10px', padding: '28px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                cursor: 'pointer', textAlign: 'center',
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f) }}
            >
              <Upload style={{ width: 20, height: 20, color: 'var(--text-muted)' }} />
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Drag a file here, or click to choose</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>.xlsx, .xls, .csv, .pdf, or an image</div>
              <input
                id="ai-intake-file-input" type="file" style={{ display: 'none' }}
                accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.webp"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
              />
            </label>

            {imageUnsupported && (
              <div style={{ display: 'flex', gap: '8px', padding: '10px 14px', borderRadius: '8px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', fontSize: '12px', color: '#f59e0b' }}>
                <ImageIcon style={{ width: 14, height: 14, flexShrink: 0, marginTop: 1 }} />
                {imageUnsupported}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '11px' }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
              or paste text
              <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
            </div>

            <textarea
              value={pastedText} onChange={(e) => setPastedText(e.target.value)}
              placeholder={'Paste a JSON array, a tab/comma-separated table, or key: value blocks…'}
              rows={6}
              style={{
                width: '100%', borderRadius: '8px', border: '1px solid var(--border-default)',
                background: 'var(--bg-overlay)', color: 'var(--text-primary)', padding: '10px', fontSize: '12px',
                fontFamily: 'monospace', resize: 'vertical',
              }}
            />
            <button
              onClick={handlePasteSubmit} disabled={!pastedText.trim() || busy}
              className="btn btn-primary" style={{ alignSelf: 'flex-start', fontSize: '12px' }}
            >
              <ClipboardPaste style={{ width: 13, height: 13 }} /> Parse pasted text
            </button>
          </div>
        </Card>
      )}

      {step === 'detect' && (
        <Card style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {sheetNames.length > 1 && (
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>Sheet</div>
              <select value={selectedSheet} onChange={(e) => handleSheetChange(e.target.value)} className="input" style={{ fontSize: '12px' }}>
                {sheetNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          )}

          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Detected data type {detection?.best ? `— ${detection.best.confidence}% confidence` : '(none recognized — choose manually)'}
            </div>
            <select value={selectedDomain} onChange={(e) => setSelectedDomain(e.target.value)} className="input" style={{ fontSize: '12px' }}>
              <option value="">Select data type…</option>
              {SUPPORTED_INTAKE_DOMAINS.map((d) => <option key={d} value={d}>{INTAKE_DOMAIN_LABELS[d]}</option>)}
            </select>
          </div>

          {unresolvedHeaders.length > 0 && selectedDomain && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ fontSize: '11px', color: '#f59e0b' }}>
                {unresolvedHeaders.length} column(s) not recognized — map manually or leave unmapped:
              </div>
              {unresolvedHeaders.map((header) => (
                <div key={header} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                  <code style={{ fontSize: '11px', background: 'var(--bg-overlay)', padding: '2px 6px', borderRadius: '4px' }}>{header}</code>
                  <ArrowRight style={{ width: 12, height: 12, color: 'var(--text-muted)' }} />
                  <select
                    value={manualMapping[header] ?? ''}
                    onChange={(e) => setManualMapping((prev) => ({ ...prev, [header]: e.target.value }))}
                    className="input" style={{ fontSize: '11px' }}
                  >
                    <option value="">Unmapped</option>
                    {Object.entries(domainFieldLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}

          {parsedRows.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No rows found in this source"
              description="The selected sheet/source has no data rows. Choose a different sheet or go back and try another source."
              compact
            />
          ) : (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{parsedRows.length} row(s) detected from this source.</div>
          )}

          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setStep('source')} className="btn btn-secondary" style={{ fontSize: '12px' }}>
              <ArrowLeft style={{ width: 12, height: 12 }} /> Back
            </button>
            <button
              onClick={runDetectValidation} disabled={!selectedDomain || busy || parsedRows.length === 0}
              className="btn btn-primary" style={{ fontSize: '12px' }}
            >
              {busy ? <Loader2 style={{ width: 13, height: 13, animation: 'spin 1s linear infinite' }} /> : <ArrowRight style={{ width: 13, height: 13 }} />}
              Validate & preview
            </button>
          </div>
        </Card>
      )}

      {step === 'preview' && summary && (
        <Card style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px' }}>
            {[
              { label: 'Total', value: summary.totalRows },
              { label: 'Valid', value: summary.valid, color: '#22c55e' },
              { label: 'Warnings', value: summary.warning, color: '#f59e0b' },
              { label: 'Invalid', value: summary.error, color: '#f87171' },
              { label: 'Duplicates', value: summary.duplicate, color: '#a1a1aa' },
              { label: 'Conflicts', value: summary.conflict, color: '#f87171' },
              { label: 'Updates', value: summary.update, color: '#60a5fa' },
              { label: 'Skipped', value: summary.skip, color: '#a1a1aa' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ padding: '8px 10px', borderRadius: '8px', background: 'var(--bg-overlay)' }}>
                <div style={{ fontSize: '16px', fontWeight: 700, color: color ?? 'var(--text-primary)' }}>{value}</div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {['all', 'valid', 'warnings', 'invalid', 'duplicates', 'create', 'update', 'skip'].map((f) => (
              <button
                key={f} onClick={() => setFilter(f)}
                className="btn btn-ghost btn-sm"
                style={{ fontSize: '11px', background: filter === f ? 'var(--bg-overlay)' : 'transparent' }}
              >
                {f}
              </button>
            ))}
          </div>

          <div style={{ maxHeight: '360px', overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: '8px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <th style={{ padding: '6px 8px', textAlign: 'left' }}>Row</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left' }}>Action</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left' }}>Status</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left' }}>Notes</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left' }}>Include</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => (
                  <tr key={r.rowId} style={{ borderBottom: '1px solid var(--border-subtle)', opacity: excludedRowIds.has(r.rowId) ? 0.4 : 1 }}>
                    <td style={{ padding: '6px 8px' }}>{r.rowIndex}</td>
                    <td style={{ padding: '6px 8px', textTransform: 'capitalize' }}>{toProposedAction(r.classification)}</td>
                    <td style={{ padding: '6px 8px' }}>{r.classification}</td>
                    <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>
                      {r.issues.map((i) => i.message).join('; ') || '—'}
                    </td>
                    <td style={{ padding: '6px 8px' }}>
                      <input type="checkbox" checked={!excludedRowIds.has(r.rowId)} onChange={() => toggleExclude(r.rowId)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setStep('detect')} className="btn btn-secondary" style={{ fontSize: '12px' }}>
              <ArrowLeft style={{ width: 12, height: 12 }} /> Back
            </button>
            <button
              onClick={() => setStep('approve')} disabled={committableRows.length === 0}
              className="btn btn-primary" style={{ fontSize: '12px' }}
            >
              Continue to approval ({committableRows.length} row(s))
            </button>
          </div>
        </Card>
      )}

      {step === 'approve' && (
        <Card style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
            You are about to import <strong>{committableRows.length}</strong> row(s) into <strong>{INTAKE_DOMAIN_LABELS[selectedDomain]}</strong>.
          </div>
          <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: 'var(--text-secondary)' }}>
            <li>{rows.filter((r) => toProposedAction(r.classification) === 'create').length} new record(s)</li>
            <li>{rows.filter((r) => toProposedAction(r.classification) === 'update').length} updated record(s)</li>
            <li>{rows.length - committableRows.length} row(s) skipped/excluded/invalid</li>
          </ul>

          {requiresApprovalPhrase ? (
            <div>
              <div style={{ fontSize: '12px', color: '#f59e0b', marginBottom: '6px' }}>
                This is a high-volume import ({committableRows.length} rows). Type <code>{APPROVE_PHRASE}</code> to continue.
              </div>
              <input
                value={approvalText} onChange={(e) => setApprovalText(e.target.value)}
                className="input" style={{ fontSize: '12px' }} placeholder={APPROVE_PHRASE}
              />
            </div>
          ) : null}

          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setStep('preview')} className="btn btn-secondary" style={{ fontSize: '12px' }}>
              <ArrowLeft style={{ width: 12, height: 12 }} /> Back
            </button>
            <button
              onClick={handleApproveAndExecute} disabled={!canApprove || busy}
              className="btn btn-primary" style={{ fontSize: '12px' }}
            >
              {busy ? <Loader2 style={{ width: 13, height: 13, animation: 'spin 1s linear infinite' }} /> : <CheckCircle2 style={{ width: 13, height: 13 }} />}
              Approve & import
            </button>
          </div>
        </Card>
      )}

      {step === 'result' && executionResult && (
        <Card style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 600, color: executionResult.failed > 0 ? '#f59e0b' : '#22c55e' }}>
            {executionResult.failed > 0 ? <AlertTriangle style={{ width: 16, height: 16 }} /> : <CheckCircle2 style={{ width: 16, height: 16 }} />}
            {job?.status === 'COMPLETED' ? 'Import completed' : job?.status === 'PARTIALLY_COMPLETED' ? 'Import partially completed' : 'Import finished'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px' }}>
            <div style={{ padding: '8px 10px', borderRadius: '8px', background: 'var(--bg-overlay)' }}>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#22c55e' }}>{executionResult.committed}</div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Committed</div>
            </div>
            <div style={{ padding: '8px 10px', borderRadius: '8px', background: 'var(--bg-overlay)' }}>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#f87171' }}>{executionResult.failed}</div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Failed</div>
            </div>
            <div style={{ padding: '8px 10px', borderRadius: '8px', background: 'var(--bg-overlay)' }}>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>{executionResult.skipped}</div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Skipped</div>
            </div>
          </div>
          <button onClick={reset} className="btn btn-primary" style={{ fontSize: '12px', alignSelf: 'flex-start' }}>
            Start a new intake
          </button>
        </Card>
      )}

      <ConnectorSessionsSection />
    </div>
  )
}

// ── Connector Sessions — read-only (Phase 2 foundation) ─────────────
// Lists sessions created by the connector (Netlify Function), not this
// browser page — recognizable by intakeSourceType being one of the
// connector's origin+format values. Reuses the exact same client-side
// read (listRecentImportJobs) already used by Data Exchange Studio's
// Import History section — no new access path, no writes.
const CONNECTOR_SOURCE_TYPES = new Set([
  'chatgpt_structured', 'excel_extracted', 'csv_extracted', 'pdf_extracted', 'image_extracted', 'plain_text_extracted',
])

function ConnectorSessionsSection() {
  const [sessions, setSessions] = useState(null)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let cancelled = false
    listRecentImportJobs(25)
      .then((jobs) => {
        if (cancelled) return
        setSessions(jobs.filter((j) => CONNECTOR_SOURCE_TYPES.has(j.intakeSourceType)))
      })
      .catch((e) => { if (!cancelled) setLoadError(e?.message ?? 'Failed to load connector sessions') })
    return () => { cancelled = true }
  }, [])

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <Bot style={{ width: 15, height: 15, color: 'var(--text-muted)' }} />
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Connector Sessions</div>
      </div>

      {loadError && <div style={{ fontSize: '12px', color: '#f87171' }}>{loadError}</div>}

      {!loadError && sessions == null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
          <Loader2 style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} /> Loading…
        </div>
      )}

      {!loadError && sessions && sessions.length === 0 && (
        <EmptyState
          icon={Bot} compact
          title="No connector sessions yet"
          description="Sessions created by ChatGPT (via the secure connector) will appear here — source marked as ChatGPT Connector, with approval and execution status."
        />
      )}

      {!loadError && sessions && sessions.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ padding: '6px 8px' }}>Source</th>
                <th style={{ padding: '6px 8px' }}>Entity</th>
                <th style={{ padding: '6px 8px' }}>Status</th>
                <th style={{ padding: '6px 8px' }}>Approved</th>
                <th style={{ padding: '6px 8px' }}>Executed</th>
                <th style={{ padding: '6px 8px' }}>Audit Reference</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.jobId} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '6px 8px' }}>ChatGPT Connector</td>
                  <td style={{ padding: '6px 8px' }}>{s.domain}</td>
                  <td style={{ padding: '6px 8px' }}>{s.status}</td>
                  <td style={{ padding: '6px 8px' }}>{s.approvedAt ? new Date(s.approvedAt).toLocaleString() : '—'}</td>
                  <td style={{ padding: '6px 8px' }}>{s.executedAt ? new Date(s.executedAt).toLocaleString() : '—'}</td>
                  <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: '11px' }}>{s.jobId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
