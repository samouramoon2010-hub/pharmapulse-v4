// ============================================================
// Import Center — Pharmacies / Users / Targets / KPI Entries
// ============================================================
import React, { useState, useRef, useCallback, useEffect } from 'react'
import * as XLSX from 'xlsx'
import {
  FileSpreadsheet, Upload, Download, CheckCircle2,
  XCircle, AlertTriangle, Eye, Loader2, Trash2, RefreshCw,
} from 'lucide-react'
import { useAuthStore }     from '../../store/authStore'
import { usePharmacyStore } from '../../store/pharmacyStore'
import { useToastStore }    from '../../components/ui/Toast'
import { bulkImportPharmacies } from '../../services/pharmacyService'
import { createUser }           from '../../services/userService'
import { saveTarget, saveKpiEntry } from '../../services/kpiService'
import {
  readExcelFile as readExcelSafe,
  parseExcelRowsToRaw,
  previewKpiImport,
  commitValidatedKpiBatch,
} from '../../services/kpiImportService'
import {
  collection, query, where, getDocs,
} from 'firebase/firestore'
import { db, COL } from '../../services/firebase'

const SCHEMAS = {
  pharmacies: {
    label: 'الفروع',
    columns: ['code','name','region','city','managerEmail','active'],
    required: ['code','name'],
    template: [{ code:'5074', name:'صيدلية الأثير', region:'الدمام', city:'الدمام', managerEmail:'', active:'true' }],
  },
  users: {
    label: 'المستخدمون',
    columns: ['name','email','password','role','employeeId','pharmacyCode','status'],
    required: ['name','email','password','role'],
    template: [{ name:'محمد أحمد', email:'user@co.com', password:'Pass@123', role:'pharmacist', employeeId:'EMP-001', pharmacyCode:'5074', status:'active' }],
  },
  targets: {
    label: 'الأهداف',
    columns: ['pharmacyCode','month','salesTarget','wasfatyTarget','omniTarget','wellnessTarget','crossSellTarget'],
    required: ['pharmacyCode','month'],
    template: [{ pharmacyCode:'5074', month:'2025-05', salesTarget:50000, wasfatyTarget:200, omniTarget:100, wellnessTarget:150, crossSellTarget:80 }],
  },
  kpi_entries: {
    label: 'إدخالات KPI',
    columns: ['employeeId','date','wasfaty','omni','wellness','basket','crossSelling','notes'],
    required: ['employeeId','date'],
    template: [{ employeeId:'EMP-001', date:'2025-05-01', wasfaty:5, omni:3, wellness:4, basket:2, crossSelling:2, notes:'' }],
  },
}

function downloadTemplate(schemaKey) {
  const schema = SCHEMAS[schemaKey]
  const ws = XLSX.utils.json_to_sheet(schema.template)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Template')
  XLSX.writeFile(wb, `pharmapulse-${schemaKey}-template.xlsx`)
}

export default function ImportCenterPage() {
  const { userProfile }   = useAuthStore()
  const { pharmacies, subscribe } = usePharmacyStore()
  const toast = useToastStore()
  const fileRef = useRef(null)

  const [schemaKey, setSchemaKey] = useState('pharmacies')
  const [rows,      setRows]      = useState([])
  const [errors,    setErrors]    = useState([])
  const [status,    setStatus]    = useState('idle') // idle|reading|preview|importing|done
  const [result,    setResult]    = useState(null)
  const [fileName,  setFileName]  = useState('')
  const [progress,  setProgress]  = useState(0)
  // KPI import: staged pipeline state
  const [kpiPreview,    setKpiPreview]    = useState(null)   // ImportPreview
  const [kpiCommitting, setKpiCommitting] = useState(false)

  useEffect(() => { const u = subscribe(); return u }, [])

  const reset = () => {
    setRows([]); setErrors([]); setStatus('idle'); setResult(null)
    setFileName(''); setProgress(0); setKpiPreview(null); setKpiCommitting(false)
  }

  // ── KPI Staged Commit ─────────────────────────────────────
  const handleKpiCommit = async () => {
    if (!kpiPreview || kpiCommitting) return
    setKpiCommitting(true)
    try {
      const ctx = {
        uid:        userProfile?.uid,
        role:       userProfile?.role,
        pharmacyId: userProfile?.pharmacyId || null,
      }
      const commitResult = await commitValidatedKpiBatch(kpiPreview, ctx, userProfile?.role)
      setResult({ created: commitResult.committed, skipped: commitResult.skipped, errors: commitResult.errors.map(e => ({ row: e.stagingId, error: e.error })) })
      setStatus('done')
      toast.success(`Import complete — ${commitResult.committed} KPI entries committed`)
    } catch (e) {
      toast.error('Commit failed: ' + e.message)
      setStatus('kpi_preview')
    } finally {
      setKpiCommitting(false)
    }
  }

  const handleFile = useCallback(async (file) => {
    if (!file) return
    setFileName(file.name)
    setStatus('reading')
    try {
      const ab   = await file.arrayBuffer()
      const wb   = XLSX.read(ab, { type:'array' })
      const ws   = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(ws, { defval:'' })
      if (!data.length) { toast.error('الملف فارغ'); setStatus('idle'); return }

      // Validate
      const schema = SCHEMAS[schemaKey]
      const validRows = []; const errRows = []
      data.forEach((row, i) => {
        const rowErrs = []
        schema.required.forEach((f) => {
          const v = row[f] ?? ''
          if (String(v).trim() === '') rowErrs.push(`"${f}" مطلوب`)
        })
        if (rowErrs.length) errRows.push({ row: i+2, errors: rowErrs, data: row })
        else validRows.push(row)
      })
      setRows(validRows)
      setErrors(errRows)
      setStatus('preview')
    } catch (e) {
      toast.error('فشل قراءة الملف: ' + e.message)
      setStatus('idle')
    }
  }, [schemaKey])

  const handleImport = async () => {
    if (!rows.length) return
    setStatus('importing')
    setProgress(0)
    const actorId   = userProfile?.uid
    const actorRole = userProfile?.role
    let result = { created:0, skipped:0, errors:[] }

    try {
      if (schemaKey === 'pharmacies') {
        result = await bulkImportPharmacies(rows, actorId, actorRole)

      } else if (schemaKey === 'users') {
        // Build pharmacyCode→id map
        const pcMap = {}
        pharmacies.forEach((p) => { pcMap[p.code] = p.id })

        for (let i = 0; i < rows.length; i++) {
          setProgress(Math.round((i/rows.length)*100))
          const row = rows[i]
          try {
            // Check duplicate email
            const eq = query(collection(db, COL.USERS), where('email','==',String(row.email).toLowerCase()))
            const es = await getDocs(eq)
            if (!es.empty) { result.skipped++; continue }

            await createUser({
              displayName: String(row.name), email: String(row.email),
              password:    String(row.password), role: String(row.role),
              status:      String(row.status||'active'),
              pharmacyId:  pcMap[String(row.pharmacyCode)] || null,
              employeeId:  String(row.employeeId||''),
              sendWelcomeEmail: false,
              actorId, actorRole,
            })
            result.created++
          } catch (e) { result.errors.push({ row, error: e.message }) }
        }

      } else if (schemaKey === 'targets') {
        const pcMap = {}
        pharmacies.forEach((p) => { pcMap[p.code] = p.id })

        for (let i = 0; i < rows.length; i++) {
          setProgress(Math.round((i/rows.length)*100))
          const row = rows[i]
          try {
            const pid = pcMap[String(row.pharmacyCode)]
            if (!pid) { result.errors.push({ row, error: `كود الفرع غير موجود: ${row.pharmacyCode}` }); continue }
            await saveTarget({ pharmacyId:pid, month:String(row.month),
              salesTarget:Number(row.salesTarget)||0, wasfatyTarget:Number(row.wasfatyTarget)||0,
              omniTarget:Number(row.omniTarget)||0, wellnessTarget:Number(row.wellnessTarget)||0,
              crossSellTarget:Number(row.crossSellTarget)||0, actorId, actorRole })
            result.created++
          } catch (e) { result.errors.push({ row, error: e.message }) }
        }

      } else if (schemaKey === 'kpi_entries') {
        // ── STAGED PIPELINE — no dirty writes ─────────────────
        // 1. Parse raw rows through ingestion layer
        const rawRows = parseExcelRowsToRaw(rows, fileName)

        // 2. Validate + preview (no Firestore write yet)
        const ctx = {
          uid:        actorId,
          role:       actorRole,
          pharmacyId: userProfile?.pharmacyId || null,
        }
        const preview = await previewKpiImport(
          rawRows, ctx,
          userProfile?.pharmacyId || '',
          pharmacies,
          fileName,
        )
        setKpiPreview(preview)
        setStatus('kpi_preview')   // pause here — user sees preview
        setProgress(100)
        return   // don't continue to done — user must confirm
      }

      setProgress(100)
      setResult(result)
      setStatus('done')
      toast.success(`تم الاستيراد: ${result.created} سجل`)
    } catch (e) {
      toast.error('فشل الاستيراد: ' + e.message)
      setStatus('preview')
    }
  }

  const downloadErrors = () => {
    if (!result?.errors?.length) return
    const ws = XLSX.utils.json_to_sheet(result.errors.map((e) => ({ row: JSON.stringify(e.row), error: e.error })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Errors')
    XLSX.writeFile(wb, `import-errors-${schemaKey}.xlsx`)
  }

  const schema = SCHEMAS[schemaKey]

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-brand-400"/>مركز الاستيراد
          </h1>
          <p className="text-sm text-slate-500">رفع ملفات Excel لاستيراد البيانات دفعة واحدة</p>
        </div>
        <button onClick={() => downloadTemplate(schemaKey)} className="btn btn-secondary gap-2">
          <Download className="w-4 h-4"/>تنزيل Template
        </button>
      </div>

      {/* Schema selector */}
      <div className="flex gap-2 flex-wrap">
        {Object.entries(SCHEMAS).map(([k,s]) => (
          <button key={k} onClick={() => { setSchemaKey(k); reset() }}
            className={`badge transition-all cursor-pointer ${
              schemaKey===k
                ? 'bg-brand-500/20 text-brand-300 border-brand-500/40'
                : 'bg-slate-800/60 text-slate-500 border-slate-700'
            }`}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Columns info */}
      <div className="card card-p">
        <p className="text-xs text-slate-500 mb-2">الأعمدة المطلوبة:</p>
        <div className="flex flex-wrap gap-2">
          {schema.columns.map((c) => (
            <span key={c} className={`badge text-xs ${
              schema.required.includes(c)
                ? 'bg-red-500/10 text-red-400 border-red-500/20'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}>{schema.required.includes(c)&&'* '}{c}</span>
          ))}
        </div>
      </div>

      {/* Drop zone */}
      {status==='idle' && (
        <div onDrop={(e)=>{e.preventDefault();handleFile(e.dataTransfer.files[0])}}
             onDragOver={(e)=>e.preventDefault()}
             onClick={()=>fileRef.current?.click()}
             className="card border-2 border-dashed border-slate-700 hover:border-brand-500/50 cursor-pointer
                        transition-all py-16 text-center">
          <Upload className="w-10 h-10 text-slate-600 mx-auto mb-3"/>
          <p className="text-slate-300 font-medium">اسحب ملف Excel هنا أو اضغط للاختيار</p>
          <p className="text-xs text-slate-600 mt-1">.xlsx, .xls, .csv</p>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                 onChange={(e)=>handleFile(e.target.files[0])}/>
        </div>
      )}

      {status==='reading' && (
        <div className="card card-p text-center py-12">
          <Loader2 className="w-8 h-8 text-brand-400 animate-spin mx-auto mb-3"/>
          <p className="text-slate-300">جاري قراءة الملف...</p>
        </div>
      )}

      {(status==='preview'||status==='importing') && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label:'إجمالي الصفوف', value:rows.length+errors.length, color:'#6366f1' },
              { label:'صالح', value:rows.length, color:'#22c55e' },
              { label:'يحتوي أخطاء', value:errors.length, color:'#ef4444' },
            ].map((s)=>(
              <div key={s.label} className="card card-p text-center py-4">
                <div className="text-2xl font-bold" style={{color:s.color}}>{s.value}</div>
                <div className="text-xs text-slate-400 mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Errors */}
          {errors.length>0 && (
            <div className="card card-p border-red-500/20 bg-red-500/5 space-y-2">
              <p className="text-sm font-semibold text-red-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4"/>{errors.length} صف بأخطاء
              </p>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {errors.map((e,i)=>(
                  <p key={i} className="text-xs text-red-400/80">
                    الصف {e.row}: {e.errors.join(' · ')}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Preview */}
          {rows.length>0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
                <Eye className="w-4 h-4 text-brand-400"/>
                <span className="text-sm font-semibold text-slate-200">معاينة (أول 5 صفوف)</span>
              </div>
              <div className="overflow-x-auto">
                <table className="tbl text-xs">
                  <thead><tr>{schema.columns.map((c)=><th key={c}>{c}</th>)}</tr></thead>
                  <tbody>{rows.slice(0,5).map((row,i)=>(
                    <tr key={i}>{schema.columns.map((c)=>(
                      <td key={c}>{String(row[c]??'—').slice(0,30)}</td>
                    ))}</tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}

          {status==='importing' && (
            <div className="card card-p space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">جاري الاستيراد...</span>
                <span className="text-brand-400 font-bold">{progress}%</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2">
                <div className="h-full rounded-full bg-brand-500 transition-all duration-300"
                     style={{width:`${progress}%`}}/>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={reset} disabled={status==='importing'} className="btn btn-secondary gap-2">
              <Trash2 className="w-4 h-4"/>إلغاء
            </button>
            <button onClick={handleImport} disabled={!rows.length||status==='importing'} className="btn btn-primary flex-1 gap-2">
              {status==='importing'
                ? <><Loader2 className="w-4 h-4 animate-spin"/>جاري الاستيراد...</>
                : <><Upload className="w-4 h-4"/>استيراد {rows.length} سجل</>}
            </button>
          </div>
        </div>
      )}

      {/* ── KPI Import Preview — Staged Pipeline ───────────── */}
      {status === 'kpi_preview' && kpiPreview && (
        <div style={{
          background:'var(--bg-surface)', border:'1px solid var(--border-default)',
          borderRadius:'10px', overflow:'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding:'12px 16px', background:'var(--bg-canvas)',
            borderBottom:'1px solid var(--border-subtle)',
            display:'flex', alignItems:'center', justifyContent:'space-between',
          }}>
            <div>
              <div style={{ fontSize:'13px', fontWeight:600, color:'var(--text-primary)' }}>
                KPI Import Preview
              </div>
              <div style={{ fontSize:'11px', color:'var(--text-muted)', marginTop:'1px' }}>
                Review before writing to Firestore — no data written yet
              </div>
            </div>
            <div style={{
              fontSize:'10px', fontWeight:500, padding:'2px 10px', borderRadius:'99px',
              background: kpiPreview.safetyReport.safeToCommit ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
              border:`1px solid ${kpiPreview.safetyReport.safeToCommit ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
              color: kpiPreview.safetyReport.safeToCommit ? '#4ade80' : '#f87171',
              fontFamily:"'Inter',sans-serif",
            }}>
              {kpiPreview.safetyReport.safeToCommit ? '✓ Safe to commit' : '✗ Blocked'}
            </div>
          </div>

          {/* Summary strip */}
          <div style={{
            display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'1px',
            background:'var(--border-subtle)',
          }} className="sm:grid-cols-4">
            {[
              { label:'Total Rows',   value: kpiPreview.totalRows,              color:'var(--text-secondary)' },
              { label:'Valid',        value: kpiPreview.safetyReport.safeRecords, color:'#4ade80' },
              { label:'Invalid',      value: kpiPreview.invalidRows.length,     color: kpiPreview.invalidRows.length > 0 ? '#f87171' : 'var(--text-muted)' },
              { label:'Duplicates',   value: kpiPreview.duplicates,             color: kpiPreview.duplicates > 0 ? '#fbbf24' : 'var(--text-muted)' },
            ].map((s) => (
              <div key={s.label} style={{
                padding:'12px 16px', background:'var(--bg-surface)',
                textAlign:'center',
              }}>
                <div style={{ fontSize:'1.25rem', fontWeight:700, color:s.color, fontVariantNumeric:'tabular-nums' }}>
                  {s.value}
                </div>
                <div style={{ fontSize:'10px', color:'var(--text-muted)', marginTop:'2px', fontFamily:"'Inter',sans-serif", letterSpacing:'0.04em', textTransform:'uppercase' }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          {/* Safety blockers */}
          {!kpiPreview.safetyReport.safeToCommit && kpiPreview.safetyReport.blockers.length > 0 && (
            <div style={{ padding:'10px 16px', background:'rgba(239,68,68,0.05)', borderBottom:'1px solid rgba(239,68,68,0.15)' }}>
              {kpiPreview.safetyReport.blockers.map((b, i) => (
                <div key={i} style={{ fontSize:'12px', color:'#f87171', display:'flex', alignItems:'center', gap:'6px' }}>
                  <span>⛔</span>{b}
                </div>
              ))}
            </div>
          )}

          {/* Invalid rows detail */}
          {kpiPreview.invalidRows.length > 0 && (
            <div style={{ padding:'10px 16px', borderBottom:'1px solid var(--border-subtle)' }}>
              <div style={{ fontSize:'10px', fontWeight:600, color:'#f87171', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'6px', fontFamily:"'Inter',sans-serif" }}>
                Invalid Rows ({kpiPreview.invalidRows.length})
              </div>
              <div style={{ maxHeight:'140px', overflowY:'auto' }}>
                {kpiPreview.invalidRows.slice(0,20).map((r) => (
                  <div key={r.stagingId} style={{ fontSize:'11px', color:'var(--text-secondary)', padding:'3px 0', borderBottom:'1px solid var(--border-subtle)', display:'flex', gap:'8px' }}>
                    <span style={{ color:'var(--text-muted)', flexShrink:0, fontVariantNumeric:'tabular-nums' }}>
                      Row {r.stagingId?.split('-').pop()}
                    </span>
                    <span style={{ color:'#f87171' }}>
                      {r.errors.map(e => e.message).join(' · ')}
                    </span>
                  </div>
                ))}
                {kpiPreview.invalidRows.length > 20 && (
                  <div style={{ fontSize:'11px', color:'var(--text-muted)', padding:'4px 0' }}>
                    ...and {kpiPreview.invalidRows.length - 20} more
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Warning rows */}
          {kpiPreview.warningRows.length > 0 && (
            <div style={{ padding:'10px 16px', borderBottom:'1px solid var(--border-subtle)' }}>
              <div style={{ fontSize:'10px', fontWeight:600, color:'#fbbf24', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'6px', fontFamily:"'Inter',sans-serif" }}>
                Warnings ({kpiPreview.warningRows.length} rows)
              </div>
              {kpiPreview.warningRows.slice(0,5).map((r) => (
                <div key={r.stagingId} style={{ fontSize:'11px', color:'#fbbf24', padding:'2px 0' }}>
                  {r.warnings.map(w => w.message).join(' · ')}
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div style={{ padding:'12px 16px', display:'flex', gap:'8px' }}>
            <button onClick={reset}
              style={{ height:'32px', padding:'0 14px', borderRadius:'8px', fontSize:'12px', fontWeight:500, cursor:'pointer', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', color:'var(--text-secondary)' }}>
              Cancel
            </button>
            <button
              onClick={handleKpiCommit}
              disabled={!kpiPreview.safetyReport.safeToCommit || kpiCommitting || kpiPreview.safetyReport.safeRecords === 0}
              style={{
                flex:1, height:'32px', borderRadius:'8px', fontSize:'12px', fontWeight:600, cursor:'pointer',
                background:'var(--brand-500)', border:'none', color:'#09090b',
                opacity: (!kpiPreview.safetyReport.safeToCommit || kpiPreview.safetyReport.safeRecords === 0) ? 0.4 : 1,
                display:'flex', alignItems:'center', justifyContent:'center', gap:'5px',
              }}>
              {kpiCommitting
                ? 'Committing...'
                : `Commit ${kpiPreview.safetyReport.safeRecords} KPI Entries`
              }
            </button>
          </div>
        </div>
      )}

      {status==='done' && result && (
        <div className="card card-p border-green-500/20 bg-green-500/5 space-y-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-8 h-8 text-green-400"/>
            <div>
              <h3 className="text-base font-bold text-green-300">تم الاستيراد بنجاح!</h3>
              <p className="text-sm text-green-400/70">{result.created} سجل · {result.skipped||0} مكرر · {result.errors?.length||0} أخطاء</p>
            </div>
          </div>
          {result.errors?.length>0 && (
            <button onClick={downloadErrors} className="btn btn-secondary btn-sm gap-2">
              <Download className="w-4 h-4"/>تنزيل تقرير الأخطاء
            </button>
          )}
          <button onClick={reset} className="btn btn-primary gap-2">
            <RefreshCw className="w-4 h-4"/>استيراد ملف آخر
          </button>
        </div>
      )}
    </div>
  )
}
