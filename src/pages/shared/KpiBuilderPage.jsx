// ============================================================
// KPI Builder Page
// Supports all types: number, currency, percentage, boolean, formula
// ============================================================

import React, { useState, useEffect, useMemo } from 'react'
import {
  Plus, Pencil, Trash2, ToggleLeft, ToggleRight,
  Save, X, Loader2, GripVertical, Eye, EyeOff,
  FlaskConical, Info, CheckCircle2,
} from 'lucide-react'
import { useKpiStore } from '../../store/kpiStore'
import { formatKpiValue } from '../../utils/helpers'

const KPI_TYPES = [
  { value: 'number',     label: 'رقم',            example: '15 وحدة' },
  { value: 'currency',   label: 'عملة',            example: '5,000 ر.س' },
  { value: 'percentage', label: 'نسبة مئوية',      example: '85%' },
  { value: 'boolean',    label: 'نعم / لا',         example: 'نعم / لا' },
  { value: 'formula',    label: 'معادلة محسوبة',   example: 'يُحسب من KPIs أخرى' },
]

const PERIODS = [
  { value: 'daily',   label: 'يومي' },
  { value: 'weekly',  label: 'أسبوعي' },
  { value: 'monthly', label: 'شهري' },
]

const ROLES = [
  { value: 'pharmacist',    label: 'صيدلاني' },
  { value: 'store_manager', label: 'مدير الفرع' },
  { value: 'area_manager',  label: 'مدير المنطقة' },
  { value: 'admin',         label: 'مدير النظام' },
]

const COLORS = [
  '#1a9a7e','#6366f1','#ef4444','#f59e0b',
  '#8b5cf6','#ec4899','#06b6d4','#84cc16',
]

const DEFAULT_FORM = {
  name: '', type: 'number', period: 'daily',
  target: '', unit: '', description: '',
  color: '#1a9a7e', visibleTo: ['pharmacist', 'store_manager'],
  active: true, order: 99,
  // formula fields
  formula: '', variables: [],
}

// ─── Formula Builder sub-component ──────────────────────────
function FormulaBuilder({ form, setForm, availableKpis }) {
  const [previewResult, setPreviewResult] = useState(null)

  // Add / remove a KPI variable
  const toggleVariable = (kpiId) => {
    const current = form.variables || []
    if (current.includes(kpiId)) {
      setForm((f) => ({ ...f, variables: current.filter((v) => v !== kpiId) }))
    } else {
      setForm((f) => ({ ...f, variables: [...current, kpiId] }))
    }
  }

  // Preview formula with dummy values (use target as stand-in)
  const previewFormula = () => {
    try {
      let expr = form.formula
      ;(form.variables || []).forEach((kpiId) => {
        const kpi = availableKpis.find((k) => k.id === kpiId)
        if (kpi) expr = expr.split(kpiId).join(String(kpi.target || 1))
      })
      const sanitized = expr.replace(/[^0-9+\-*/().,\s]/g, '')
      // eslint-disable-next-line no-new-func
      const result = Function('"use strict"; return (' + sanitized + ')')()
      setPreviewResult(isFinite(result) ? Math.round(result * 100) / 100 : 'خطأ في المعادلة')
    } catch {
      setPreviewResult('خطأ في المعادلة')
    }
  }

  return (
    <div className="space-y-4 p-4 rounded-xl border border-cyan-500/20 bg-cyan-500/5">
      <div className="flex items-center gap-2 text-cyan-400 text-sm font-semibold">
        <FlaskConical className="w-4 h-4" />
        إعداد المعادلة
      </div>

      {/* Variable KPIs selector */}
      <div>
        <label className="block text-xs text-slate-400 mb-2">
          KPIs المستخدمة في المعادلة
        </label>
        <div className="flex flex-wrap gap-2">
          {availableKpis.map((kpi) => {
            const selected = (form.variables || []).includes(kpi.id)
            return (
              <button
                key={kpi.id}
                type="button"
                onClick={() => toggleVariable(kpi.id)}
                className="badge transition-all text-xs"
                style={selected
                  ? { background: `${kpi.color}20`, borderColor: `${kpi.color}50`, color: kpi.color }
                  : { background: 'rgba(30,41,59,0.6)', borderColor: '#334155', color: '#64748b' }
                }
              >
                {selected && <CheckCircle2 className="w-3 h-3" />}
                {kpi.name}
                <code className="text-xs opacity-60 mr-1">{kpi.id}</code>
              </button>
            )
          })}
        </div>
        <p className="text-xs text-slate-600 mt-1.5">
          استخدم ID الـ KPI في المعادلة (ظاهر بجانب كل اسم)
        </p>
      </div>

      {/* Formula expression */}
      <div>
        <label className="block text-xs text-slate-400 mb-1.5">
          المعادلة <span className="text-slate-600">(استخدم +، -، *، /، والأقواس)</span>
        </label>
        <input
          type="text"
          value={form.formula}
          onChange={(e) => setForm((f) => ({ ...f, formula: e.target.value }))}
          placeholder="مثال: (kpi-001 / 5000 * 50) + (kpi-002 / 15 * 30)"
          className="font-mono text-sm text-cyan-300"
          dir="ltr"
        />
      </div>

      {/* Formula examples */}
      <div className="space-y-1.5">
        <p className="text-xs text-slate-500 font-medium">أمثلة جاهزة:</p>
        {[
          { label: 'معدل الإنتاجية',   expr: '(kpi-001 / 5000 * 50) + (kpi-002 / 15 * 30) + (kpi-004 / 5 * 20)' },
          { label: 'إجمالي الوحدات',   expr: 'kpi-002 + kpi-003 + kpi-004' },
          { label: 'نسبة تحقيق المبيعات', expr: 'kpi-001 / 5000 * 100' },
        ].map((ex) => (
          <button
            key={ex.label}
            type="button"
            onClick={() => setForm((f) => ({ ...f, formula: ex.expr }))}
            className="text-xs text-slate-500 hover:text-cyan-400 transition-colors flex items-center gap-1.5"
          >
            <span className="text-slate-700">←</span>
            <span className="font-medium">{ex.label}:</span>
            <code className="text-cyan-600/70 font-mono">{ex.expr}</code>
          </button>
        ))}
      </div>

      {/* Preview */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={previewFormula}
          disabled={!form.formula || !(form.variables || []).length}
          className="btn-secondary text-xs py-1.5 px-3"
        >
          معاينة الحساب
        </button>
        {previewResult !== null && (
          <div className={`text-sm font-semibold ${typeof previewResult === 'number' ? 'text-cyan-400' : 'text-red-400'}`}>
            النتيجة: {previewResult} {typeof previewResult === 'number' ? form.unit : ''}
          </div>
        )}
      </div>

      <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-800/40 rounded-lg p-2.5">
        <Info className="w-3 h-3 flex-shrink-0 mt-0.5 text-cyan-500" />
        هذه KPI تُحسب تلقائياً من بيانات الصيادلة ولا يحتاجون لإدخالها يدوياً.
      </div>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────
export default function KpiBuilderPage() {
  const { templates, subscribeTemplates, createTemplate, updateTemplate, deleteTemplate, toggleTemplate } = useKpiStore()
  const [showForm,     setShowForm]     = useState(false)
  const [editId,       setEditId]       = useState(null)
  const [form,         setForm]         = useState(DEFAULT_FORM)
  const [saving,       setSaving]       = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  // ── Realtime subscription ──
  useEffect(() => {
    const unsub = subscribeTemplates()
    return unsub
  }, [])

  // Non-formula KPIs available as variables
  const inputKpis = useMemo(
    () => templates.filter((t) => t.type !== 'formula' && t.id !== editId),
    [templates, editId]
  )

  const openCreate = () => {
    setForm({ ...DEFAULT_FORM, order: templates.length + 1 })
    setEditId(null)
    setShowForm(true)
  }

  const openEdit = (tpl) => {
    setForm({ ...DEFAULT_FORM, ...tpl })
    setEditId(tpl.id)
    setShowForm(true)
  }

  const closeForm = () => { setShowForm(false); setEditId(null); setForm(DEFAULT_FORM) }

  const toggleRole = (role) => {
    const cur = form.visibleTo || []
    setForm((f) => ({
      ...f,
      visibleTo: cur.includes(role) ? cur.filter((r) => r !== role) : [...cur, role],
    }))
  }

  const handleSave = async () => {
    if (!form.name) return
    if (form.type !== 'boolean' && form.type !== 'formula' && !form.target) return
    setSaving(true)
    try {
      const data = {
        ...form,
        target: form.type === 'boolean' ? 1 : Number(form.target),
      }
      editId ? await updateTemplate(editId, data) : await createTemplate(data)
      closeForm()
    } catch { /* error shown via store */ } finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    await deleteTemplate(id)
    setDeleteConfirm(null)
  }

  const typeInfo = KPI_TYPES.find((t) => t.value === form.type)
  const isFormula = form.type === 'formula'

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">KPI Builder</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {templates.length} مؤشر — {templates.filter((t) => t.active).length} مفعّل
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus className="w-4 h-4" /> KPI جديدة
        </button>
      </div>

      {/* Templates list */}
      <div className="space-y-3">
        {templates.length === 0 && (
          <div className="kpi-card text-center py-12 text-slate-500">لا توجد KPI بعد</div>
        )}

        {templates.map((tpl) => (
          <div key={tpl.id} className="kpi-card flex items-center gap-4">
            <GripVertical className="w-4 h-4 text-slate-700 cursor-grab flex-shrink-0" />
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: tpl.color || '#1a9a7e' }} />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-slate-200">{tpl.name}</span>
                <span className={`badge text-xs ${tpl.type === 'formula' ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                  {KPI_TYPES.find((t) => t.value === tpl.type)?.label}
                </span>
                <span className="badge text-xs bg-slate-800 text-slate-500 border-slate-700">
                  {PERIODS.find((p) => p.value === tpl.period)?.label}
                </span>
                {!tpl.active && <span className="badge text-xs bg-red-500/10 text-red-400 border-red-500/20">معطّل</span>}
                {tpl.type === 'formula' && <span className="badge text-xs bg-cyan-500/10 text-cyan-400 border-cyan-500/20">محسوبة تلقائياً</span>}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {tpl.type === 'formula'
                  ? <code className="text-cyan-600/70 font-mono">{tpl.formula}</code>
                  : `الهدف: ${formatKpiValue(tpl.target, tpl.type, tpl.unit)}`
                }
                {tpl.description && ` · ${tpl.description}`}
              </div>
            </div>

            {/* Visibility badges */}
            <div className="hidden sm:flex gap-1">
              {(tpl.visibleTo || []).slice(0, 2).map((r) => (
                <span key={r} className="badge bg-slate-800/60 text-slate-500 border-slate-700 text-xs">
                  {ROLES.find((ro) => ro.value === r)?.label?.split(' ')[0]}
                </span>
              ))}
              {(tpl.visibleTo || []).length > 2 && (
                <span className="badge bg-slate-800/60 text-slate-500 border-slate-700 text-xs">
                  +{tpl.visibleTo.length - 2}
                </span>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <button onClick={() => toggleTemplate(tpl.id)} className="p-2 rounded-lg hover:bg-slate-800 transition-colors">
                {tpl.active
                  ? <ToggleRight className="w-4 h-4 text-brand-400" />
                  : <ToggleLeft  className="w-4 h-4 text-slate-600" />
                }
              </button>
              <button onClick={() => openEdit(tpl)} className="p-2 rounded-lg hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-200">
                <Pencil className="w-4 h-4" />
              </button>
              {deleteConfirm === tpl.id ? (
                <div className="flex items-center gap-1">
                  <button onClick={() => handleDelete(tpl.id)} className="px-2 py-1 text-xs bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30">تأكيد</button>
                  <button onClick={() => setDeleteConfirm(null)} className="px-2 py-1 text-xs bg-slate-800 text-slate-400 rounded-lg">إلغاء</button>
                </div>
              ) : (
                <button onClick={() => setDeleteConfirm(tpl.id)} className="p-2 rounded-lg hover:bg-red-500/10 transition-colors text-slate-600 hover:text-red-400">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Modal Form ────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeForm} />
          <div className="relative bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl animate-slide-up">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">{editId ? 'تعديل KPI' : 'KPI جديدة'}</h2>
              <button onClick={closeForm} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400"><X className="w-5 h-5" /></button>
            </div>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">اسم KPI *</label>
                <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="مثال: المبيعات اليومية" />
              </div>

              {/* Type + Period */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">نوع KPI *</label>
                  <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value, formula: '', variables: [] }))}>
                    {KPI_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-600 mt-1">{typeInfo?.example}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">الفترة</label>
                  <select value={form.period} onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))}>
                    {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Target + Unit (hidden for boolean) */}
              {!isFormula && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">
                      الهدف {form.type !== 'boolean' && '*'}
                    </label>
                    <input type="number" min="0" value={form.target}
                      onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))}
                      placeholder="مثال: 5000"
                      disabled={form.type === 'boolean'}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">الوحدة</label>
                    <input type="text" value={form.unit}
                      onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                      placeholder="ر.س / وحدة / باقة"
                    />
                  </div>
                </div>
              )}

              {/* Formula target + unit */}
              {isFormula && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">الهدف</label>
                    <input type="number" min="0" value={form.target}
                      onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))}
                      placeholder="مثال: 100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">الوحدة</label>
                    <input type="text" value={form.unit}
                      onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                      placeholder="نقطة / %"
                    />
                  </div>
                </div>
              )}

              {/* Formula Builder */}
              {isFormula && (
                <FormulaBuilder form={form} setForm={setForm} availableKpis={inputKpis} />
              )}

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">الوصف</label>
                <textarea value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="وصف اختياري..." rows={2}
                />
              </div>

              {/* Color */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">اللون</label>
                <div className="flex gap-2 flex-wrap">
                  {COLORS.map((c) => (
                    <button key={c} type="button" onClick={() => setForm((f) => ({ ...f, color: c }))}
                      className={`w-8 h-8 rounded-lg transition-all ${form.color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900 scale-110' : ''}`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>

              {/* Visibility */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">مرئي لـ</label>
                <div className="flex flex-wrap gap-2">
                  {ROLES.map((r) => (
                    <button key={r.value} type="button" onClick={() => toggleRole(r.value)}
                      className={`badge transition-all ${(form.visibleTo || []).includes(r.value) ? 'bg-brand-500/20 text-brand-300 border-brand-500/40' : 'bg-slate-800/60 text-slate-500 border-slate-700'}`}
                    >
                      {(form.visibleTo || []).includes(r.value) ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Active toggle */}
              <div className="flex items-center justify-between py-2">
                <span className="text-sm font-medium text-slate-300">الحالة</span>
                <button type="button" onClick={() => setForm((f) => ({ ...f, active: !f.active }))}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all text-sm ${form.active ? 'bg-brand-500/20 text-brand-300 border-brand-500/30' : 'bg-slate-800 text-slate-500 border-slate-700'}`}
                >
                  {form.active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                  {form.active ? 'مفعّل' : 'معطّل'}
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-6">
              <button onClick={closeForm} className="btn-secondary flex-1 justify-center">إلغاء</button>
              <button
                onClick={handleSave}
                disabled={!form.name || (!isFormula && form.type !== 'boolean' && !form.target) || saving}
                className="btn-primary flex-1 justify-center"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editId ? 'حفظ التعديلات' : 'إنشاء KPI'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
