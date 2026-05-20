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

  useEffect(() => { const u = subscribe(); return u }, [])

  const reset = () => { setRows([]); setErrors([]); setStatus('idle'); setResult(null); setFileName(''); setProgress(0) }

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
        // Build employeeId→{uid,pharmacyId} map
        const empSnap = await getDocs(collection(db, COL.USERS))
        const empMap  = {}
        empSnap.docs.forEach((d) => {
          const u = d.data()
          if (u.employeeId) empMap[u.employeeId] = { uid:d.id, pharmacyId:u.pharmacyId }
        })

        for (let i = 0; i < rows.length; i++) {
          setProgress(Math.round((i/rows.length)*100))
          const row = rows[i]
          try {
            const info = empMap[String(row.employeeId)]
            if (!info) { result.errors.push({ row, error:`رقم موظف غير موجود: ${row.employeeId}` }); continue }
            await saveKpiEntry({ ...info, date:String(row.date),
              wasfaty:Number(row.wasfaty)||0, omni:Number(row.omni)||0,
              wellness:Number(row.wellness)||0, basket:Number(row.basket)||0,
              crossSelling:Number(row.crossSelling)||0, notes:String(row.notes||''),
              actorId, actorRole })
            result.created++
          } catch (e) { result.errors.push({ row, error:e.message }) }
        }
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
