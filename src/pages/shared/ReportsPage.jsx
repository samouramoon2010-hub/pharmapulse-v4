// ============================================================
// Reports Page — daily/weekly/monthly + CSV + Excel export
// ============================================================
import React, { useEffect, useMemo, useState } from 'react'
import { FileText, Download, Calendar, BarChart2, TrendingUp, Building2, ChevronDown, FileSpreadsheet } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useKpiStore } from '../../store/kpiStore'
import { useBranchStore } from '../../store/branchStore'
import { useTeamStore } from '../../store/teamStore'
import PerformanceChart from '../../components/charts/PerformanceChart'
import EmptyState from '../../components/ui/EmptyState'
import { useToastStore } from '../../components/ui/Toast'
import { formatKpiValue, getAchievementColor, currentMonthRange, currentWeekRange, todayStr } from '../../utils/helpers'
import { DUMMY_BRANCHES } from '../../data/dummyData'

const REPORT_TYPES = [
  { id: 'daily',    label: 'يومي',    icon: Calendar,   color: '#1a9a7e' },
  { id: 'weekly',   label: 'أسبوعي',  icon: BarChart2,   color: '#6366f1' },
  { id: 'monthly',  label: 'شهري',    icon: TrendingUp,  color: '#f59e0b' },
]

export default function ReportsPage() {
  const { userProfile } = useAuthStore()
  const { templates, entries, subscribeTemplates, subscribeAllEntries } = useKpiStore()
  const { branches, subscribeBranches } = useBranchStore()
  const { members, subscribeAllMembers } = useTeamStore()
  const toast = useToastStore()

  const [reportType,    setReportType]    = useState('daily')
  const [selectedBranch, setSelectedBranch] = useState(userProfile?.branchId || 'all')
  const [customFrom,    setCustomFrom]    = useState('')
  const [customTo,      setCustomTo]      = useState('')
  const [useCustom,     setUseCustom]     = useState(false)

  useEffect(() => {
    const u1 = subscribeTemplates()
    const u2 = subscribeAllEntries()
    const u3 = subscribeBranches()
    const u4 = subscribeAllMembers()
    return () => { u1(); u2(); u3(); u4() }
  }, [])

  const today = todayStr()
  const { from: weekFrom,  to: weekTo  } = currentWeekRange()
  const { from: monthFrom, to: monthTo } = currentMonthRange()

  const dateRange = useCustom && customFrom && customTo
    ? { from: customFrom, to: customTo }
    : { daily: { from: today, to: today }, weekly: { from: weekFrom, to: weekTo }, monthly: { from: monthFrom, to: monthTo } }[reportType]

  const isManager = ['admin','area_manager','store_manager'].includes(userProfile?.role)
  const activeBranches = branches.length ? branches : DUMMY_BRANCHES

  // Filtered entries
  const rangeEntries = useMemo(() =>
    entries.filter((e) => {
      const inRange  = e.date >= dateRange.from && e.date <= dateRange.to
      const inBranch = selectedBranch === 'all' || e.branchId === selectedBranch
      return inRange && inBranch
    }), [entries, dateRange, selectedBranch])

  const overallAchievement = useMemo(() =>
    rangeEntries.length ? Math.round(rangeEntries.reduce((s,e)=>s+e.achievement,0)/rangeEntries.length) : 0,
    [rangeEntries])

  // Per-KPI summary
  const kpiSummary = useMemo(() =>
    templates.filter((t) => t.active && t.type !== 'formula').map((kpi) => {
      const ke = rangeEntries.filter((e) => e.kpiId === kpi.id)
      const total = ke.reduce((s,e)=>s+e.value,0)
      const avg   = ke.length ? Math.round(ke.reduce((s,e)=>s+e.achievement,0)/ke.length) : 0
      return { ...kpi, total, avgAchievement: avg, count: ke.length }
    }), [templates, rangeEntries])

  // Per-branch summary
  const branchSummary = useMemo(() =>
    activeBranches.map((b) => {
      const be  = rangeEntries.filter((e) => e.branchId === b.id)
      const avg = be.length ? Math.round(be.reduce((s,e)=>s+e.achievement,0)/be.length) : 0
      return { ...b, achievement: avg, entryCount: be.length }
    }).sort((a,b)=>b.achievement-a.achievement),
    [activeBranches, rangeEntries])

  // Per-pharmacist summary
  const pharmacistSummary = useMemo(() => {
    const all = members.length ? members : []
    const pharmacists = all.filter((m) => m.role === 'pharmacist')
    return pharmacists.map((m) => {
      const uid = m.uid || m.id
      const me  = rangeEntries.filter((e) => e.userId === uid)
      const avg = me.length ? Math.round(me.reduce((s,e)=>s+e.achievement,0)/me.length) : 0
      return { ...m, achievement: avg, entryCount: me.length }
    }).sort((a,b)=>b.achievement-a.achievement).slice(0,10)
  }, [members, rangeEntries])

  // Trend chart
  const trendData = useMemo(() => {
    const days = []
    const from = new Date(dateRange.from)
    const to   = new Date(dateRange.to)
    for (let d = new Date(from); d <= to; d.setDate(d.getDate()+1)) {
      const ds = d.toISOString().split('T')[0]
      const de = rangeEntries.filter((e) => e.date === ds)
      const avg = de.length ? Math.round(de.reduce((s,e)=>s+e.achievement,0)/de.length) : 0
      days.push({ date: new Date(d).toLocaleDateString('ar-SA',{day:'2-digit',month:'short'}), value: avg, target: 80 })
    }
    return days
  }, [rangeEntries, dateRange])

  // ── CSV Export ───────────────────────────────────────────────
  const exportCSV = () => {
    const header = 'التاريخ,الفرع,الصيدلاني,KPI,القيمة,الهدف,الإنجاز%\n'
    const rows = rangeEntries.map((e) => {
      const kpi    = templates.find((t) => t.id === e.kpiId)
      const branch = activeBranches.find((b) => b.id === e.branchId)
      const member = members.find((m) => m.uid === e.userId || m.id === e.userId)
      return `${e.date},${branch?.name||''},${member?.displayName||e.userId},${kpi?.name||e.kpiId},${e.value},${e.target},${e.achievement}%`
    }).join('\n')
    const blob = new Blob(['\uFEFF'+header+rows], { type:'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `pharmapulse-${reportType}-${today}.csv`; a.click()
    URL.revokeObjectURL(url)
    toast.success('تم تصدير ملف CSV')
  }

  // ── Excel Export (TSV → .xlsx via blob) ─────────────────────
  const exportExcel = () => {
    // Simple HTML table exported as .xls (opens in Excel)
    const rows = rangeEntries.map((e) => {
      const kpi    = templates.find((t) => t.id === e.kpiId)
      const branch = activeBranches.find((b) => b.id === e.branchId)
      const member = members.find((m) => m.uid === e.userId || m.id === e.userId)
      return `<tr><td>${e.date}</td><td>${branch?.name||''}</td><td>${member?.displayName||''}</td><td>${kpi?.name||''}</td><td>${e.value}</td><td>${e.target}</td><td>${e.achievement}%</td></tr>`
    }).join('')
    const html = `<html><head><meta charset="utf-8"><style>table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:6px;font-family:Arial}</style></head><body><table><tr><th>التاريخ</th><th>الفرع</th><th>الصيدلاني</th><th>KPI</th><th>القيمة</th><th>الهدف</th><th>الإنجاز</th></tr>${rows}</table></body></html>`
    const blob = new Blob([html], { type:'application/vnd.ms-excel;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `pharmapulse-${reportType}-${today}.xls`; a.click()
    URL.revokeObjectURL(url)
    toast.success('تم تصدير ملف Excel')
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">التقارير</h1>
          <p className="text-sm text-slate-400 mt-0.5">{rangeEntries.length} إدخال · {dateRange.from === dateRange.to ? dateRange.from : `${dateRange.from} → ${dateRange.to}`}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCSV}   className="btn-secondary text-sm gap-1.5"><Download className="w-4 h-4" /> CSV</button>
          <button onClick={exportExcel} className="btn-secondary text-sm gap-1.5"><FileSpreadsheet className="w-4 h-4" /> Excel</button>
          <button onClick={() => toast.info('تصدير PDF قريباً')} className="btn-secondary text-sm gap-1.5 opacity-60">
            <FileText className="w-4 h-4" /> PDF
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-slate-500 mb-1">نوع التقرير</label>
          <div className="flex gap-2">
            {REPORT_TYPES.map((rt) => (
              <button key={rt.id} onClick={() => { setReportType(rt.id); setUseCustom(false) }}
                className="badge transition-all"
                style={reportType === rt.id && !useCustom
                  ? { background:`${rt.color}15`, borderColor:`${rt.color}40`, color:rt.color }
                  : { background:'rgba(30,41,59,0.6)', borderColor:'#334155', color:'#64748b' }}
              ><rt.icon className="w-3 h-3" />{rt.label}</button>
            ))}
          </div>
        </div>
        {isManager && (
          <div>
            <label className="block text-xs text-slate-500 mb-1">الفرع</label>
            <select value={selectedBranch} onChange={(e)=>setSelectedBranch(e.target.value)} className="text-sm">
              <option value="all">جميع الفروع</option>
              {activeBranches.map((b)=><option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs text-slate-500 mb-1">نطاق مخصص</label>
          <div className="flex gap-2 items-center">
            <input type="date" value={customFrom} onChange={(e)=>{setCustomFrom(e.target.value);setUseCustom(true)}} className="text-sm" max={today} />
            <span className="text-slate-600 text-xs">→</span>
            <input type="date" value={customTo}   onChange={(e)=>{setCustomTo(e.target.value);setUseCustom(true)}}   className="text-sm" max={today} />
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label:'إنجاز كلي',     value:`${overallAchievement}%`, color:'#1a9a7e' },
          { label:'إجمالي الإدخالات', value:rangeEntries.length,   color:'#6366f1' },
          { label:'KPIs',           value:kpiSummary.length,       color:'#f59e0b' },
          { label:'فروع نشطة',     value:branchSummary.filter((b)=>b.entryCount>0).length, color:'#ec4899' },
        ].map((s,i)=>(
          <div key={i} className="kpi-card text-center py-4">
            <div className="text-2xl font-bold mb-1" style={{color:s.color}}>{s.value}</div>
            <div className="text-xs text-slate-400">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Trend chart */}
      <div className="kpi-card">
        <h3 className="text-sm font-semibold text-slate-200 mb-4">اتجاه الإنجاز</h3>
        {trendData.length === 0
          ? <EmptyState icon={BarChart2} title="لا توجد بيانات" />
          : <PerformanceChart data={trendData} dataKey="value" targetKey="target" color="#1a9a7e" height={220} type={reportType==='daily'?'bar':'line'} />
        }
      </div>

      {/* KPI table */}
      <div className="kpi-card">
        <h3 className="text-sm font-semibold text-slate-200 mb-4">تفاصيل المؤشرات</h3>
        {kpiSummary.length === 0
          ? <EmptyState icon={FileText} title="لا توجد بيانات" />
          : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="table-header text-right">المؤشر</th>
                    <th className="table-header text-center">الإجمالي</th>
                    <th className="table-header text-center">الإدخالات</th>
                    <th className="table-header text-center">متوسط الإنجاز</th>
                  </tr>
                </thead>
                <tbody>
                  {kpiSummary.map((k)=>(
                    <tr key={k.id} className="hover:bg-slate-800/20 transition-colors">
                      <td className="table-cell">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:k.color}} />
                          <span className="text-sm text-slate-300">{k.name}</span>
                        </div>
                      </td>
                      <td className="table-cell text-center text-sm text-slate-300">{formatKpiValue(k.total,k.type,k.unit)}</td>
                      <td className="table-cell text-center text-sm text-slate-400">{k.count}</td>
                      <td className="table-cell text-center">
                        {k.count > 0 ? (
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-16 bg-slate-800 rounded-full h-1.5">
                              <div className="h-full rounded-full" style={{width:`${Math.min(k.avgAchievement,100)}%`,background:k.color}} />
                            </div>
                            <span className={`text-xs font-bold ${getAchievementColor(k.avgAchievement)}`}>{k.avgAchievement}%</span>
                          </div>
                        ) : <span className="text-slate-700 text-xs">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </div>

      {/* Branch breakdown */}
      {isManager && (
        <div className="kpi-card">
          <h3 className="text-sm font-semibold text-slate-200 mb-4">أداء الفروع</h3>
          <div className="space-y-3">
            {branchSummary.map((b,idx)=>(
              <div key={b.id} className="flex items-center gap-3">
                <span className="text-xs text-slate-600 w-5">{idx+1}</span>
                <Building2 className="w-4 h-4 text-slate-600 flex-shrink-0" />
                <span className="text-sm text-slate-300 flex-1">{b.name}</span>
                <span className="text-xs text-slate-500">{b.entryCount} إدخال</span>
                <div className="w-24 bg-slate-800 rounded-full h-1.5">
                  <div className="h-full rounded-full" style={{
                    width:`${Math.min(b.achievement,100)}%`,
                    background:b.achievement>=80?'#1a9a7e':b.achievement>=60?'#eab308':'#ef4444',
                  }} />
                </div>
                <span className={`text-xs font-bold w-10 text-left ${getAchievementColor(b.achievement)}`}>{b.achievement}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top pharmacists */}
      {pharmacistSummary.length > 0 && (
        <div className="kpi-card">
          <h3 className="text-sm font-semibold text-slate-200 mb-4">أداء الصيادلة (أعلى 10)</h3>
          <div className="space-y-2">
            {pharmacistSummary.map((m,idx)=>(
              <div key={m.uid||m.id} className="flex items-center gap-3">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${idx===0?'bg-amber-500/20 text-amber-400':idx===1?'bg-slate-500/20 text-slate-300':'bg-slate-800 text-slate-600'}`}>{idx+1}</span>
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{m.displayName?.[0]}</div>
                <span className="flex-1 text-sm text-slate-300 truncate">{m.displayName}</span>
                <div className="w-20 bg-slate-800 rounded-full h-1.5">
                  <div className="h-full rounded-full" style={{width:`${Math.min(m.achievement,100)}%`,background:m.achievement>=80?'#1a9a7e':m.achievement>=60?'#eab308':'#ef4444'}} />
                </div>
                <span className={`text-xs font-bold w-10 text-left ${getAchievementColor(m.achievement)}`}>{m.achievement}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
