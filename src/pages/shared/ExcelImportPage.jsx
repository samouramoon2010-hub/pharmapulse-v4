// ============================================================
// Excel Import Page
// Upload → Validate → Preview → Import to Firestore
// ============================================================
import React, { useState, useRef, useCallback } from 'react'
import {
  Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertTriangle,
  Download, Loader2, Eye, ChevronDown, Trash2,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useToastStore } from '../../components/ui/Toast'
import EmptyState from '../../components/ui/EmptyState'
import {
  readExcelFile, validateRows, importToFirestore,
  downloadTemplate, IMPORT_SCHEMAS,
} from '../../services/importService'

const STATUS = { IDLE: 'idle', READING: 'reading', VALIDATED: 'validated', IMPORTING: 'importing', DONE: 'done' }

export default function ExcelImportPage() {
  const { userProfile } = useAuthStore()
  const toast = useToastStore()
  const fileRef = useRef(null)

  const [schemaKey,  setSchemaKey]  = useState('pharmacies')
  const [status,     setStatus]     = useState(STATUS.IDLE)
  const [fileName,   setFileName]   = useState('')
  const [validRows,  setValidRows]  = useState([])
  const [rowErrors,  setRowErrors]  = useState([])
  const [totalRows,  setTotalRows]  = useState(0)
  const [result,     setResult]     = useState(null)
  const [showErrors, setShowErrors] = useState(false)

  const schema = IMPORT_SCHEMAS[schemaKey]

  const reset = () => {
    setStatus(STATUS.IDLE)
    setValidRows([]); setRowErrors([]); setTotalRows(0)
    setFileName(''); setResult(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleFile = useCallback(async (file) => {
    if (!file) return
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      toast.error('الملف يجب أن يكون Excel (.xlsx, .xls) أو CSV')
      return
    }
    setFileName(file.name)
    setStatus(STATUS.READING)

    try {
      const rows = await readExcelFile(file)
      if (!rows.length) { toast.error('الملف فارغ'); setStatus(STATUS.IDLE); return }

      const { valid, errors, total } = validateRows(rows, schemaKey)
      setValidRows(valid)
      setRowErrors(errors)
      setTotalRows(total)
      setStatus(STATUS.VALIDATED)

      if (errors.length) toast.warning(`${errors.length} صف بها أخطاء — راجع القائمة`)
      else toast.success(`${valid.length} صف جاهز للاستيراد`)
    } catch (e) {
      toast.error(e.message)
      setStatus(STATUS.IDLE)
    }
  }, [schemaKey])

  const handleDrop = (e) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    handleFile(file)
  }

  const handleImport = async () => {
    if (!validRows.length) return
    setStatus(STATUS.IMPORTING)
    try {
      const res = await importToFirestore(validRows, schemaKey, userProfile?.uid, userProfile?.role)
      setResult(res)
      setStatus(STATUS.DONE)
      toast.success(`تم استيراد ${res.imported} سجل بنجاح`)
    } catch (e) {
      toast.error(e.message)
      setStatus(STATUS.VALIDATED)
    }
  }

  const columns = schema ? Object.values(schema.columns) : []
  const previewCols = Object.keys(schema?.columns || {}).slice(0, 5)

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-brand-400" /> استيراد Excel
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">رفع ملفات Excel لاستيراد البيانات إلى النظام</p>
        </div>
        <button onClick={() => downloadTemplate(schemaKey)} className="btn-secondary text-sm gap-2">
          <Download className="w-4 h-4" /> تنزيل Template
        </button>
      </div>

      {/* Schema selector */}
      <div className="kpi-card">
        <h3 className="text-sm font-semibold text-slate-300 mb-3">نوع البيانات المراد استيرادها</h3>
        <div className="flex gap-3 flex-wrap">
          {Object.entries(IMPORT_SCHEMAS).map(([key, s]) => (
            <button key={key} onClick={() => { setSchemaKey(key); reset() }}
              className={`badge transition-all ${schemaKey === key ? 'bg-brand-500/20 text-brand-300 border-brand-500/40' : 'bg-slate-800/60 text-slate-500 border-slate-700'}`}>
              {s.label}
            </button>
          ))}
        </div>

        {/* Required columns */}
        <div className="mt-4 pt-4 border-t border-slate-800/60">
          <p className="text-xs text-slate-500 mb-2">الأعمدة المطلوبة في ملف Excel:</p>
          <div className="flex flex-wrap gap-2">
            {columns.map((col) => (
              <span key={col.label}
                className={`badge text-xs ${col.required !== false ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-slate-800 text-slate-500 border-slate-700'}`}>
                {col.required !== false && '* '}{col.label}
              </span>
            ))}
          </div>
          <p className="text-xs text-slate-600 mt-2">* حقل مطلوب</p>
        </div>
      </div>

      {/* Drop zone */}
      {status === STATUS.IDLE && (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          className="kpi-card border-2 border-dashed border-slate-700 hover:border-brand-500/50 cursor-pointer transition-all py-16 text-center"
        >
          <Upload className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-300 font-medium">اسحب ملف Excel هنا أو اضغط للاختيار</p>
          <p className="text-xs text-slate-600 mt-1">.xlsx, .xls, .csv — حجم أقصى 10MB</p>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={(e) => handleFile(e.target.files[0])} />
        </div>
      )}

      {/* Reading */}
      {status === STATUS.READING && (
        <div className="kpi-card text-center py-12">
          <Loader2 className="w-8 h-8 text-brand-400 animate-spin mx-auto mb-3" />
          <p className="text-slate-300">جاري قراءة الملف وتحقق البيانات...</p>
          <p className="text-xs text-slate-600 mt-1">{fileName}</p>
        </div>
      )}

      {/* Validated */}
      {(status === STATUS.VALIDATED || status === STATUS.IMPORTING) && (
        <div className="space-y-4 animate-fade-in">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'إجمالي الصفوف', value: totalRows,       color: '#6366f1' },
              { label: 'صالح للاستيراد', value: validRows.length, color: '#1a9a7e' },
              { label: 'صفوف بأخطاء',   value: rowErrors.length,  color: '#ef4444' },
            ].map((s) => (
              <div key={s.label} className="kpi-card text-center py-4">
                <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
                <div className="text-xs text-slate-400 mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Errors */}
          {rowErrors.length > 0 && (
            <div className="kpi-card border-red-500/20 bg-red-500/5">
              <button onClick={() => setShowErrors(!showErrors)}
                className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2 text-sm font-semibold text-red-300">
                  <AlertTriangle className="w-4 h-4" />
                  {rowErrors.length} صف تحتوي على أخطاء
                </div>
                <ChevronDown className={`w-4 h-4 text-red-400 transition-transform ${showErrors ? 'rotate-180' : ''}`} />
              </button>
              {showErrors && (
                <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
                  {rowErrors.map((e, i) => (
                    <div key={i} className="text-xs text-red-400/80 bg-red-500/5 rounded-lg px-3 py-2">
                      <span className="font-semibold">الصف {e.row}:</span>{' '}
                      {e.errors.join(' · ')}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Preview table */}
          {validRows.length > 0 && (
            <div className="kpi-card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <Eye className="w-4 h-4 text-brand-400" />
                  معاينة البيانات (أول {Math.min(validRows.length, 5)} صفوف)
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      {previewCols.map((col) => (
                        <th key={col} className="table-header text-right">{schema.columns[col]?.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {validRows.slice(0, 5).map((row, i) => (
                      <tr key={i} className="border-t border-slate-800/60 hover:bg-slate-800/20">
                        {previewCols.map((col) => (
                          <td key={col} className="table-cell">{String(row[col] || '—')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {validRows.length > 5 && (
                  <p className="text-xs text-slate-600 text-center mt-2 pb-2">
                    + {validRows.length - 5} صف إضافي
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button onClick={reset} className="btn-secondary gap-2">
              <Trash2 className="w-4 h-4" /> إلغاء
            </button>
            <button onClick={handleImport}
              disabled={!validRows.length || status === STATUS.IMPORTING}
              className="btn-primary flex-1 justify-center gap-2">
              {status === STATUS.IMPORTING
                ? <><Loader2 className="w-4 h-4 animate-spin" /> جاري الاستيراد...</>
                : <><Upload className="w-4 h-4" /> استيراد {validRows.length} سجل إلى Firestore</>}
            </button>
          </div>
        </div>
      )}

      {/* Done */}
      {status === STATUS.DONE && result && (
        <div className="kpi-card border-green-500/20 bg-green-500/5 animate-fade-in">
          <div className="flex items-center gap-3 mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-400" />
            <div>
              <h3 className="text-base font-bold text-green-300">تم الاستيراد بنجاح!</h3>
              <p className="text-sm text-green-400/70">تم حفظ {result.imported} سجل في Firestore</p>
            </div>
          </div>
          {result.errors?.length > 0 && (
            <p className="text-xs text-amber-400 mb-3">
              ⚠️ {result.errors.length} سجل فشل في الاستيراد
            </p>
          )}
          <button onClick={reset} className="btn-primary">
            استيراد ملف آخر
          </button>
        </div>
      )}
    </div>
  )
}
