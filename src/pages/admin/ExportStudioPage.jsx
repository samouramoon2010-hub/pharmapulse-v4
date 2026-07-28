// ============================================================
// Export Studio (DX-10)
//
// Separate subsystem from Data Exchange (Import) Studio. Reuses
// the same scope/KPI/branch contracts (scopeResolver, the
// registry-aware executive engine) and the same Excel writer
// conventions established in DX-8 (autofilter + column widths only —
// frozen panes and data-validation dropdowns are not supported by
// the installed SheetJS Community Edition).
//
// Only the 4 templates marked available in exportTemplateRegistry.ts
// are selectable here — Pharmacist Performance and Evaluation Results
// show their documented blocker instead of a generate button.
// ============================================================
import React, { useState, useMemo, useEffect } from 'react'
import { format } from 'date-fns'
import { FileSpreadsheet, Download, AlertTriangle, CheckCircle2, Loader2, History, MessageCircle } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useToastStore } from '../../components/ui/Toast'
import { useKpiStore } from '../../store/kpiStore'
import MobileRankCard from '../../components/ui/MobileRankCard'
import { usePharmacyStore } from '../../store/pharmacyStore'
import { useScopeProfile } from '../../hooks/useScopeProfile'
import { filterAllowedPharmacies } from '../../services/scopeResolver'
import { filterToCurrentMonth } from '../../engine'
import { generateExecutiveReport, generateBranchSummary } from '../../engine/executive'
import { DEFAULT_KPI_REGISTRY } from '../../engine/kpiRegistry'
import { subscribeKpiRegistry } from '../../services/kpiRegistryService'
import { getProductionEngineKeys, getKpiMetaForKey } from '../../engine/kpiAnalyticsEngine'
import { listRecentImportJobs } from '../../services/dataExchange/firestoreStagingRepository'

import { EXPORT_TEMPLATE_CATALOG, getAvailableExportTemplates } from '../../services/export/exportTemplateRegistry'
import { buildExecutivePerformanceDataset } from '../../services/export/datasetBuilders/executivePerformanceDataset'
import { buildBranchPerformanceDataset } from '../../services/export/datasetBuilders/branchPerformanceDataset'
import { buildKpiPerformanceDataset } from '../../services/export/datasetBuilders/kpiPerformanceDataset'
import { buildImportAuditDataset } from '../../services/export/datasetBuilders/importAuditDataset'
import { validateExportDataset } from '../../services/export/exportValidation'
import { downloadExportWorkbook } from '../../services/export/exportDownloadService'
import { downloadCsv } from '../../services/export/csvExportService'
import { buildExportFileName } from '../../services/export/workbookBuilder'
import { recordExportAudit, listRecentExportAudits } from '../../services/export/exportAuditService'
import { buildWhatsappSummary } from '../../services/export/whatsappSummaryService'

function currentMonthStr() {
  return format(new Date(), 'yyyy-MM')
}

export default function ExportStudioPage() {
  const { userProfile } = useAuthStore()
  const toast = useToastStore()
  const isAdmin = userProfile?.role === 'admin'

  const { entries, targets, loading: kpiLoading } = useKpiStore()
  const { pharmacies, loading: pharmacyLoading } = usePharmacyStore()
  const { scope, loading: scopeLoading } = useScopeProfile()

  const [liveRegistry, setLiveRegistry] = useState(DEFAULT_KPI_REGISTRY)
  useEffect(() => subscribeKpiRegistry((reg) => setLiveRegistry(reg), () => setLiveRegistry(DEFAULT_KPI_REGISTRY)), [])

  const [templateId, setTemplateId] = useState('executive-performance')
  const [month, setMonth] = useState(currentMonthStr())
  const [branchId, setBranchId] = useState('')
  const [kpiKey, setKpiKey] = useState('')
  const [includeRawData, setIncludeRawData] = useState(false)
  const [format_, setFormat] = useState('xlsx')
  const [status, setStatus] = useState('idle') // idle | generating | done | error
  const [validationResult, setValidationResult] = useState(null)
  const [history, setHistory] = useState(null)
  // DX-11 — last successfully validated dataset, kept only so the user
  // can explicitly share its summary via WhatsApp. Never sent automatically.
  const [lastDataset, setLastDataset] = useState(null)

  const template = EXPORT_TEMPLATE_CATALOG.find((t) => t.id === templateId)
  const availableTemplates = getAvailableExportTemplates()

  const scopedPharmacies = useMemo(() => {
    if (!scope) return []
    return filterAllowedPharmacies(scope, pharmacies).filter((p) => p.active !== false)
  }, [scope, pharmacies])

  const kpiOptions = useMemo(() => getProductionEngineKeys(liveRegistry), [liveRegistry])

  const loading = kpiLoading || pharmacyLoading || scopeLoading

  useEffect(() => {
    if (!isAdmin) return
    listRecentExportAudits(10).then(setHistory).catch(() => setHistory([]))
  }, [isAdmin, status])

  function buildBranchInputs(pharmacyIds) {
    return pharmacyIds.map((id) => {
      const pharmacy = pharmacies.find((p) => p.id === id)
      const pharmacyEntries = entries.filter((e) => e.pharmacyId === id)
      const mtdEntries = filterToCurrentMonth(pharmacyEntries)
      const target = targets.find((t) => t.pharmacyId === id && t.month === month) ?? null
      return {
        pharmacyId: id,
        pharmacyName: pharmacy?.name ?? id,
        pharmacyCode: pharmacy?.code ?? id,
        region: pharmacy?.region ?? '',
        mtdEntries,
        target,
      }
    })
  }

  function buildBranchSummaries(pharmacyIds) {
    const monthStart = `${month}-01`
    return buildBranchInputs(pharmacyIds).map((input) => generateBranchSummary(input, monthStart, month, liveRegistry))
  }

  async function handleGenerate() {
    if (!template || template.unavailableReason) return
    setStatus('generating')
    setValidationResult(null)
    setLastDataset(null)
    try {
      let dataset
      const generatedBy = userProfile?.id ?? 'system'

      if (templateId === 'executive-performance') {
        const branchInputs = buildBranchInputs(scopedPharmacies.map((p) => p.id))
        const report = generateExecutiveReport({ branches: branchInputs, reportDate: month + '-01', reportMonth: month, generatedBy }, liveRegistry)
        dataset = buildExecutivePerformanceDataset({ report, registry: liveRegistry, generatedBy, scopeLabel: scope?.type === 'all' ? 'All Authorized Branches' : `${branchInputs.length} branches`, includeRawData })
      } else if (templateId === 'branch-performance') {
        const ids = branchId ? [branchId] : scopedPharmacies.map((p) => p.id)
        const branches = buildBranchSummaries(ids)
        dataset = buildBranchPerformanceDataset({ branches, registry: liveRegistry, generatedBy, periodLabel: month, includeRawData })
      } else if (templateId === 'kpi-performance') {
        if (!kpiKey) { toast.error?.('Select a KPI first.'); setStatus('idle'); return }
        const branches = buildBranchSummaries(scopedPharmacies.map((p) => p.id))
        dataset = buildKpiPerformanceDataset({ branches, kpiKey, registry: liveRegistry, generatedBy, periodLabel: month })
      } else if (templateId === 'import-audit') {
        if (!isAdmin) { toast.error?.('Import Audit export requires the Admin role.'); setStatus('idle'); return }
        const jobs = await listRecentImportJobs(50)
        dataset = buildImportAuditDataset({ jobs, generatedBy })
      } else {
        setStatus('idle')
        return
      }

      const validation = validateExportDataset(dataset)
      setValidationResult(validation)
      if (!validation.valid) {
        setStatus('error')
        await recordExportAudit({
          templateId, templateName: template.name, actorUid: userProfile?.id ?? '', actorRole: userProfile?.role ?? '',
          scopeLabel: dataset.meta.scopeLabel, format: format_, generatedAt: dataset.meta.generatedAt,
          rowCount: dataset.meta.rowCount, workbookVersion: dataset.meta.workbookVersion, status: 'BLOCKED',
          failureCategory: validation.issues.find((i) => i.blocking)?.code, fileName: buildExportFileName(dataset, format_),
        })
        return
      }

      if (format_ === 'csv') {
        const sheet = dataset.rawData ?? dataset.sheets[0]
        const fileName = buildExportFileName(dataset, 'csv')
        downloadCsv(sheet, fileName)
      } else {
        await downloadExportWorkbook(dataset)
      }

      await recordExportAudit({
        templateId, templateName: template.name, actorUid: userProfile?.id ?? '', actorRole: userProfile?.role ?? '',
        scopeLabel: dataset.meta.scopeLabel, format: format_, generatedAt: dataset.meta.generatedAt,
        rowCount: dataset.meta.rowCount, workbookVersion: dataset.meta.workbookVersion, status: 'SUCCESS',
        fileName: buildExportFileName(dataset, format_),
      })
      setLastDataset(dataset)
      setStatus('done')
    } catch (err) {
      toast.error?.(err.message || 'Export failed')
      setStatus('error')
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 960 }}>
      <h1 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <FileSpreadsheet size={22} /> Export Studio
      </h1>
      <p style={{ opacity: 0.75, marginBottom: 16 }}>
        Generate ready-to-share management workbooks from validated PharmaPulse data.
        Every export is scope-aware — you only ever see data you're authorized to see.
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <label>
          Template
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} style={{ display: 'block', marginTop: 4 }}>
            {EXPORT_TEMPLATE_CATALOG.map((t) => (
              <option key={t.id} value={t.id}>{t.name}{t.unavailableReason ? ' (Not available yet)' : ''}</option>
            ))}
          </select>
        </label>

        {template?.selectors.required.includes('month') && (
          <label>
            Month
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ display: 'block', marginTop: 4 }} />
          </label>
        )}

        {(template?.selectors.required.includes('branch') || template?.selectors.optional.includes('branch')) && (
          <label>
            Branch
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)} style={{ display: 'block', marginTop: 4 }}>
              <option value="">All authorized branches</option>
              {scopedPharmacies.map((p) => <option key={p.id} value={p.id}>{p.name ?? p.id}</option>)}
            </select>
          </label>
        )}

        {template?.selectors.required.includes('kpi') && (
          <label>
            KPI
            <select value={kpiKey} onChange={(e) => setKpiKey(e.target.value)} style={{ display: 'block', marginTop: 4 }}>
              <option value="">Select a KPI</option>
              {kpiOptions.map((k) => <option key={k} value={k}>{getKpiMetaForKey(k, liveRegistry).en}</option>)}
            </select>
          </label>
        )}

        {template?.selectors.optional.includes('includeRawData') && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 20 }}>
            <input type="checkbox" checked={includeRawData} onChange={(e) => setIncludeRawData(e.target.checked)} />
            Include Raw Data sheet
          </label>
        )}

        <label>
          Format
          <select value={format_} onChange={(e) => setFormat(e.target.value)} style={{ display: 'block', marginTop: 4 }}>
            {(template?.supportedFormats ?? ['xlsx']).map((f) => <option key={f} value={f}>{f.toUpperCase()}</option>)}
          </select>
        </label>
      </div>

      {template?.unavailableReason && (
        <div style={{ padding: 12, background: 'var(--surface-warning, #fff3cd)', borderRadius: 8, marginBottom: 16 }}>
          <AlertTriangle size={16} /> <strong>Not available yet.</strong> {template.unavailableReason}
        </div>
      )}

      {template && !template.unavailableReason && (
        <div style={{ padding: 12, border: '1px solid var(--border, #e5e7eb)', borderRadius: 8, marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Preview Summary</h3>
          <div style={{ fontSize: 13, opacity: 0.85 }}>
            <div>Template: {template.name} (v{template.workbookVersion})</div>
            <div>Expected sheets: {template.sheets.map((s) => s.name).join(', ')}</div>
            {template.knownLimitations.length > 0 && (
              <div style={{ marginTop: 8 }}>
                {template.knownLimitations.map((l, i) => <div key={i} style={{ opacity: 0.7 }}>· {l}</div>)}
              </div>
            )}
          </div>
        </div>
      )}

      <button onClick={handleGenerate} disabled={!template || !!template.unavailableReason || status === 'generating' || loading}>
        {status === 'generating' ? <Loader2 className="spin" size={16} /> : <Download size={16} />}
        {status === 'generating' ? 'Generating…' : 'Generate & Download'}
      </button>

      {validationResult && !validationResult.valid && (
        <div style={{ marginTop: 16, padding: 12, background: 'var(--surface-error, #fee2e2)', borderRadius: 8 }}>
          <h4 style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}><AlertTriangle size={16} /> Validation failed — not downloaded</h4>
          {validationResult.issues.filter((i) => i.blocking).map((i, idx) => (
            <div key={idx} style={{ fontSize: 13, marginTop: 4 }}>{i.message}</div>
          ))}
        </div>
      )}

      {status === 'done' && (
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--text-success, #15803d)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <CheckCircle2 size={16} /> Export downloaded.
          </span>
          {lastDataset && (
            <button
              onClick={() => {
                const { shareUrl } = buildWhatsappSummary(lastDataset)
                window.open(shareUrl, '_blank', 'noopener')
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <MessageCircle size={16} /> Share summary via WhatsApp
            </button>
          )}
        </div>
      )}

      <div style={{ marginTop: 32 }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16 }}>
          <History size={18} /> Recent Exports
        </h2>
        {!isAdmin && <p style={{ fontSize: 13, opacity: 0.6 }}>Export history requires the Admin role.</p>}
        {isAdmin && history == null && <p style={{ fontSize: 13, opacity: 0.6 }}>Loading…</p>}
        {isAdmin && history && history.length === 0 && <p style={{ fontSize: 13, opacity: 0.6 }}>No exports yet.</p>}
        {isAdmin && history && history.length > 0 && (
          <>
            {/* PR-1E4 — phone-width card list, same `history` data/order
                as the table below (mobile-blueprint.md rule). */}
            <div className="sm:hidden space-y-2">
              {history.map((h, idx) => (
                <MobileRankCard
                  key={idx}
                  title={h.templateName}
                  subtitle={h.scopeLabel}
                  primaryMetric={{ label: 'Rows', value: h.rowCount }}
                  secondaryMetrics={[{ label: 'Format', value: h.format }]}
                  status={{ label: h.status }}
                />
              ))}
            </div>
            <table className="hidden sm:table" style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', opacity: 0.6 }}>
                  <th style={{ padding: '4px 8px' }}>Template</th>
                  <th style={{ padding: '4px 8px' }}>Scope</th>
                  <th style={{ padding: '4px 8px' }}>Format</th>
                  <th style={{ padding: '4px 8px' }}>Status</th>
                  <th style={{ padding: '4px 8px' }}>Rows</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, idx) => (
                  <tr key={idx} style={{ borderTop: '1px solid var(--border, #f1f5f9)' }}>
                    <td style={{ padding: '4px 8px' }}>{h.templateName}</td>
                    <td style={{ padding: '4px 8px' }}>{h.scopeLabel}</td>
                    <td style={{ padding: '4px 8px' }}>{h.format}</td>
                    <td style={{ padding: '4px 8px' }}>{h.status}</td>
                    <td style={{ padding: '4px 8px' }}>{h.rowCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  )
}
