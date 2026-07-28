// ============================================================
// Smart List Import Section (DX-12)
//
// One-step ingestion of the pharmacy POS item-level smart list
// (the real production export, headers accepted verbatim — see
// smartListParser.ts). Flow: upload → automatic parse + pharmacist
// matching → evidence preview → single explicit commit.
//
// No manual column mapping and no staging job: the file format is
// fixed and known, parsing is pure/client-side, and only compact
// monthly AGGREGATES are persisted (smartListCommitService.ts) —
// the Excel file remains the item-level source of truth.
// ============================================================
import React, { useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import {
  ShoppingBasket, Upload, AlertTriangle, CheckCircle2, Loader2, Users, RotateCcw,
} from 'lucide-react'
import { usePharmacyStore } from '../../store/pharmacyStore'
import { parseSmartListRows, aggregateSmartList } from '../../services/dataExchange/smartList/smartListParser'
import { commitSmartListAggregates } from '../../services/dataExchange/smartList/smartListCommitService'
import { fetchExistingOnboardingData } from '../../services/dataExchange/fetchExistingOnboardingData'
import { extractFileMeta } from '../../services/dataExchange/fileChecksum'

const ACCENT = { color: '#e11d48', bg: 'rgba(225,29,72,0.10)' } // rose

const money = (n) => (typeof n === 'number' ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—')

function Stat({ label, value, warn }) {
  return (
    <div style={{ minWidth: 110 }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: warn ? '#ef4444' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
    </div>
  )
}

export default function SmartListImportSection({ isAdmin, userProfile, toast }) {
  const { pharmacies } = usePharmacyStore()
  const fileRef = useRef(null)

  const [branchId, setBranchId] = useState('')
  const [fileName, setFileName] = useState('')
  const [fileMeta, setFileMeta] = useState(null)
  // idle | parsing | previewed | committing | committed | failed
  const [status, setStatus] = useState('idle')
  const [parseIssues, setParseIssues] = useState([])
  const [aggregate, setAggregate] = useState(null)
  const [resolved, setResolved] = useState(null)   // [{ aggregate, matchedUserId }]
  const [confirmed, setConfirmed] = useState(false)
  const [commitInfo, setCommitInfo] = useState(null)

  const activeBranches = useMemo(
    () => pharmacies.filter((p) => p.active !== false),
    [pharmacies],
  )

  const reset = () => {
    setFileName(''); setFileMeta(null); setParseIssues([])
    setAggregate(null); setResolved(null); setConfirmed(false)
    setCommitInfo(null); setStatus('idle')
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleFile = async (file) => {
    setStatus('parsing')
    setFileName(file.name)
    setCommitInfo(null)
    setConfirmed(false)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const sheetName = wb.SheetNames.find((n) => n.toLowerCase().includes('detail')) || wb.SheetNames[0]
      const raw = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: null })
      const meta = await extractFileMeta(file, buf, sheetName)
      setFileMeta(meta)

      const parsed = parseSmartListRows(raw)
      setParseIssues(parsed.issues)
      if (parsed.rows.length === 0) {
        setAggregate(null); setResolved(null); setStatus('failed')
        return
      }
      const agg = aggregateSmartList(parsed.rows)
      setAggregate(agg)

      // Match file employee ids against app user profiles (same
      // CLAIMED-excluding maps the other pharmacist imports use).
      const existing = await fetchExistingOnboardingData()
      setResolved(agg.pharmacists.map((p) => ({
        aggregate: p,
        matchedUserId: existing.pharmacistsByEmployeeId.get(p.empId)?.id ?? null,
      })))
      setStatus('previewed')
    } catch (err) {
      toast.error?.(err.message || 'Could not read the smart list file')
      setStatus('failed')
    }
  }

  const handleCommit = async () => {
    if (!isAdmin || !aggregate || !resolved || !branchId || !confirmed || status === 'committing') return
    setStatus('committing')
    try {
      const month = aggregate.months[0]
      const result = await commitSmartListAggregates({
        branchId,
        month,
        aggregate,
        resolved,
        actorUid: userProfile?.id ?? 'system',
        sourceFileName: fileName,
        checksum: fileMeta?.checksum,
      })
      setCommitInfo({ ...result, month })
      setStatus('committed')
    } catch (err) {
      toast.error?.(err.message || 'Commit failed')
      setStatus('previewed')
    }
  }

  const multiMonth = aggregate && aggregate.months.length > 1
  const unmatchedCount = resolved ? resolved.filter((r) => r.matchedUserId === null).length : 0
  const canCommit = isAdmin && status === 'previewed' && branchId && confirmed && !multiMonth

  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
      borderRadius: 12, padding: '18px 20px', marginBottom: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: ACCENT.bg, color: ACCENT.color,
        }}>
          <ShoppingBasket size={17} strokeWidth={2} />
        </div>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--text-primary)', margin: 0 }}>
            Smart List — Item Sales
          </h2>
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 3, maxWidth: 640, lineHeight: 1.5 }}>
            Upload the monthly item-level smart list exactly as your POS exports it — columns are
            recognized automatically, pharmacists are matched by employee id, and only monthly
            summaries are saved. Re-uploading a month replaces its summaries.
          </p>
        </div>
      </div>

      {!isAdmin && (
        <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-muted)' }}>
          <AlertTriangle size={16} /> Smart List import requires the Admin role.
        </p>
      )}

      {isAdmin && (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
            <label style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
              Branch
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                style={{ display: 'block', marginTop: 4, minWidth: 220 }}
              >
                <option value="">Select the branch this file belongs to</option>
                {activeBranches.map((p) => <option key={p.id} value={p.id}>{p.name ?? p.code}</option>)}
              </select>
            </label>

            <button
              onClick={() => fileRef.current?.click()}
              disabled={status === 'parsing' || status === 'committing'}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {status === 'parsing' ? <Loader2 className="spin" size={14} /> : <Upload size={14} />}
              {fileName || 'Upload smart list workbook'}
            </button>
            <input
              ref={fileRef} type="file" accept=".xlsx,.xltx,.xls" style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
            />
            {(aggregate || status === 'failed') && (
              <button onClick={reset} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <RotateCcw size={13} /> Start over
              </button>
            )}
          </div>

          {status === 'failed' && parseIssues.length > 0 && (
            <div style={{ padding: 12, borderRadius: 8, background: 'rgba(239,68,68,0.08)', marginBottom: 12 }}>
              <strong style={{ fontSize: 13, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={15} /> File could not be imported
              </strong>
              <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '6px 0 0' }}>{parseIssues[0].message}</p>
            </div>
          )}

          {aggregate && (
            <>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', padding: '12px 0', borderTop: '1px solid var(--border-subtle)' }}>
                <Stat label="Period" value={aggregate.months.join(', ')} warn={multiMonth} />
                <Stat label="Item lines" value={aggregate.branch.txCount.toLocaleString('en-US')} />
                <Stat label="Net sales (SAR)" value={money(aggregate.branch.netSales)} />
                <Stat label={`Returns (${aggregate.branch.returnsCount} lines)`} value={money(aggregate.branch.returnsValue)} />
                <Stat label="Pharmacists" value={aggregate.pharmacists.length} />
                {parseIssues.length > 0 && <Stat label="Skipped rows" value={parseIssues.length} warn />}
              </div>

              {multiMonth && (
                <div style={{ padding: 10, borderRadius: 8, background: 'rgba(239,68,68,0.08)', fontSize: 12.5, color: '#ef4444', marginBottom: 12 }}>
                  <AlertTriangle size={14} style={{ verticalAlign: -2 }} /> This file spans more than one
                  month ({aggregate.months.join(', ')}). Upload one month per file so each month's
                  summary stays authoritative.
                </div>
              )}

              {resolved && (
                <div style={{ marginBottom: 12 }}>
                  <strong style={{ fontSize: 12.5, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Users size={14} /> Pharmacists in this file
                  </strong>
                  <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse', marginTop: 6 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '4px 8px' }}>Employee</th>
                        <th style={{ padding: '4px 8px' }}>Net sales</th>
                        <th style={{ padding: '4px 8px' }}>Lines</th>
                        <th style={{ padding: '4px 8px' }}>Top division</th>
                        <th style={{ padding: '4px 8px' }}>App account</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resolved.map(({ aggregate: p, matchedUserId }) => (
                        <tr key={p.empId} style={{ borderTop: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                          <td style={{ padding: '4px 8px' }}>{p.empName}</td>
                          <td style={{ padding: '4px 8px', fontVariantNumeric: 'tabular-nums' }}>{money(p.netSales)}</td>
                          <td style={{ padding: '4px 8px' }}>{p.txCount.toLocaleString('en-US')}</td>
                          <td style={{ padding: '4px 8px' }}>{p.byDivision[0]?.key ?? '—'}</td>
                          <td style={{ padding: '4px 8px' }}>
                            {matchedUserId
                              ? <span style={{ color: 'var(--text-success, #15803d)' }}>Matched</span>
                              : <span style={{ color: '#d97706' }}>No matching employee id</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {unmatchedCount > 0 && (
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                      Unmatched pharmacists are still imported and appear in branch analytics; link them
                      later by setting the employee id on their user profile.
                    </p>
                  )}
                </div>
              )}

              {status === 'previewed' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-secondary)' }}>
                    <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                    I confirm this is the {aggregate.months[0]} smart list for the selected branch
                  </label>
                  <button onClick={handleCommit} disabled={!canCommit} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CheckCircle2 size={15} /> Import summaries
                  </button>
                  {!branchId && <span style={{ fontSize: 12, color: '#d97706' }}>Select a branch first.</span>}
                </div>
              )}

              {status === 'committing' && (
                <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-muted)' }}>
                  <Loader2 className="spin" size={14} /> Saving monthly summaries…
                </p>
              )}

              {status === 'committed' && commitInfo && (
                <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-success, #15803d)' }}>
                  <CheckCircle2 size={15} /> Imported {commitInfo.pharmacistDocsWritten} pharmacist
                  summaries + branch summary for {commitInfo.month}.
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
