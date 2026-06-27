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
import { FileSpreadsheet, Upload, CheckCircle2, AlertTriangle, Loader2, ShieldAlert, Download, History } from 'lucide-react'
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
import { TEMPLATE_CATALOG, TEMPLATE_GROUPS, getTemplatesByGroup } from '../../services/dataExchange/templateCatalog'
import { categorizeRow } from '../../services/dataExchange/importErrorTaxonomy'

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

const DOMAIN_LABEL = { GROUP: 'Groups', BRANCH: 'Branches', PHARMACIST: 'Pharmacists', ASSIGNMENT: 'Assignments' }
const DOMAIN_ROW_KEY = { GROUP: 'groupRows', BRANCH: 'branchRows', PHARMACIST: 'pharmacistRows', ASSIGNMENT: 'assignmentRows' }
const PREVIEW_COLUMNS = [
  ['creates', 'Creates'], ['updates', 'Updates'], ['unchanged', 'Unchanged'],
  ['duplicates', 'Duplicates'], ['conflicts', 'Conflicts'], ['errors', 'Errors'],
  ['dependencyBlocked', 'Dependency-blocked'], ['pendingAuthPharmacists', 'Pending-auth pharmacists'],
]

const repo = new FirestoreStagingRepository()

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
    resetToMapped()
  }, [])

  const onFileChange = (e) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file).catch((err) => toast.error?.(err.message))
  }

  const setMappingDomain = (sheetName, domain) => {
    setSheetMappings((prev) => prev.map((m) => (m.sheetName === sheetName ? { ...m, domain } : m)))
    resetToMapped()
  }

  const buildOnboardingRows = () => {
    const rows = {}
    for (const { sheetName, domain } of sheetMappings) {
      if (!domain) continue
      const key = DOMAIN_ROW_KEY[domain]
      rows[key] = [...(rows[key] || []), ...(sheetRows[sheetName] || [])]
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
      <h1 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <FileSpreadsheet size={22} /> Data Exchange Studio
      </h1>

      <TemplateLibrarySection isAdmin={isAdmin} />
      <DataExchangeHealthSummary isAdmin={isAdmin} />
      <ImportHistorySection isAdmin={isAdmin} />

      <hr style={{ margin: '32px 0' }} />
      <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <FileSpreadsheet size={20} /> Organization Onboarding
      </h2>
      <p style={{ opacity: 0.75, marginBottom: 16 }}>
        Upload a single workbook with Groups / Branches / Pharmacists / Assignments
        sheets (or separate single-domain files), Validate to preview the exact
        changes with zero writes, resolve any conflicts, then explicitly confirm
        to Commit in dependency order. Imported pharmacists are created as
        pending-invitation operational records — no Firebase Auth account or
        password is ever created here.
      </p>

      {!isAdmin && (
        <div style={{ padding: 12, background: 'var(--surface-warning, #fff3cd)', borderRadius: 8, marginBottom: 16 }}>
          <AlertTriangle size={16} /> Organization Onboarding bulk import requires the Admin role.
        </div>
      )}

      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFileChange} style={{ display: 'none' }} />
      <button onClick={() => fileRef.current?.click()} disabled={!isAdmin}>
        <Upload size={16} /> {fileName || 'Upload workbook'}
      </button>

      {sheetMappings.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h3>Sheet → Domain mapping</h3>
          {/* PR-1E4 — two-column key/select rows; a <table> with a
              <select> per cell cramps on phone widths, so this renders
              as stacked flex rows instead (same data, same order, no
              card needed for a 2-field row). */}
          <div className="space-y-2">
            {sheetMappings.map((m) => (
              <div key={m.sheetName} className="flex flex-wrap items-center gap-2">
                <span className="text-sm" style={{ minWidth: '120px' }}>{m.sheetName}</span>
                <select value={m.domain || ''} onChange={(e) => setMappingDomain(m.sheetName, e.target.value || null)}>
                  <option value="">— unresolved —</option>
                  {Object.entries(DOMAIN_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
              </div>
            ))}
          </div>
          {unresolvedSheets.length > 0 && (
            <p style={{ color: 'var(--text-warning, #b45309)' }}>
              {unresolvedSheets.length} sheet(s) need a manual domain selection before validating.
            </p>
          )}
          <button
            onClick={handleValidate}
            disabled={!isAdmin || status === 'validating' || unresolvedSheets.length > 0}
            style={{ marginTop: 8 }}
          >
            {status === 'validating' ? <Loader2 className="spin" size={16} /> : <CheckCircle2 size={16} />}
            {' '}Validate (Preview only — no data is written)
          </button>
        </div>
      )}

      {preview && (
        <div style={{ marginTop: 24 }}>
          <h3>Preview</h3>
          {preview.domains.map((d) => (
            <div key={d.domain} style={{ marginBottom: 12, padding: 12, border: '1px solid var(--border, #e5e7eb)', borderRadius: 8 }}>
              <strong>{DOMAIN_LABEL[d.domain]}</strong> — {d.totalRows} row(s)
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6, fontSize: 13, opacity: 0.85 }}>
                {PREVIEW_COLUMNS.map(([key, label]) => d[key] > 0 && (
                  <span key={key} style={(key === 'errors' || key === 'conflicts') ? { color: 'var(--text-error, #b91c1c)', fontWeight: 600 } : undefined}>
                    {label}: {d[key]}
                  </span>
                ))}
              </div>
            </div>
          ))}

          {!preview.readyToCommit && (
            <p style={{ color: 'var(--text-error, #b91c1c)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <ShieldAlert size={16} /> This job has blocking errors or unresolved identity conflicts —
              return to mapping, fix the source file, or re-upload before this job can be committed.
            </p>
          )}

          {preview.readyToCommit && status !== 'committed' && (
            <div style={{ marginTop: 12, padding: 12, border: '1px dashed var(--border, #e5e7eb)', borderRadius: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={status === 'committing'} />
                I have reviewed this preview and confirm committing it will write the changes above.
              </label>
              <button onClick={handleCommit} disabled={!canCommit} style={{ marginTop: 8 }}>
                {status === 'committing' ? <Loader2 className="spin" size={16} /> : <CheckCircle2 size={16} />}
                {' '}Confirm &amp; Commit
              </button>
              <button onClick={resetToMapped} disabled={status === 'committing'} style={{ marginLeft: 8 }}>
                Cancel — return to mapping
              </button>
            </div>
          )}

          {status === 'stale' && (
            <div style={{ marginTop: 12, padding: 12, background: 'var(--surface-warning, #fff3cd)', borderRadius: 8 }}>
              <strong>Preview is stale.</strong> {staleReason}
              <div><button onClick={handleValidate} style={{ marginTop: 8 }}>Revalidate</button></div>
            </div>
          )}
        </div>
      )}

      {status === 'committed' && commitResult && (
        <div style={{ marginTop: 24 }}>
          <h3>Results</h3>
          {Object.entries(DOMAIN_LABEL).map(([domainKey, label]) => {
            const outcome = commitResult[domainKey === 'GROUP' ? 'groups' : domainKey === 'BRANCH' ? 'branches' : domainKey === 'PHARMACIST' ? 'pharmacists' : 'assignments']
            if (!outcome) return null
            return (
              <div key={domainKey} style={{ marginBottom: 16, padding: 12, border: '1px solid var(--border, #e5e7eb)', borderRadius: 8 }}>
                <strong>{label}</strong> — status: {outcome.job.status}, committed: {outcome.result.committed}, failed: {outcome.result.failed}, remaining: {outcome.result.remaining}
                {outcome.rows.filter((r) => r.issues.length > 0).slice(0, 20).map((r) => (
                  <div key={r.rowId} style={{ fontSize: 12, color: 'var(--text-error, #b91c1c)', marginTop: 4 }}>
                    Row {r.rowIndex} [{categorizeRow(r.classification, r.issues.map((i) => i.code))}]: {r.issues.map((i) => i.message).join('; ')}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}

      <hr style={{ margin: '32px 0' }} />
      <KpiTargetsImportSection isAdmin={isAdmin} userProfile={userProfile} toast={toast} />

      <hr style={{ margin: '32px 0' }} />
      <ActualsImportSection isAdmin={isAdmin} userProfile={userProfile} toast={toast} />
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
  const [rawRows, setRawRows] = useState(null)
  // idle | parsed | validating | previewed | committing | committed | stale | failed
  const [status, setStatus] = useState('idle')
  const [preview, setPreview] = useState(null)
  const [commitResult, setCommitResult] = useState(null)
  const [committedRows, setCommittedRows] = useState(null)
  const [staleReason, setStaleReason] = useState(null)
  const [confirmed, setConfirmed] = useState(false)
  const [jobPrefix, setJobPrefix] = useState(null)

  const guardCtx = userProfile
    ? { uid: userProfile.uid, role: userProfile.role, pharmacyId: userProfile.pharmacyId ?? null }
    : null

  const resetForNewFile = () => {
    setPreview(null); setCommitResult(null); setCommittedRows(null)
    setStaleReason(null); setConfirmed(false); setJobPrefix(null)
    setStatus('parsed')
  }

  const onDomainChange = (next) => {
    setDomain(next); setFileName(''); setRawRows(null)
    setPreview(null); setCommitResult(null); setCommittedRows(null)
    setStaleReason(null); setConfirmed(false); setJobPrefix(null)
    setStatus('idle')
  }

  const handleFile = useCallback(async (file) => {
    setFileName(file.name)
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    if (!checkWorkbookTemplateVersion(wb, toast)) return
    const sheetName = wb.SheetNames.find((n) => !['instructions', 'metadata'].includes(n.toLowerCase())) || wb.SheetNames[0]
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' })
    setRawRows(rows)
    resetForNewFile()
  }, [])

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
      const outcome = await validateKpiTargetsJob(
        { jobIdPrefix: prefix, domain, guardCtx, actorRole: userProfile.role, rawRows, existing },
        repo,
      )
      setJobPrefix(prefix)
      setPreview(outcome)
      setStatus(outcome.readyToCommit ? 'previewed' : 'failed')
    } catch (err) {
      toast.error?.(err.message || 'Validation failed')
      setStatus('parsed')
    }
  }

  const handleCommit = async () => {
    if (!preview || !confirmed || status === 'committing') return
    setStatus('committing')
    setStaleReason(null)
    try {
      const freshExisting = await fetchKpiTargetsExistingData()
      const outcome = await commitKpiTargetsJob(
        {
          jobIdPrefix: jobPrefix, domain, guardCtx, actorRole: userProfile.role, rawRows, existing: freshExisting,
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
    <div>
      <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <FileSpreadsheet size={20} /> KPI &amp; Targets Bundle (DX-4 / DX-5)
      </h2>
      <p style={{ opacity: 0.75, marginBottom: 16 }}>
        Import KPI Registry definitions, Branch Targets, or Pharmacist Targets.
        Each is an independent single-domain job using the same Validate
        (preview only) -&gt; Confirm -&gt; Commit gate as Organization Onboarding.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {Object.entries(KPI_TARGETS_DOMAIN_LABEL).map(([key, label]) => (
          <button
            key={key}
            onClick={() => onDomainChange(key)}
            style={{ fontWeight: domain === key ? 700 : 400, opacity: domain === key ? 1 : 0.7 }}
          >
            {label}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 13, opacity: 0.65 }}>
          Download the {KPI_TARGETS_DOMAIN_LABEL[domain]} template from the Template Library above.
        </span>
      </div>

      {!isAdmin && (
        <div style={{ padding: 12, background: 'var(--surface-warning, #fff3cd)', borderRadius: 8, marginBottom: 16 }}>
          <AlertTriangle size={16} /> {KPI_TARGETS_DOMAIN_LABEL[domain]} bulk import requires the Admin role.
        </div>
      )}

      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFileChange} style={{ display: 'none' }} />
      <button onClick={() => fileRef.current?.click()} disabled={!isAdmin}>
        <Upload size={16} /> {fileName || `Upload ${KPI_TARGETS_DOMAIN_LABEL[domain]} workbook`}
      </button>

      {rawRows && (
        <button
          onClick={handleValidate}
          disabled={!isAdmin || status === 'validating'}
          style={{ marginTop: 8, marginLeft: 8 }}
        >
          {status === 'validating' ? <Loader2 className="spin" size={16} /> : <CheckCircle2 size={16} />}
          {' '}Validate (Preview only — no data is written)
        </button>
      )}

      {preview && (
        <div style={{ marginTop: 24 }}>
          <h3>Preview</h3>
          <div style={{ padding: 12, border: '1px solid var(--border, #e5e7eb)', borderRadius: 8 }}>
            <strong>{KPI_TARGETS_DOMAIN_LABEL[domain]}</strong> — {preview.summary.totalRows} row(s)
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6, fontSize: 13, opacity: 0.85 }}>
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
            <div style={{ marginTop: 12, padding: 12, border: '1px dashed var(--border, #e5e7eb)', borderRadius: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={status === 'committing'} />
                I have reviewed this preview and confirm committing it will write the changes above.
              </label>
              <button onClick={handleCommit} disabled={!canCommit} style={{ marginTop: 8 }}>
                {status === 'committing' ? <Loader2 className="spin" size={16} /> : <CheckCircle2 size={16} />}
                {' '}Confirm &amp; Commit
              </button>
              <button onClick={() => { setPreview(null); setStatus('parsed'); setConfirmed(false) }} disabled={status === 'committing'} style={{ marginLeft: 8 }}>
                Cancel — return to upload
              </button>
            </div>
          )}

          {status === 'stale' && (
            <div style={{ marginTop: 12, padding: 12, background: 'var(--surface-warning, #fff3cd)', borderRadius: 8 }}>
              <strong>Preview is stale.</strong> {staleReason}
              <div><button onClick={handleValidate} style={{ marginTop: 8 }}>Revalidate</button></div>
            </div>
          )}
        </div>
      )}

      {status === 'committed' && commitResult && (
        <div style={{ marginTop: 24 }}>
          <h3>Results</h3>
          <div style={{ padding: 12, border: '1px solid var(--border, #e5e7eb)', borderRadius: 8 }}>
            <strong>{KPI_TARGETS_DOMAIN_LABEL[domain]}</strong> — status: {commitResult.status}, committed: {commitResult.committed}, failed: {commitResult.failed}, remaining: {commitResult.remaining}
            {(committedRows || []).filter((r) => r.state === 'FAILED').slice(0, 20).map((r) => (
              <div key={r.rowId} style={{ fontSize: 12, color: 'var(--text-error, #b91c1c)', marginTop: 4 }}>
                Row {r.rowIndex}: {r.failureReason}
              </div>
            ))}
          </div>
          {commitResult.failed > 0 && (
            <button onClick={handleValidate} style={{ marginTop: 8 }}>Retry remaining rows</button>
          )}
        </div>
      )}
    </div>
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

  const guardCtx = userProfile
    ? { uid: userProfile.uid, role: userProfile.role, pharmacyId: userProfile.pharmacyId ?? null }
    : null

  const resetForNewFile = () => {
    setPreview(null); setProgress(null); setCommitResult(null); setCommittedRows(null)
    setStaleReason(null); setConfirmed(false); setJobPrefix(null); setStartedAt(null)
    setStatus('parsed')
  }

  const onDomainChange = (next) => {
    setDomain(next); setFileName(''); setRawRows(null)
    setPreview(null); setProgress(null); setCommitResult(null); setCommittedRows(null)
    setStaleReason(null); setConfirmed(false); setJobPrefix(null); setStartedAt(null)
    setStatus('idle')
  }

  const handleFile = useCallback(async (file) => {
    setFileName(file.name)
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    if (!checkWorkbookTemplateVersion(wb, toast)) return
    const sheetName = wb.SheetNames.find((n) => !['instructions', 'metadata'].includes(n.toLowerCase())) || wb.SheetNames[0]
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' })
    setRawRows(rows)
    resetForNewFile()
  }, [])

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
      const outcome = await validateActualsJob(
        { jobIdPrefix: prefix, domain, guardCtx, actorRole: userProfile.role, rawRows, existing },
        repo,
      )
      setJobPrefix(prefix)
      setPreview(outcome)
      setStatus(outcome.readyToCommit ? 'previewed' : 'failed')
    } catch (err) {
      toast.error?.(err.message || 'Validation failed')
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
      const outcome = await commitActualsJob(
        {
          jobIdPrefix: jobPrefix, domain, guardCtx, actorRole: userProfile.role, rawRows, existing: freshExisting,
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
    <div>
      <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <FileSpreadsheet size={20} /> Actuals &amp; Large Files Bundle (DX-6 / DX-7)
      </h2>
      <p style={{ opacity: 0.75, marginBottom: 16 }}>
        Import KPI Actuals at the Branch or Pharmacist level. Large files are
        validated in chunks and committed with live progress, and a paused or
        partially-completed import can always be safely resumed or retried —
        no committed row is ever replayed.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {Object.entries(ACTUALS_DOMAIN_LABEL).map(([key, label]) => (
          <button
            key={key}
            onClick={() => onDomainChange(key)}
            style={{ fontWeight: domain === key ? 700 : 400, opacity: domain === key ? 1 : 0.7 }}
          >
            {label}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 13, opacity: 0.65 }}>
          Download the {ACTUALS_DOMAIN_LABEL[domain]} template from the Template Library above.
        </span>
      </div>

      {!isAdmin && (
        <div style={{ padding: 12, background: 'var(--surface-warning, #fff3cd)', borderRadius: 8, marginBottom: 16 }}>
          <AlertTriangle size={16} /> {ACTUALS_DOMAIN_LABEL[domain]} bulk import requires the Admin role.
        </div>
      )}

      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFileChange} style={{ display: 'none' }} />
      <button onClick={() => fileRef.current?.click()} disabled={!isAdmin || status === 'committing'}>
        <Upload size={16} /> {fileName || `Upload ${ACTUALS_DOMAIN_LABEL[domain]} workbook`}
      </button>

      {rawRows && status !== 'committing' && (
        <button
          onClick={handleValidate}
          disabled={!isAdmin || status === 'validating'}
          style={{ marginTop: 8, marginLeft: 8 }}
        >
          {status === 'validating' ? <Loader2 className="spin" size={16} /> : <CheckCircle2 size={16} />}
          {' '}Validate (Preview only — no data is written)
        </button>
      )}

      {preview && status !== 'committing' && status !== 'partial' && (
        <div style={{ marginTop: 24 }}>
          <h3>Preview</h3>
          <div style={{ padding: 12, border: '1px solid var(--border, #e5e7eb)', borderRadius: 8 }}>
            <strong>{ACTUALS_DOMAIN_LABEL[domain]}</strong> — {preview.totalRowCount} row(s)
            {preview.totalRowCount > preview.previewRows.length && (
              <span style={{ opacity: 0.65, fontSize: 12 }}> (showing first {preview.previewRows.length})</span>
            )}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6, fontSize: 13, opacity: 0.85 }}>
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
            <div style={{ marginTop: 12, padding: 12, border: '1px dashed var(--border, #e5e7eb)', borderRadius: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                I have reviewed this preview and confirm committing it will write the changes above.
              </label>
              <button onClick={handleCommit} disabled={!canCommit} style={{ marginTop: 8 }}>
                <CheckCircle2 size={16} /> Confirm &amp; Commit
              </button>
              <button onClick={() => { setPreview(null); setStatus('parsed'); setConfirmed(false) }} style={{ marginLeft: 8 }}>
                Cancel — return to upload
              </button>
            </div>
          )}

          {status === 'stale' && (
            <div style={{ marginTop: 12, padding: 12, background: 'var(--surface-warning, #fff3cd)', borderRadius: 8 }}>
              <strong>Preview is stale.</strong> {staleReason}
              <div><button onClick={handleValidate} style={{ marginTop: 8 }}>Revalidate</button></div>
            </div>
          )}
        </div>
      )}

      {(status === 'committing' || status === 'cancelling') && progress && (
        <div style={{ marginTop: 24, padding: 12, border: '1px solid var(--border, #e5e7eb)', borderRadius: 8 }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Loader2 className="spin" size={16} /> {status === 'cancelling' ? 'Cancelling — finishing the current row…' : 'Committing…'}
          </h3>
          <div style={{ width: '100%', height: 8, background: 'var(--border, #e5e7eb)', borderRadius: 4, overflow: 'hidden', marginTop: 8 }}>
            <div style={{ width: `${percent}%`, height: '100%', background: 'var(--text-success, #15803d)' }} />
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8, fontSize: 13, opacity: 0.85 }}>
            <span>{percent}% complete</span>
            <span>Committed: {progress.committed}</span>
            {progress.failed > 0 && <span style={{ color: 'var(--text-error, #b91c1c)' }}>Failed: {progress.failed}</span>}
            <span>Elapsed: {elapsedSeconds}s</span>
          </div>
          {status === 'committing' && (
            <button onClick={handleCancel} style={{ marginTop: 8 }}>Cancel (stops before the next row — already-committed rows stay committed)</button>
          )}
        </div>
      )}

      {status === 'partial' && commitResult && (
        <div style={{ marginTop: 24, padding: 12, background: 'var(--surface-warning, #fff3cd)', borderRadius: 8 }}>
          <h3>Partially completed</h3>
          <p>
            Committed: {commitResult.committed} · Failed: {commitResult.failed} · Remaining: {commitResult.remaining}.
            Already-committed rows are never re-attempted.
          </p>
          {(committedRows || []).filter((r) => r.state === 'FAILED').slice(0, 20).map((r) => (
            <div key={r.rowId} style={{ fontSize: 12, color: 'var(--text-error, #b91c1c)', marginTop: 4 }}>
              Row {r.rowIndex}: {r.failureReason}
            </div>
          ))}
          <button onClick={handleResumeOrRetry} style={{ marginTop: 8 }}>Resume / Retry remaining rows</button>
        </div>
      )}

      {status === 'committed' && commitResult && (
        <div style={{ marginTop: 24 }}>
          <h3>Results</h3>
          <div style={{ padding: 12, border: '1px solid var(--border, #e5e7eb)', borderRadius: 8 }}>
            <strong>{ACTUALS_DOMAIN_LABEL[domain]}</strong> — status: {commitResult.status}, committed: {commitResult.committed}, failed: {commitResult.failed}, remaining: {commitResult.remaining}
          </div>
        </div>
      )}
    </div>
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
    <div style={{ marginTop: 8, marginBottom: 24, padding: 16, border: '1px solid var(--border, #e5e7eb)', borderRadius: 8 }}>
      <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16 }}>
        <Download size={18} /> Template Library
      </h2>
      <p style={{ opacity: 0.75, fontSize: 13, marginBottom: 12 }}>
        Download the current import template for each domain. Every workbook includes
        a Metadata sheet (template name, version, expected sheet) and an Instructions
        sheet with column rules, allowed values, and example data.
      </p>
      {TEMPLATE_GROUPS.map((group) => {
        const entries = getTemplatesByGroup(group)
        if (entries.length === 0) return null
        return (
          <div key={group} style={{ marginTop: 12 }}>
            <h3 style={{ fontSize: 13, textTransform: 'uppercase', opacity: 0.6, marginBottom: 6 }}>{group}</h3>
            {entries.map((entry) => (
              <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border, #f1f5f9)' }}>
                <div style={{ flex: 1 }}>
                  <strong style={{ fontSize: 13 }}>{entry.name}</strong>
                  <div style={{ fontSize: 12, opacity: 0.6 }}>
                    Version {entry.version} · {entry.sheetName} sheet · Admin-only import
                  </div>
                </div>
                <button onClick={() => entry.download()} style={{ fontSize: 13 }}>
                  <Download size={14} /> Download
                </button>
              </div>
            ))}
          </div>
        )
      })}
    </div>
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
      <div style={{ marginBottom: 24, fontSize: 13, opacity: 0.6 }}>
        <Loader2 className="spin" size={14} /> Loading Data Exchange health…
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
    { label: 'Failed (recent)', value: failed },
    { label: 'Retryable', value: retryable },
    { label: 'Active', value: active },
  ]

  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24, padding: '12px 16px', border: '1px solid var(--border, #e5e7eb)', borderRadius: 8 }}>
      {stats.map((s) => (
        <div key={s.label} style={{ minWidth: 110 }}>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{s.value}</div>
          <div style={{ fontSize: 12, opacity: 0.6 }}>{s.label}</div>
        </div>
      ))}
    </div>
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
    <div style={{ marginBottom: 24, padding: 16, border: '1px solid var(--border, #e5e7eb)', borderRadius: 8 }}>
      <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16 }}>
        <History size={18} /> Import History
      </h2>

      {error && (
        <p style={{ fontSize: 13, color: 'var(--text-error, #b91c1c)' }}>
          Could not load import history. Try refreshing the page.
        </p>
      )}

      {!error && jobs == null && (
        <p style={{ fontSize: 13, opacity: 0.6 }}><Loader2 className="spin" size={14} /> Loading…</p>
      )}

      {!error && jobs && jobs.length === 0 && (
        <p style={{ fontSize: 13, opacity: 0.6 }}>No imports have been run yet.</p>
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
                  subtitle={`${job.fileMeta?.name || '—'} · ${createdAt ? createdAt.toLocaleString() : '—'}`}
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
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', opacity: 0.6 }}>
                  <th style={{ padding: '4px 8px' }}>Date</th>
                  <th style={{ padding: '4px 8px' }}>Domain</th>
                  <th style={{ padding: '4px 8px' }}>File</th>
                  <th style={{ padding: '4px 8px' }}>Status</th>
                  <th style={{ padding: '4px 8px' }}>Total</th>
                  <th style={{ padding: '4px 8px' }}>Committed</th>
                  <th style={{ padding: '4px 8px' }}>Failed</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  const createdAt = job.createdAt?.toDate?.() ?? null
                  return (
                    <tr key={job.jobId} style={{ borderTop: '1px solid var(--border, #f1f5f9)' }}>
                      <td style={{ padding: '4px 8px' }}>{createdAt ? createdAt.toLocaleString() : '—'}</td>
                      <td style={{ padding: '4px 8px' }}>{job.domain}</td>
                      <td style={{ padding: '4px 8px' }}>{job.fileMeta?.name || '—'}</td>
                      <td style={{ padding: '4px 8px' }}>{job.status}</td>
                      <td style={{ padding: '4px 8px' }}>{job.rowCounts?.total ?? '—'}</td>
                      <td style={{ padding: '4px 8px' }}>{job.rowCounts?.committed ?? '—'}</td>
                      <td style={{ padding: '4px 8px' }}>{job.rowCounts?.failed ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
