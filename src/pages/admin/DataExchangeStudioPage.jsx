// ============================================================
// Data Exchange Studio — Organization Onboarding (DX-2/DX-3)
//
// Minimal, functional surface to operate the Groups/Branches/
// Pharmacists/Assignments adapters built in DX-1/DX-2/DX-3. Not a
// redesign of ImportCenterPage (which remains the official KPI Actuals
// flow, untouched) — this is a new, separate admin page for the
// organization-onboarding domains only.
//
// Closure Patch Part 5 — Preview/Commit are now two explicit, separate
// steps: Upload/map -> Validate (preview only, zero production writes)
// -> review the per-domain breakdown -> explicit Confirm -> Commit ->
// Results. The Commit button is disabled until validation is complete
// with no blocking ERROR/CONFLICT rows, requires the user to tick an
// explicit confirmation checkbox, and is disabled again the instant a
// commit attempt starts — it cannot fire twice for the same preview.
// ============================================================
import React, { useState, useRef, useCallback, useEffect } from 'react'
import * as XLSX from 'xlsx'
import {
  FileSpreadsheet, Upload, CheckCircle2, AlertTriangle, Loader2, ShieldAlert, Download, History,
  Building2, Target, TrendingUp, Activity,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useToastStore } from '../../components/ui/Toast'
import { resolveSheetMappings, validateOnboardingJob, commitOnboardingJob } from '../../services/dataExchange/onboardingOrchestrator'
import { fetchExistingOnboardingData } from '../../services/dataExchange/fetchExistingOnboardingData'
import { FirestoreStagingRepository, listRecentImportJobs } from '../../services/dataExchange/firestoreStagingRepository'
import MobileRankCard from '../../components/ui/MobileRankCard'
import {
  fetchKpiTargetsExistingData, validateKpiTargetsJob, commitKpiTargetsJob,
} from '../../services/dataExchange/kpiTargetsImportRunner'
import {
  fetchActualsExistingData, validateActualsJob, commitActualsJob, resumeOrRetryActualsJob,
} from '../../services/dataExchange/actualsImportRunner'
import { checkTemplateVersion } from '../../services/dataExchange/templateVersionGuard'
import { checkWorkbookDomain as checkWorkbookDomainPure } from '../../services/dataExchange/templateDomainGuard'
import { extractFileMeta } from '../../services/dataExchange/fileChecksum'
import { TEMPLATE_CATALOG, TEMPLATE_GROUPS, getTemplatesByGroup } from '../../services/dataExchange/templateCatalog'
import { categorizeRow } from '../../services/dataExchange/importErrorTaxonomy'
import { findUnresolvedHeaders, applyManualHeaderMapping, DOMAIN_FIELD_LABELS } from '../../services/dataExchange/headerResolution'
import SmartListImportSection from '../../components/dataExchange/SmartListImportSection'

// DX-8: every uploaded workbook is checked for an unsupported template
// version before any row is parsed into a job. A legacy file with no
// Metadata sheet at all is always supported (see templateVersionGuard.ts).
// Returns the parsed Metadata rows (or null) so callers don't re-parse.
function checkWorkbookTemplateVersion(wb, toast) {
  const metadataRows = wb.SheetNames.includes('Metadata')
    ? XLSX.utils.sheet_to_json(wb.Sheets['Metadata'])
    : undefined
  const result = checkTemplateVersion(metadataRows)
  if (!result.supported) {
    toast.error?.(result.reason)
    return false
  }
  return true
}

// Domain mismatch must be caught BEFORE any import_jobs document is
// created — see templateDomainGuard.ts. A workbook with no Metadata
// sheet (or no Import Domain row) is never rejected here, same
// legacy-tolerant posture as checkWorkbookTemplateVersion above.
function checkWorkbookDomain(wb, selectedDomain, toast) {
  const metadataRows = wb.SheetNames.includes('Metadata')
    ? XLSX.utils.sheet_to_json(wb.Sheets['Metadata'])
    : undefined
  const result = checkWorkbookDomainPure(metadataRows, selectedDomain)
  if (!result.valid) {
    toast.error?.(result.reason)
    return false
  }
  return true
}

const SAFE_IMPORT_VALIDATION_ERROR_MESSAGE =
  'Unable to start import validation. Please retry. If the issue continues, contact support.'

// Raw Firestore/engine errors (e.g. "Function setDoc() called with
// invalid data...") must never reach the user — log full structured
// context for developers instead, then return a safe message to show.
// Never logs workbook contents, row data, or other personal data.
function reportImportJobCreationFailure({ importDomain, selectedImporter, fileName, error }) {
  console.error('[DataExchangeStudioPage] import_job_creation_failed', {
    event:           'import_job_creation_failed',
    importDomain,
    selectedImporter: selectedImporter ?? importDomain,
    fileName,
    browser:  typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    platform: typeof navigator !== 'undefined' ? navigator.platform : 'unknown',
    errorCode:    error?.code,
    errorMessage: error?.message,
  })
  return SAFE_IMPORT_VALIDATION_ERROR_MESSAGE
}

const DOMAIN_LABEL = { GROUP: 'Groups', BRANCH: 'Branches', PHARMACIST: 'Pharmacists', ASSIGNMENT: 'Assignments' }
const DOMAIN_ROW_KEY = { GROUP: 'groupRows', BRANCH: 'branchRows', PHARMACIST: 'pharmacistRows', ASSIGNMENT: 'assignmentRows' }
const PREVIEW_COLUMNS = [
  ['creates', 'Creates'], ['updates', 'Updates'], ['unchanged', 'Unchanged'],
  ['duplicates', 'Duplicates'], ['conflicts', 'Conflicts'], ['errors', 'Errors'],
  ['dependencyBlocked', 'Dependency-blocked'], ['pendingAuthPharmacists', 'Pending-auth pharmacists'],
]

const repo = new FirestoreStagingRepository()

// ============================================================
// Visual primitives — one colored icon identity per section so the
// page reads as a set of distinct, organized tools rather than one
// long undifferentiated form. Pure presentation; no business logic.
// ============================================================
const SECTION_ACCENTS = {
  templateLibrary: { color: '#d97706', bg: 'rgba(217,119,6,0.10)' },   // amber
  health:          { color: '#0d9488', bg: 'rgba(13,148,136,0.10)' }, // teal
  history:         { color: '#64748b', bg: 'rgba(100,116,139,0.10)' },// slate
  onboarding:      { color: '#6366f1', bg: 'rgba(99,102,241,0.10)' }, // indigo
  kpiTargets:      { color: '#8b5cf6', bg: 'rgba(139,92,246,0.10)' }, // violet
  actuals:         { color: '#16a34a', bg: 'rgba(22,163,74,0.10)' },  // green
}

function SectionHeader({ icon: Icon, accent, title, description }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
      <div style={{
        width: 34, height: 34, borderRadius: 9, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: accent.bg, color: accent.color,
      }}>
        <Icon size={17} strokeWidth={2} />
      </div>
      <div>
        <h2 style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--text-primary)', margin: 0 }}>
          {title}
        </h2>
        {description && (
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 3, maxWidth: 640, lineHeight: 1.5 }}>
            {description}
          </p>
        )}
      </div>
    </div>
  )
}

function Card({ children, style }) {
  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
      borderRadius: 12, padding: '18px 20px', marginBottom: 20, ...style,
    }}>
      {children}
    </div>
  )
}

function DomainTabs({ entries, active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border-subtle)', marginBottom: 14, flexWrap: 'wrap' }}>
      {entries.map(([key, label]) => {
        const isActive = active === key
        return (
          <button key={key} onClick={() => onChange(key)} style={{
            padding: '7px 14px', fontSize: 13, fontWeight: isActive ? 600 : 500,
            cursor: 'pointer', border: 'none', background: 'none',
            color: isActive ? 'var(--brand-300)' : 'var(--text-muted)',
            borderBottom: isActive ? '2px solid var(--brand-500)' : '2px solid transparent',
            marginBottom: '-1px', transition: 'color 0.15s, border-color 0.15s',
          }}>
            {label}
          </button>
        )
      })}
    </div>
  )
}

// Lets an admin manually map a source column the alias system didn't
// recognize to one of the domain's known fields, before Validate runs
// — see headerResolution.ts for how the chosen mapping is applied.
function UnresolvedColumnsPanel({ domain, unresolvedHeaders, mapping, onMappingChange }) {
  if (!domain || unresolvedHeaders.length === 0) return null
  const fieldOptions = Object.entries(DOMAIN_FIELD_LABELS[domain] ?? {})
  return (
    <div style={{ marginTop: 10, padding: 12, background: 'rgba(217,119,6,0.08)', border: '1px dashed #d97706', borderRadius: 8 }}>
      <p style={{ fontSize: 12.5, color: '#d97706', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        <AlertTriangle size={14} /> {unresolvedHeaders.length} column(s) weren't automatically recognized — map them below, or leave unmapped to ignore.
      </p>
      <div className="space-y-2">
        {unresolvedHeaders.map((header) => (
          <div key={header} className="flex flex-wrap items-center gap-2">
            <span style={{ minWidth: 140, fontSize: 12.5, color: 'var(--text-secondary)' }}>{header}</span>
            <select
              value={mapping[header] || ''}
              onChange={(e) => onMappingChange(header, e.target.value)}
              style={{ height: 30, fontSize: 12.5 }}
            >
              <option value="">— ignore this column —</option>
              {fieldOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function DataExchangeStudioPage() {
  const { userProfile } = useAuthStore()
  const toast = useToastStore()
  const fileRef = useRef(null)

  const [fileName, setFileName] = useState('')
  const [sheetMappings, setSheetMappings] = useState([])     // [{ sheetName, domain }]
  const [sheetRows, setSheetRows] = useState({})              // sheetName -> rows
  // idle | mapped | validating | previewed | committing | committed | stale
  const [status, setStatus] = useState('idle')
  const [preview, setPreview] = useState(null)                // OnboardingPreviewResult
  const [commitResult, setCommitResult] = useState(null)      // OnboardingJobResult
  const [staleReason, setStaleReason] = useState(null)
  const [confirmed, setConfirmed] = useState(false)
  const [jobPrefix, setJobPrefix] = useState(null)
  const [pendingRows, setPendingRows] = useState(null)        // the OnboardingRows used for this preview
  const [headerMappings, setHeaderMappings] = useState({})    // sheetName -> { sourceHeader: fieldKey }

  const isAdmin = userProfile?.role === 'admin'

  const resetToMapped = () => {
    setPreview(null); setCommitResult(null); setStaleReason(null)
    setConfirmed(false); setJobPrefix(null); setPendingRows(null)
    setStatus('mapped')
  }

  const handleFile = useCallback(async (file) => {
    setFileName(file.name)
    setStatus('idle')
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    if (!checkWorkbookTemplateVersion(wb, toast)) { setStatus('idle'); return }

    // DX-8: every generated template now also carries Metadata/Instructions
    // sheets — neither is a data domain, so both are excluded before sheet
    // -> domain mapping (matches the existing single-domain sections, which
    // already excluded 'Instructions' the same way).
    const dataSheetNames = wb.SheetNames.filter((n) => !['metadata', 'instructions'].includes(n.toLowerCase()))

    const rowsBySheet = {}
    for (const sheetName of dataSheetNames) {
      rowsBySheet[sheetName] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' })
    }
    setSheetRows(rowsBySheet)
    setSheetMappings(resolveSheetMappings(dataSheetNames))
    setHeaderMappings({})
    resetToMapped()
  }, [])

  const onFileChange = (e) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file).catch((err) => toast.error?.(err.message))
  }

  const setMappingDomain = (sheetName, domain) => {
    setSheetMappings((prev) => prev.map((m) => (m.sheetName === sheetName ? { ...m, domain } : m)))
    // The set of unresolved headers is domain-specific — a mapping chosen
    // for one domain is meaningless (and possibly wrong) for another.
    setHeaderMappings((prev) => ({ ...prev, [sheetName]: {} }))
    resetToMapped()
  }

  const setHeaderMapping = (sheetName, sourceHeader, fieldKey) => {
    setHeaderMappings((prev) => ({
      ...prev,
      [sheetName]: { ...(prev[sheetName] || {}), [sourceHeader]: fieldKey },
    }))
    resetToMapped()
  }

  const buildOnboardingRows = () => {
    const rows = {}
    for (const { sheetName, domain } of sheetMappings) {
      if (!domain) continue
      const key = DOMAIN_ROW_KEY[domain]
      const mappedRows = applyManualHeaderMapping(domain, sheetRows[sheetName] || [], headerMappings[sheetName] || {})
      rows[key] = [...(rows[key] || []), ...mappedRows]
    }
    return rows
  }

  const guardCtx = userProfile
    ? { uid: userProfile.uid, role: userProfile.role, pharmacyId: userProfile.pharmacyId ?? null }
    : null

  // ── Step A: Validate / Preview — never writes to production collections ──
  const handleValidate = async () => {
    if (!isAdmin) { toast.error?.('Organization Admin required'); return }
    setStatus('validating')
    setConfirmed(false)
    try {
      const rows = buildOnboardingRows()
      const existing = await fetchExistingOnboardingData()
      const prefix = `dx-${Date.now()}`
      const outcome = await validateOnboardingJob({ jobIdPrefix: prefix, guardCtx, actorRole: userProfile.role, rows, existing }, repo)
      setJobPrefix(prefix)
      setPendingRows(rows)
      setPreview(outcome)
      setStatus('previewed')
    } catch (err) {
      toast.error?.(err.message || 'Validation failed')
      setStatus('mapped')
    }
  }

  // ── Step B: Confirm / Commit — only after explicit confirmation ──
  const handleCommit = async () => {
    if (!preview || !confirmed || status === 'committing') return
    setStatus('committing')
    setStaleReason(null)
    try {
      const freshExisting = await fetchExistingOnboardingData()
      const outcome = await commitOnboardingJob({
        jobIdPrefix: jobPrefix, guardCtx, actorRole: userProfile.role,
        rows: pendingRows, existing: freshExisting,
        expectedPreviewSignature: preview.previewSignature,
      }, repo)

      if (outcome.stale) {
        setStaleReason(outcome.staleReason)
        setStatus('stale')
        return
      }
      setCommitResult(outcome.result)
      setStatus('committed')
    } catch (err) {
      toast.error?.(err.message || 'Commit failed')
      setStatus('previewed')
    }
  }

  const unresolvedSheets = sheetMappings.filter((m) => !m.domain)
  const canCommit = preview?.readyToCommit && confirmed && status === 'previewed'

  return (
    <div style={{ padding: 24, maxWidth: 960 }}>
      <h1 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text-primary)', marginBottom: 20 }}>
        <FileSpreadsheet size={20} /> Data Exchange Studio
      </h1>

      <TemplateLibrarySection isAdmin={isAdmin} />
      <DataExchangeHealthSummary isAdmin={isAdmin} />
      <ImportHistorySection isAdmin={isAdmin} />

      <Card>
        <SectionHeader
          icon={Building2} accent={SECTION_ACCENTS.onboarding}
          title="Organization Onboarding"
          description="Upload a single workbook with Groups / Branches / Pharmacists / Assignments sheets (or separate single-domain files), Validate to preview the exact changes with zero writes, resolve any conflicts, then explicitly confirm to Commit in dependency order. Imported pharmacists are created as pending-invitation operational records — no Firebase Auth account or password is ever created here."
        />

        {!isAdmin && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, background: 'rgba(217,119,6,0.10)', color: '#d97706', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            <AlertTriangle size={16} /> Organization Onboarding bulk import requires the Admin role.
          </div>
        )}

        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFileChange} style={{ display: 'none' }} />
        <button onClick={() => fileRef.current?.click()} disabled={!isAdmin} className="btn btn-secondary btn-sm" style={{ gap: 6 }}>
          <Upload size={14} /> {fileName || 'Upload workbook'}
        </button>

        {sheetMappings.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <h3 style={{ fontSize: 12.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 8 }}>
              Sheet → Domain mapping
            </h3>
            {/* PR-1E4 — two-column key/select rows; a <table> with a
                <select> per cell cramps on phone widths, so this renders
                as stacked flex rows instead (same data, same order, no
                card needed for a 2-field row). */}
            <div className="space-y-2">
              {sheetMappings.map((m) => {
                const headerRow = Object.keys(sheetRows[m.sheetName]?.[0] || {})
                const unresolvedHeaders = m.domain ? findUnresolvedHeaders(m.domain, headerRow) : []
                return (
                  <div key={m.sheetName}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm" style={{ minWidth: '120px', color: 'var(--text-secondary)' }}>{m.sheetName}</span>
                      <select value={m.domain || ''} onChange={(e) => setMappingDomain(m.sheetName, e.target.value || null)} style={{ height: 32, fontSize: 13 }}>
                        <option value="">— unresolved —</option>
                        {Object.entries(DOMAIN_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                      </select>
                    </div>
                    <UnresolvedColumnsPanel
                      domain={m.domain}
                      unresolvedHeaders={unresolvedHeaders}
                      mapping={headerMappings[m.sheetName] || {}}
                      onMappingChange={(header, fieldKey) => setHeaderMapping(m.sheetName, header, fieldKey)}
                    />
                  </div>
                )
              })}
            </div>
            {unresolvedSheets.length > 0 && (
              <p style={{ color: '#d97706', fontSize: 12.5, marginTop: 8 }}>
                {unresolvedSheets.length} sheet(s) need a manual domain selection before validating.
              </p>
            )}
            <button
              onClick={handleValidate}
              disabled={!isAdmin || status === 'validating' || unresolvedSheets.length > 0}
              className="btn btn-primary btn-sm" style={{ marginTop: 10, gap: 6 }}
            >
              {status === 'validating' ? <Loader2 className="spin" size={14} /> : <CheckCircle2 size={14} />}
              Validate (Preview only — no data is written)
            </button>
          </div>
        )}

        {preview && (
          <div style={{ marginTop: 22 }}>
            <h3 style={{ fontSize: 12.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 8 }}>Preview</h3>
            {preview.domains.map((d) => (
              <div key={d.domain} style={{ marginBottom: 10, padding: 12, background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
                <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>{DOMAIN_LABEL[d.domain]}</strong> <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>— {d.totalRows} row(s)</span>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6, fontSize: 12.5, color: 'var(--text-secondary)' }}>
                  {PREVIEW_COLUMNS.map(([key, label]) => d[key] > 0 && (
                    <span key={key} style={(key === 'errors' || key === 'conflicts') ? { color: '#ef4444', fontWeight: 600 } : undefined}>
                      {label}: {d[key]}
                    </span>
                  ))}
                </div>
              </div>
            ))}

            {!preview.readyToCommit && (
              <p style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, marginTop: 10 }}>
                <ShieldAlert size={15} /> This job has blocking errors or unresolved identity conflicts —
                return to mapping, fix the source file, or re-upload before this job can be committed.
              </p>
            )}

            {preview.readyToCommit && status !== 'committed' && (
              <div style={{ marginTop: 12, padding: 12, background: 'var(--bg-hover)', border: '1px dashed var(--border-default)', borderRadius: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text-secondary)' }}>
                  <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={status === 'committing'} />
                  I have reviewed this preview and confirm committing it will write the changes above.
                </label>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button onClick={handleCommit} disabled={!canCommit} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
                    {status === 'committing' ? <Loader2 className="spin" size={14} /> : <CheckCircle2 size={14} />}
                    Confirm &amp; Commit
                  </button>
                  <button onClick={resetToMapped} disabled={status === 'committing'} className="btn btn-ghost btn-sm">
                    Cancel — return to mapping
                  </button>
                </div>
              </div>
            )}

            {status === 'stale' && (
              <div style={{ marginTop: 12, padding: 12, background: 'rgba(217,119,6,0.10)', borderRadius: 8 }}>
                <strong style={{ fontSize: 13, color: '#d97706' }}>Preview is stale.</strong> <span style={{ fontSize: 12.5 }}>{staleReason}</span>
                <div><button onClick={handleValidate} className="btn btn-secondary btn-sm" style={{ marginTop: 8 }}>Revalidate</button></div>
              </div>
            )}
          </div>
        )}

        {status === 'committed' && commitResult && (
          <div style={{ marginTop: 22 }}>
            <h3 style={{ fontSize: 12.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 8 }}>Results</h3>
            {Object.entries(DOMAIN_LABEL).map(([domainKey, label]) => {
            const outcome = commitResult[domainKey === 'GROUP' ? 'groups' : domainKey === 'BRANCH' ? 'branches' : domainKey === 'PHARMACIST' ? 'pharmacists' : 'assignments']
            if (!outcome) return null
            return (
              <div key={domainKey} style={{ marginBottom: 12, padding: 12, background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
                <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>{label}</strong>
                <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}> — status: {outcome.job.status}, committed: {outcome.result.committed}, failed: {outcome.result.failed}, remaining: {outcome.result.remaining}</span>
                {outcome.rows.filter((r) => r.issues.length > 0).slice(0, 20).map((r) => (
                  <div key={r.rowId} style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>
                    Row {r.rowIndex} [{categorizeRow(r.classification, r.issues.map((i) => i.code))}]: {r.issues.map((i) => i.message).join('; ')}
                  </div>
                ))}
              </div>
            )
          })}
          </div>
        )}
      </Card>

      <KpiTargetsImportSection isAdmin={isAdmin} userProfile={userProfile} toast={toast} />
      <ActualsImportSection isAdmin={isAdmin} userProfile={userProfile} toast={toast} />
      {/* DX-12 — item-level smart list ingestion (aggregates only) */}
      <SmartListImportSection isAdmin={isAdmin} userProfile={userProfile} toast={toast} />
    </div>
  )
}

// ============================================================
// KPI & Targets Bundle (DX-4/DX-5) — minimal extension
//
// Reuses the existing upload -> parse -> validate -> preview -> confirm
// -> commit -> result -> retry -> audit flow, driven by the new
// single-domain runner (kpiTargetsImportRunner.ts) instead of the
// 4-domain onboarding orchestrator — these three domains have no
// inter-dependency on each other or on Groups/Branches/Pharmacists/
// Assignments.
// ============================================================

const KPI_TARGETS_DOMAIN_LABEL = {
  KPI_REGISTRY: 'KPI Registry', BRANCH_TARGET: 'Branch Targets', PHARMACIST_TARGET: 'Pharmacist Targets',
}

function KpiTargetsImportSection({ isAdmin, userProfile, toast }) {
  const fileRef = useRef(null)
  const [domain, setDomain] = useState('KPI_REGISTRY')
  const [fileName, setFileName] = useState('')
  const [fileMeta, setFileMeta] = useState(null)
  const [rawRows, setRawRows] = useState(null)
  // idle | parsed | validating | previewed | committing | committed | stale | failed
  const [status, setStatus] = useState('idle')
  const [preview, setPreview] = useState(null)
  const [commitResult, setCommitResult] = useState(null)
  const [committedRows, setCommittedRows] = useState(null)
  const [staleReason, setStaleReason] = useState(null)
  const [confirmed, setConfirmed] = useState(false)
  const [jobPrefix, setJobPrefix] = useState(null)
  const [headerMapping, setHeaderMapping] = useState({})   // sourceHeader -> fieldKey

  const guardCtx = userProfile
    ? { uid: userProfile.uid, role: userProfile.role, pharmacyId: userProfile.pharmacyId ?? null }
    : null

  const resetForNewFile = () => {
    setPreview(null); setCommitResult(null); setCommittedRows(null)
    setStaleReason(null); setConfirmed(false); setJobPrefix(null)
    setStatus('parsed')
  }

  const onDomainChange = (next) => {
    setDomain(next); setFileName(''); setFileMeta(null); setRawRows(null)
    setPreview(null); setCommitResult(null); setCommittedRows(null)
    setStaleReason(null); setConfirmed(false); setJobPrefix(null)
    setHeaderMapping({})
    setStatus('idle')
  }

  const handleFile = useCallback(async (file) => {
    setFileName(file.name)
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    if (!checkWorkbookTemplateVersion(wb, toast)) return
    if (!checkWorkbookDomain(wb, domain, toast)) return
    const sheetName = wb.SheetNames.find((n) => !['instructions', 'metadata'].includes(n.toLowerCase())) || wb.SheetNames[0]
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' })
    const meta = await extractFileMeta(file, buf, sheetName)
    setFileMeta(meta)
    setRawRows(rows)
    setHeaderMapping({})
    resetForNewFile()
  }, [domain])

  const unresolvedHeaders = rawRows ? findUnresolvedHeaders(domain, Object.keys(rawRows[0] || {})) : []
  const onHeaderMappingChange = (header, fieldKey) => {
    setHeaderMapping((prev) => ({ ...prev, [header]: fieldKey }))
    resetForNewFile()
  }

  const onFileChange = (e) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file).catch((err) => toast.error?.(err.message))
  }

  const handleValidate = async () => {
    if (!isAdmin || !rawRows) return
    setStatus('validating')
    setConfirmed(false)
    try {
      const existing = await fetchKpiTargetsExistingData()
      const prefix = `kt-${Date.now()}`
      const mappedRows = applyManualHeaderMapping(domain, rawRows, headerMapping)
      const outcome = await validateKpiTargetsJob(
        { jobIdPrefix: prefix, domain, guardCtx, actorRole: userProfile.role, rawRows: mappedRows, existing, fileMeta },
        repo,
      )
      setJobPrefix(prefix)
      setPreview(outcome)
      setStatus(outcome.readyToCommit ? 'previewed' : 'failed')
    } catch (err) {
      toast.error?.(reportImportJobCreationFailure({ importDomain: domain, fileName, error: err }))
      setStatus('parsed')
    }
  }

  const handleCommit = async () => {
    if (!preview || !confirmed || status === 'committing') return
    setStatus('committing')
    setStaleReason(null)
    try {
      const freshExisting = await fetchKpiTargetsExistingData()
      const mappedRows = applyManualHeaderMapping(domain, rawRows, headerMapping)
      const outcome = await commitKpiTargetsJob(
        {
          jobIdPrefix: jobPrefix, domain, guardCtx, actorRole: userProfile.role, rawRows: mappedRows, existing: freshExisting,
          expectedPreviewSignature: preview.previewSignature,
        },
        repo,
      )
      if (outcome.stale) {
        setStaleReason(outcome.staleReason)
        setStatus('stale')
        return
      }
      setCommitResult(outcome.result)
      setCommittedRows(outcome.rows || [])
      setStatus('committed')
    } catch (err) {
      toast.error?.(err.message || 'Commit failed')
      setStatus('previewed')
    }
  }

  const canCommit = preview?.readyToCommit && confirmed && status === 'previewed'

  return (
    <Card>
      <SectionHeader
        icon={Target} accent={SECTION_ACCENTS.kpiTargets}
        title="KPI & Targets Bundle"
        description="Import KPI Registry definitions, Branch Targets, or Pharmacist Targets. Each is an independent single-domain job using the same Validate (preview only) -> Confirm -> Commit gate as Organization Onboarding."
      />

      <DomainTabs entries={Object.entries(KPI_TARGETS_DOMAIN_LABEL)} active={domain} onChange={onDomainChange} />
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: -6, marginBottom: 14 }}>
        Download the {KPI_TARGETS_DOMAIN_LABEL[domain]} template from the Template Library above.
      </p>

      {!isAdmin && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, background: 'rgba(217,119,6,0.10)', color: '#d97706', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          <AlertTriangle size={16} /> {KPI_TARGETS_DOMAIN_LABEL[domain]} bulk import requires the Admin role.
        </div>
      )}

      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFileChange} style={{ display: 'none' }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => fileRef.current?.click()} disabled={!isAdmin} className="btn btn-secondary btn-sm" style={{ gap: 6 }}>
          <Upload size={14} /> {fileName || `Upload ${KPI_TARGETS_DOMAIN_LABEL[domain]} workbook`}
        </button>

        {rawRows && (
          <button
            onClick={handleValidate}
            disabled={!isAdmin || status === 'validating'}
            className="btn btn-primary btn-sm" style={{ gap: 6 }}
          >
            {status === 'validating' ? <Loader2 className="spin" size={14} /> : <CheckCircle2 size={14} />}
            Validate (Preview only — no data is written)
          </button>
        )}
      </div>

      <UnresolvedColumnsPanel
        domain={domain}
        unresolvedHeaders={unresolvedHeaders}
        mapping={headerMapping}
        onMappingChange={onHeaderMappingChange}
      />

      {preview && (
        <div style={{ marginTop: 22 }}>
          <h3 style={{ fontSize: 12.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 8 }}>Preview</h3>
          <div style={{ padding: 12, background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
            <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>{KPI_TARGETS_DOMAIN_LABEL[domain]}</strong> <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>— {preview.summary.totalRows} row(s)</span>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6, fontSize: 12.5, color: 'var(--text-secondary)' }}>
              <span>Creates: {preview.summary.creates}</span>
              <span>Updates: {preview.summary.updates}</span>
              <span>Unchanged: {preview.summary.unchanged}</span>
              <span>Duplicates: {preview.summary.duplicates}</span>
              {preview.summary.conflicts > 0 && (
                <span style={{ color: 'var(--text-error, #b91c1c)', fontWeight: 600 }}>Conflicts: {preview.summary.conflicts}</span>
              )}
              {preview.summary.errors > 0 && (
                <span style={{ color: 'var(--text-error, #b91c1c)', fontWeight: 600 }}>Errors: {preview.summary.errors}</span>
              )}
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            {preview.rows.filter((r) => r.issues.length > 0).slice(0, 30).map((r) => (
              <div key={r.rowId} style={{ fontSize: 12, marginTop: 4, color: (r.classification === 'ERROR' || r.classification === 'CONFLICT') ? 'var(--text-error, #b91c1c)' : 'var(--text-warning, #b45309)' }}>
                Row {r.rowIndex} [{r.classification} · {categorizeRow(r.classification, r.issues.map((i) => i.code))}] — {r.identityKey}: {r.issues.map((i) => i.message).join('; ')}
              </div>
            ))}
          </div>

          {!preview.readyToCommit && (
            <p style={{ color: 'var(--text-error, #b91c1c)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 12 }}>
              <ShieldAlert size={16} /> This job has blocking errors or unresolved conflicts —
              fix the source file or resolve the conflicting records before this job can be committed.
            </p>
          )}

          {preview.readyToCommit && status !== 'committed' && (
            <div style={{ marginTop: 12, padding: 12, background: 'var(--bg-hover)', border: '1px dashed var(--border-default)', borderRadius: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text-secondary)' }}>
                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={status === 'committing'} />
                I have reviewed this preview and confirm committing it will write the changes above.
              </label>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button onClick={handleCommit} disabled={!canCommit} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
                  {status === 'committing' ? <Loader2 className="spin" size={14} /> : <CheckCircle2 size={14} />}
                  Confirm &amp; Commit
                </button>
                <button onClick={() => { setPreview(null); setStatus('parsed'); setConfirmed(false) }} disabled={status === 'committing'} className="btn btn-ghost btn-sm">
                  Cancel — return to upload
                </button>
              </div>
            </div>
          )}

          {status === 'stale' && (
            <div style={{ marginTop: 12, padding: 12, background: 'rgba(217,119,6,0.10)', borderRadius: 8 }}>
              <strong style={{ fontSize: 13, color: '#d97706' }}>Preview is stale.</strong> <span style={{ fontSize: 12.5 }}>{staleReason}</span>
              <div><button onClick={handleValidate} className="btn btn-secondary btn-sm" style={{ marginTop: 8 }}>Revalidate</button></div>
            </div>
          )}
        </div>
      )}

      {status === 'committed' && commitResult && (
        <div style={{ marginTop: 22 }}>
          <h3 style={{ fontSize: 12.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 8 }}>Results</h3>
          <div style={{ padding: 12, background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
            <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>{KPI_TARGETS_DOMAIN_LABEL[domain]}</strong>
            <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}> — status: {commitResult.status}, committed: {commitResult.committed}, failed: {commitResult.failed}, remaining: {commitResult.remaining}</span>
            {(committedRows || []).filter((r) => r.state === 'FAILED').slice(0, 20).map((r) => (
              <div key={r.rowId} style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>
                Row {r.rowIndex}: {r.failureReason}
              </div>
            ))}
          </div>
          {commitResult.failed > 0 && (
            <button onClick={handleValidate} className="btn btn-secondary btn-sm" style={{ marginTop: 8 }}>Retry remaining rows</button>
          )}
        </div>
      )}
    </Card>
  )
}

// ============================================================
// Actuals & Large Files Bundle (DX-6 / DX-7) — minimal extension
//
// Same Validate (preview only) -> Confirm -> Commit gate as every
// prior single-domain section, plus DX-7's large-file states: a live
// progress readout while committing, Cancel (stops before the next
// row, never rolls back already-committed rows), and Resume/Retry for
// a PARTIALLY_COMPLETED job (continues from the first not-yet-
// committed row — never replays a committed one). Preview rows are
// capped client-side (DX7_CONFIG.PREVIEW_ROW_CAP) so a large file never
// renders thousands of DOM rows at once; the summary counts above the
// list always reflect the complete file.
// ============================================================

const ACTUALS_DOMAIN_LABEL = { BRANCH_ACTUALS: 'Branch Actuals', PHARMACIST_ACTUALS: 'Pharmacist Actuals' }

function ActualsImportSection({ isAdmin, userProfile, toast }) {
  const fileRef = useRef(null)
  const cancelRef = useRef(false)
  const [domain, setDomain] = useState('BRANCH_ACTUALS')
  const [fileName, setFileName] = useState('')
  const [fileMeta, setFileMeta] = useState(null)
  const [rawRows, setRawRows] = useState(null)
  // idle | parsed | validating | previewed | committing | cancelling | partial | committed | stale | failed
  const [status, setStatus] = useState('idle')
  const [preview, setPreview] = useState(null)
  const [progress, setProgress] = useState(null)            // { committed, failed, skipped, totalCommittable }
  const [commitResult, setCommitResult] = useState(null)
  const [committedRows, setCommittedRows] = useState(null)
  const [staleReason, setStaleReason] = useState(null)
  const [confirmed, setConfirmed] = useState(false)
  const [jobPrefix, setJobPrefix] = useState(null)
  const [startedAt, setStartedAt] = useState(null)
  const [headerMapping, setHeaderMapping] = useState({})   // sourceHeader -> fieldKey

  const guardCtx = userProfile
    ? { uid: userProfile.uid, role: userProfile.role, pharmacyId: userProfile.pharmacyId ?? null }
    : null

  const resetForNewFile = () => {
    setPreview(null); setProgress(null); setCommitResult(null); setCommittedRows(null)
    setStaleReason(null); setConfirmed(false); setJobPrefix(null); setStartedAt(null)
    setStatus('parsed')
  }

  const onDomainChange = (next) => {
    setDomain(next); setFileName(''); setFileMeta(null); setRawRows(null)
    setPreview(null); setProgress(null); setCommitResult(null); setCommittedRows(null)
    setStaleReason(null); setConfirmed(false); setJobPrefix(null); setStartedAt(null)
    setHeaderMapping({})
    setStatus('idle')
  }

  const handleFile = useCallback(async (file) => {
    setFileName(file.name)
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    if (!checkWorkbookTemplateVersion(wb, toast)) return
    if (!checkWorkbookDomain(wb, domain, toast)) return
    const sheetName = wb.SheetNames.find((n) => !['instructions', 'metadata'].includes(n.toLowerCase())) || wb.SheetNames[0]
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' })
    const meta = await extractFileMeta(file, buf, sheetName)
    setFileMeta(meta)
    setRawRows(rows)
    setHeaderMapping({})
    resetForNewFile()
  }, [domain])

  const unresolvedHeaders = rawRows ? findUnresolvedHeaders(domain, Object.keys(rawRows[0] || {})) : []
  const onHeaderMappingChange = (header, fieldKey) => {
    setHeaderMapping((prev) => ({ ...prev, [header]: fieldKey }))
    resetForNewFile()
  }

  const onFileChange = (e) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file).catch((err) => toast.error?.(err.message))
  }

  const handleValidate = async () => {
    if (!isAdmin || !rawRows) return
    setStatus('validating')
    setConfirmed(false)
    try {
      const existing = await fetchActualsExistingData()
      const prefix = `act-${Date.now()}`
      const mappedRows = applyManualHeaderMapping(domain, rawRows, headerMapping)
      const outcome = await validateActualsJob(
        { jobIdPrefix: prefix, domain, guardCtx, actorRole: userProfile.role, rawRows: mappedRows, existing, fileMeta, fileChecksum: fileMeta?.checksum },
        repo,
      )
      setJobPrefix(prefix)
      setPreview(outcome)
      setStatus(outcome.readyToCommit ? 'previewed' : 'failed')
    } catch (err) {
      toast.error?.(reportImportJobCreationFailure({ importDomain: domain, fileName, error: err }))
      setStatus('parsed')
    }
  }

  const handleCommit = async () => {
    if (!preview || !confirmed || status === 'committing') return
    setStatus('committing')
    setStaleReason(null)
    setProgress({ committed: 0, failed: 0, skipped: 0, totalCommittable: preview.rows.length })
    setStartedAt(Date.now())
    cancelRef.current = false
    try {
      const freshExisting = await fetchActualsExistingData()
      const mappedRows = applyManualHeaderMapping(domain, rawRows, headerMapping)
      const outcome = await commitActualsJob(
        {
          jobIdPrefix: jobPrefix, domain, guardCtx, actorRole: userProfile.role, rawRows: mappedRows, existing: freshExisting,
          expectedPreviewSignature: preview.previewSignature,
          onProgress: (totals) => setProgress(totals),
          shouldCancel: () => cancelRef.current,
        },
        repo,
      )
      if (outcome.stale) {
        setStaleReason(outcome.staleReason)
        setStatus('stale')
        return
      }
      setCommitResult(outcome.result)
      setCommittedRows(outcome.rows || [])
      setStatus(outcome.result.status === 'PARTIALLY_COMPLETED' ? 'partial' : 'committed')
    } catch (err) {
      toast.error?.(err.message || 'Commit failed')
      setStatus('previewed')
    }
  }

  const handleCancel = () => { cancelRef.current = true; setStatus('cancelling') }

  const handleResumeOrRetry = async () => {
    if (!jobPrefix) return
    setStatus('committing')
    cancelRef.current = false
    try {
      const freshExisting = await fetchActualsExistingData()
      const outcome = await resumeOrRetryActualsJob(
        { jobIdPrefix: jobPrefix, domain, guardCtx, actorRole: userProfile.role, existing: freshExisting,
          onProgress: (totals) => setProgress(totals), shouldCancel: () => cancelRef.current },
        repo,
      )
      if (outcome.stale) {
        setStaleReason(outcome.staleReason)
        setStatus('stale')
        return
      }
      setCommitResult(outcome.result)
      setCommittedRows(outcome.rows || [])
      setStatus(outcome.result.status === 'PARTIALLY_COMPLETED' ? 'partial' : 'committed')
    } catch (err) {
      toast.error?.(err.message || 'Resume/retry failed')
      setStatus('partial')
    }
  }

  const canCommit = preview?.readyToCommit && confirmed && status === 'previewed'
  const elapsedSeconds = startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0
  const percent = progress?.totalCommittable
    ? Math.round(((progress.committed + progress.failed) / progress.totalCommittable) * 100)
    : 0

  return (
    <Card>
      <SectionHeader
        icon={TrendingUp} accent={SECTION_ACCENTS.actuals}
        title="Actuals & Large Files Bundle"
        description="Import KPI Actuals at the Branch or Pharmacist level. Large files are validated in chunks and committed with live progress, and a paused or partially-completed import can always be safely resumed or retried — no committed row is ever replayed."
      />

      <DomainTabs entries={Object.entries(ACTUALS_DOMAIN_LABEL)} active={domain} onChange={onDomainChange} />
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: -6, marginBottom: 14 }}>
        Download the {ACTUALS_DOMAIN_LABEL[domain]} template from the Template Library above.
      </p>

      {!isAdmin && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, background: 'rgba(217,119,6,0.10)', color: '#d97706', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          <AlertTriangle size={16} /> {ACTUALS_DOMAIN_LABEL[domain]} bulk import requires the Admin role.
        </div>
      )}

      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFileChange} style={{ display: 'none' }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => fileRef.current?.click()} disabled={!isAdmin || status === 'committing'} className="btn btn-secondary btn-sm" style={{ gap: 6 }}>
          <Upload size={14} /> {fileName || `Upload ${ACTUALS_DOMAIN_LABEL[domain]} workbook`}
        </button>

        {rawRows && status !== 'committing' && (
          <button
            onClick={handleValidate}
            disabled={!isAdmin || status === 'validating'}
            className="btn btn-primary btn-sm" style={{ gap: 6 }}
          >
            {status === 'validating' ? <Loader2 className="spin" size={14} /> : <CheckCircle2 size={14} />}
            Validate (Preview only — no data is written)
          </button>
        )}
      </div>

      <UnresolvedColumnsPanel
        domain={domain}
        unresolvedHeaders={unresolvedHeaders}
        mapping={headerMapping}
        onMappingChange={onHeaderMappingChange}
      />

      {preview && status !== 'committing' && status !== 'partial' && (
        <div style={{ marginTop: 22 }}>
          <h3 style={{ fontSize: 12.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 8 }}>Preview</h3>
          <div style={{ padding: 12, background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
            <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>{ACTUALS_DOMAIN_LABEL[domain]}</strong> <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>— {preview.totalRowCount} row(s)</span>
            {preview.totalRowCount > preview.previewRows.length && (
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}> (showing first {preview.previewRows.length})</span>
            )}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6, fontSize: 12.5, color: 'var(--text-secondary)' }}>
              <span>Creates: {preview.summary.creates}</span>
              <span>Updates: {preview.summary.updates}</span>
              <span>Unchanged: {preview.summary.unchanged}</span>
              <span>Duplicates: {preview.summary.duplicates}</span>
              {preview.summary.conflicts > 0 && (
                <span style={{ color: '#ef4444', fontWeight: 600 }}>Conflicts: {preview.summary.conflicts}</span>
              )}
              {preview.summary.errors > 0 && (
                <span style={{ color: '#ef4444', fontWeight: 600 }}>Errors: {preview.summary.errors}</span>
              )}
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            {preview.previewRows.filter((r) => r.issues.length > 0).slice(0, 30).map((r) => (
              <div key={r.rowId} style={{ fontSize: 12, marginTop: 4, color: (r.classification === 'ERROR' || r.classification === 'CONFLICT') ? 'var(--text-error, #b91c1c)' : 'var(--text-warning, #b45309)' }}>
                Row {r.rowIndex} [{r.classification} · {categorizeRow(r.classification, r.issues.map((i) => i.code))}] — {r.identityKey}: {r.issues.map((i) => i.message).join('; ')}
              </div>
            ))}
          </div>

          {!preview.readyToCommit && (
            <p style={{ color: 'var(--text-error, #b91c1c)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 12 }}>
              <ShieldAlert size={16} /> This job has blocking errors or unresolved conflicts —
              fix the source file or resolve the conflicting records before this job can be committed.
            </p>
          )}

          {preview.readyToCommit && status !== 'committed' && (
            <div style={{ marginTop: 12, padding: 12, background: 'var(--bg-hover)', border: '1px dashed var(--border-default)', borderRadius: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text-secondary)' }}>
                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                I have reviewed this preview and confirm committing it will write the changes above.
              </label>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button onClick={handleCommit} disabled={!canCommit} className="btn btn-primary btn-sm" style={{ gap: 6 }}>
                  <CheckCircle2 size={14} /> Confirm &amp; Commit
                </button>
                <button onClick={() => { setPreview(null); setStatus('parsed'); setConfirmed(false) }} className="btn btn-ghost btn-sm">
                  Cancel — return to upload
                </button>
              </div>
            </div>
          )}

          {status === 'stale' && (
            <div style={{ marginTop: 12, padding: 12, background: 'rgba(217,119,6,0.10)', borderRadius: 8 }}>
              <strong style={{ fontSize: 13, color: '#d97706' }}>Preview is stale.</strong> <span style={{ fontSize: 12.5 }}>{staleReason}</span>
              <div><button onClick={handleValidate} className="btn btn-secondary btn-sm" style={{ marginTop: 8 }}>Revalidate</button></div>
            </div>
          )}
        </div>
      )}

      {(status === 'committing' || status === 'cancelling') && progress && (
        <div style={{ marginTop: 22, padding: 12, background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            <Loader2 className="spin" size={15} /> {status === 'cancelling' ? 'Cancelling — finishing the current row…' : 'Committing…'}
          </h3>
          <div style={{ width: '100%', height: 6, background: 'var(--border-subtle)', borderRadius: 4, overflow: 'hidden', marginTop: 10 }}>
            <div style={{ width: `${percent}%`, height: '100%', background: '#16a34a', transition: 'width 0.3s ease' }} />
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8, fontSize: 12.5, color: 'var(--text-secondary)' }}>
            <span>{percent}% complete</span>
            <span>Committed: {progress.committed}</span>
            {progress.failed > 0 && <span style={{ color: '#ef4444' }}>Failed: {progress.failed}</span>}
            <span>Elapsed: {elapsedSeconds}s</span>
          </div>
          {status === 'committing' && (
            <button onClick={handleCancel} className="btn btn-ghost btn-sm" style={{ marginTop: 10 }}>Cancel (stops before the next row — already-committed rows stay committed)</button>
          )}
        </div>
      )}

      {status === 'partial' && commitResult && (
        <div style={{ marginTop: 22, padding: 12, background: 'rgba(217,119,6,0.10)', borderRadius: 8 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: '#d97706', marginBottom: 4 }}>Partially completed</h3>
          <p style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
            Committed: {commitResult.committed} · Failed: {commitResult.failed} · Remaining: {commitResult.remaining}.
            Already-committed rows are never re-attempted.
          </p>
          {(committedRows || []).filter((r) => r.state === 'FAILED').slice(0, 20).map((r) => (
            <div key={r.rowId} style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>
              Row {r.rowIndex}: {r.failureReason}
            </div>
          ))}
          <button onClick={handleResumeOrRetry} className="btn btn-secondary btn-sm" style={{ marginTop: 8 }}>Resume / Retry remaining rows</button>
        </div>
      )}

      {status === 'committed' && commitResult && (
        <div style={{ marginTop: 22 }}>
          <h3 style={{ fontSize: 12.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 8 }}>Results</h3>
          <div style={{ padding: 12, background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
            <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>{ACTUALS_DOMAIN_LABEL[domain]}</strong>
            <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}> — status: {commitResult.status}, committed: {commitResult.committed}, failed: {commitResult.failed}, remaining: {commitResult.remaining}</span>
          </div>
        </div>
      )}
    </Card>
  )
}

// ============================================================
// Template Library (DX-8) — one centralized place to discover and
// download every domain's import template. Reuses the real catalog
// build/download functions in templateCatalog.ts; this section never
// duplicates template logic, it only renders a list.
// ============================================================
function TemplateLibrarySection({ isAdmin }) {
  if (!isAdmin) return null
  return (
    <Card>
      <SectionHeader
        icon={Download} accent={SECTION_ACCENTS.templateLibrary}
        title="Template Library"
        description="Download the current import template for each domain. Every workbook includes a Metadata sheet (template name, version, expected sheet) and an Instructions sheet with column rules, allowed values, and example data."
      />
      {TEMPLATE_GROUPS.map((group) => {
        const entries = getTemplatesByGroup(group)
        if (entries.length === 0) return null
        return (
          <div key={group} style={{ marginTop: 14 }}>
            <h3 style={{ fontSize: 11.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 6 }}>{group}</h3>
            {entries.map((entry) => (
              <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 4px', borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>{entry.name}</strong>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 1 }}>
                    Version {entry.version} · {entry.sheetName} sheet · Admin-only import
                  </div>
                </div>
                <button onClick={() => entry.download()} className="btn btn-secondary btn-sm" style={{ gap: 5, flexShrink: 0 }}>
                  <Download size={13} /> Download
                </button>
              </div>
            ))}
          </div>
        )
      })}
    </Card>
  )
}

// ============================================================
// Data Exchange health summary (DX-9, optional, admin-only) — a
// compact at-a-glance count, never an analytics module. Derived
// entirely from the same import_jobs history fetched below, plus the
// static template catalog — no separate data source.
// ============================================================
function DataExchangeHealthSummary({ isAdmin }) {
  const [jobs, setJobs] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!isAdmin) return
    let cancelled = false
    listRecentImportJobs(50)
      .then((rows) => { if (!cancelled) setJobs(rows) })
      .catch((err) => { if (!cancelled) setError(err.message || 'Failed to load') })
    return () => { cancelled = true }
  }, [isAdmin])

  if (!isAdmin) return null
  if (error) return null
  if (jobs == null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, fontSize: 12.5, color: 'var(--text-muted)' }}>
        <Loader2 className="spin" size={13} /> Loading Data Exchange health…
      </div>
    )
  }

  const completed = jobs.filter((j) => j.status === 'COMPLETED').length
  const failed = jobs.filter((j) => j.status === 'FAILED').length
  const retryable = jobs.filter((j) => j.status === 'PARTIAL' || j.status === 'FAILED').length
  const active = jobs.filter((j) => j.status === 'DRAFT' || j.status === 'VALIDATING' || j.status === 'COMMITTING').length

  const stats = [
    { label: 'Supported domains', value: TEMPLATE_CATALOG.length },
    { label: 'Completed (recent)', value: completed },
    { label: 'Failed (recent)', value: failed, warn: failed > 0 },
    { label: 'Retryable', value: retryable, warn: retryable > 0 },
    { label: 'Active', value: active },
  ]

  return (
    <Card>
      <SectionHeader icon={Activity} accent={SECTION_ACCENTS.health} title="Data Exchange Health" />
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        {stats.map((s) => (
          <div key={s.label} style={{ minWidth: 100 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.warn ? '#ef4444' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </Card>
  )
}

// ============================================================
// Import history (DX-9 closure) — admin-only view over import_jobs,
// minimum columns per the closure spec. No raw row payloads, stack
// traces, or uncontrolled document IDs are shown — only the job
// summary fields already present on ImportJob.
// ============================================================
function ImportHistorySection({ isAdmin }) {
  const [jobs, setJobs] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!isAdmin) return
    let cancelled = false
    listRecentImportJobs(25)
      .then((rows) => { if (!cancelled) setJobs(rows) })
      .catch((err) => { if (!cancelled) setError(err.message || 'Failed to load import history') })
    return () => { cancelled = true }
  }, [isAdmin])

  if (!isAdmin) return null

  return (
    <Card>
      <SectionHeader icon={History} accent={SECTION_ACCENTS.history} title="Import History" />

      {error && (
        <p style={{ fontSize: 12.5, color: '#ef4444' }}>
          Could not load import history. Try refreshing the page.
        </p>
      )}

      {!error && jobs == null && (
        <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-muted)' }}><Loader2 className="spin" size={13} /> Loading…</p>
      )}

      {!error && jobs && jobs.length === 0 && (
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>No imports have been run yet.</p>
      )}

      {!error && jobs && jobs.length > 0 && (
        <>
          {/* PR-1E4 — phone-width card list, same `jobs` data/order as
              the table below (mobile-blueprint.md rule). */}
          <div className="sm:hidden space-y-2">
            {jobs.map((job) => {
              const createdAt = job.createdAt?.toDate?.() ?? null
              return (
                <MobileRankCard
                  key={job.jobId}
                  title={job.domain}
                  subtitle={`${job.fileMeta?.fileName || '—'} · ${createdAt ? createdAt.toLocaleString() : '—'}`}
                  primaryMetric={{ label: 'Total', value: job.rowCounts?.total ?? '—' }}
                  secondaryMetrics={[
                    { label: 'Committed', value: job.rowCounts?.committed ?? '—' },
                    { label: 'Failed', value: job.rowCounts?.failed ?? '—' },
                  ]}
                  status={{ label: job.status }}
                />
              )
            })}
          </div>
          <div className="hidden sm:block" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '6px 8px', fontWeight: 600, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Date</th>
                  <th style={{ padding: '6px 8px', fontWeight: 600, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Domain</th>
                  <th style={{ padding: '6px 8px', fontWeight: 600, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>File</th>
                  <th style={{ padding: '6px 8px', fontWeight: 600, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Status</th>
                  <th style={{ padding: '6px 8px', fontWeight: 600, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total</th>
                  <th style={{ padding: '6px 8px', fontWeight: 600, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Committed</th>
                  <th style={{ padding: '6px 8px', fontWeight: 600, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Failed</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  const createdAt = job.createdAt?.toDate?.() ?? null
                  return (
                    <tr key={job.jobId} style={{ borderTop: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                      <td style={{ padding: '6px 8px' }}>{createdAt ? createdAt.toLocaleString() : '—'}</td>
                      <td style={{ padding: '6px 8px' }}>{job.domain}</td>
                      <td style={{ padding: '6px 8px' }}>{job.fileMeta?.fileName || '—'}</td>
                      <td style={{ padding: '6px 8px' }}>{job.status}</td>
                      <td style={{ padding: '6px 8px' }}>{job.rowCounts?.total ?? '—'}</td>
                      <td style={{ padding: '6px 8px' }}>{job.rowCounts?.committed ?? '—'}</td>
                      <td style={{ padding: '6px 8px' }}>{job.rowCounts?.failed ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  )
}
