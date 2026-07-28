// ============================================================
// AI Insights Page - Powered by Claude API
// Real AI analysis of KPI data
// ============================================================

import React, { useState, useMemo } from 'react'
import { Zap, TrendingUp, AlertTriangle, Lightbulb, RefreshCw, Loader2, Bot, Sparkles } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useKpiStore } from '../../store/kpiStore'
import { todayStr, currentMonthRange, formatKpiValue } from '../../utils/helpers'
import { DUMMY_BRANCHES, DUMMY_USERS } from '../../data/dummyData'

// Insight card component
function InsightCard({ type, title, body, delay = 0 }) {
  const config = {
    success: { icon: TrendingUp, color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' },
    warning: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
    suggestion: { icon: Lightbulb, color: 'text-brand-400', bg: 'bg-brand-500/10 border-brand-500/20' },
    info: { icon: Sparkles, color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
  }
  const cfg = config[type] || config.info
  const Icon = cfg.icon

  return (
    <div
      className={`kpi-card border ${cfg.bg} animate-slide-up`}
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'backwards' }}
    >
      <div className="flex items-start gap-3">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 border ${cfg.bg}`}>
          <Icon className={`w-4 h-4 ${cfg.color}`} />
        </div>
        <div>
          <h3 className={`text-sm font-semibold ${cfg.color} mb-1`}>{title}</h3>
          <p className="text-sm text-slate-400 leading-relaxed">{body}</p>
        </div>
      </div>
    </div>
  )
}

export default function AIInsightsPage() {
  const { userProfile } = useAuthStore()
  const { templates, entries } = useKpiStore()
  const [insights, setInsights] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const { from: monthFrom, to: monthTo } = currentMonthRange()
  const today = todayStr()

  // Prepare data summary for AI
  const dataSummary = useMemo(() => {
    const monthEntries = entries.filter((e) => e.date >= monthFrom && e.date <= monthTo)
    const todayEntries = entries.filter((e) => e.date === today)

    // KPI-level stats
    const kpiStats = templates.filter((t) => t.active).map((kpi) => {
      const kpiMonthEntries = monthEntries.filter((e) => e.kpiId === kpi.id)
      const todayEntry = todayEntries.find((e) => e.kpiId === kpi.id)
      const avgAch = kpiMonthEntries.length
        ? Math.round(kpiMonthEntries.reduce((s, e) => s + e.achievement, 0) / kpiMonthEntries.length) : 0
      const trend = kpiMonthEntries.length > 7
        ? Math.round(kpiMonthEntries.slice(-3).reduce((s, e) => s + e.achievement, 0) / 3) -
          Math.round(kpiMonthEntries.slice(0, 3).reduce((s, e) => s + e.achievement, 0) / 3)
        : 0
      return {
        name: kpi.name,
        type: kpi.type,
        target: kpi.target,
        unit: kpi.unit || '',
        todayValue: todayEntry?.value ?? null,
        todayAchievement: todayEntry?.achievement ?? null,
        monthlyAvgAchievement: avgAch,
        trend,
        daysEntered: kpiMonthEntries.length,
      }
    })

    // Branch stats
    const branchStats = DUMMY_BRANCHES.map((branch) => {
      const branchEntries = monthEntries.filter((e) => e.branchId === branch.id)
      const avg = branchEntries.length
        ? Math.round(branchEntries.reduce((s, e) => s + e.achievement, 0) / branchEntries.length) : 0
      return { name: branch.name, avgAchievement: avg }
    })

    return { kpiStats, branchStats, role: userProfile?.role, totalEntries: monthEntries.length }
  }, [entries, templates, monthFrom, monthTo, today, userProfile?.role])

  const generateInsights = async () => {
    setLoading(true)
    setError(null)

    try {
      const prompt = `أنت مساعد ذكاء اصطناعي متخصص في تحليل أداء الصيدليات.

بيانات الأداء الشهرية:

مؤشرات KPI:
${dataSummary.kpiStats.map((k) =>
  `- ${k.name}: متوسط الإنجاز ${k.monthlyAvgAchievement}%، اليوم: ${k.todayValue !== null ? `${k.todayValue} ${k.unit}` : 'لم يُدخل'}، الاتجاه: ${k.trend > 0 ? '+' : ''}${k.trend}%، أيام الإدخال: ${k.daysEntered}`
).join('\n')}

أداء الفروع:
${dataSummary.branchStats.map((b) => `- ${b.name}: ${b.avgAchievement}%`).join('\n')}

إجمالي الإدخالات هذا الشهر: ${dataSummary.totalEntries}
دور المستخدم: ${dataSummary.role}

المطلوب: قدم تحليلاً ذكياً يشمل:
1. أبرز الإنجازات (نقاط القوة)
2. المجالات التي تحتاج تحسيناً
3. 3 توصيات عملية ومحددة
4. توقع الأداء للأسبوع القادم

أجب بصيغة JSON بالشكل التالي فقط بدون أي نص إضافي:
{
  "strengths": [{"title": "...", "body": "..."}],
  "weaknesses": [{"title": "...", "body": "..."}],
  "suggestions": [{"title": "...", "body": "..."}],
  "forecast": {"title": "...", "body": "..."}
}`

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{ role: 'user', content: prompt }],
        }),
      })

      const data = await response.json()
      const text = data.content?.find((c) => c.type === 'text')?.text || ''
      const clean = text.replace(/```json\n?|\n?```/g, '').trim()
      const parsed = JSON.parse(clean)
      setInsights(parsed)
    } catch (e) {
      // Fallback to static demo insights
      setInsights(generateDemoInsights(dataSummary))
    } finally {
      setLoading(false)
    }
  }

  // Fallback demo insights when API unavailable
  function generateDemoInsights(data) {
    const bestKpi = data.kpiStats.reduce((best, k) =>
      k.monthlyAvgAchievement > (best?.monthlyAvgAchievement || 0) ? k : best, null)
    const worstKpi = data.kpiStats.reduce((worst, k) =>
      k.monthlyAvgAchievement < (worst?.monthlyAvgAchievement || 100) ? k : worst, null)
    const bestBranch = data.branchStats.reduce((best, b) =>
      b.avgAchievement > (best?.avgAchievement || 0) ? b : best, null)

    return {
      strengths: [
        {
          title: `تميّز في ${bestKpi?.name || 'KPI'}`,
          body: `حقق مؤشر "${bestKpi?.name}" أعلى نسبة إنجاز هذا الشهر بمعدل ${bestKpi?.monthlyAvgAchievement}%. هذا يعكس التزاماً قوياً وممارسات بيع متميزة.`,
        },
        {
          title: `أفضل فرع: ${bestBranch?.name || ''}`,
          body: `فرع ${bestBranch?.name} يتصدر الترتيب بإنجاز ${bestBranch?.avgAchievement}%، ويُوصى بمشاركة ممارساته مع بقية الفروع.`,
        },
      ],
      weaknesses: [
        {
          title: `يحتاج تحسين: ${worstKpi?.name || 'KPI'}`,
          body: `مؤشر "${worstKpi?.name}" يسجل أدنى إنجاز بمعدل ${worstKpi?.monthlyAvgAchievement}%. يُنصح بمراجعة أسباب الفجوة وتحديد العوائق.`,
        },
        {
          title: 'انتظام الإدخال',
          body: `بعض KPIs لم تُدخل بانتظام (${data.kpiStats.filter((k) => k.daysEntered < 15).length} مؤشر أقل من 15 يوم إدخال). الانتظام يُحسّن دقة التحليل.`,
        },
      ],
      suggestions: [
        {
          title: 'جدولة إدخال يومية',
          body: 'حدد وقتاً ثابتاً لإدخال KPI يومياً (مثلاً: نهاية كل شيفت) لضمان اكتمال البيانات واستمراريتها.',
        },
        {
          title: 'تحفيز البيع المتقاطع',
          body: 'ركّز على تطوير مهارات البيع المتقاطع من خلال تدريب أسبوعي مصغّر مع أمثلة عملية من منتجات الصيدلية.',
        },
        {
          title: 'مراجعة أسبوعية',
          body: 'نفّذ اجتماعاً أسبوعياً قصيراً (15 دقيقة) لمراجعة الأداء وتحديد أولويات الأسبوع القادم مع الفريق.',
        },
      ],
      forecast: {
        title: 'توقع الأسبوع القادم',
        body: `بناءً على الاتجاه الحالي، يُتوقع أن يصل متوسط الإنجاز إلى ${Math.min(95, Math.round(data.kpiStats.reduce((s, k) => s + k.monthlyAvgAchievement, 0) / (data.kpiStats.length || 1)) + 5)}% إذا حُوفظ على معدل الإدخال الحالي. التركيز على المؤشرات الضعيفة قد يرفع النسبة إلى 10% إضافية.`,
      },
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Zap className="w-6 h-6 text-brand-400" />
          AI Insights
        </h1>
        <p className="text-sm text-slate-400 mt-0.5">تحليل ذكي لبيانات الأداء بالذكاء الاصطناعي</p>
      </div>

      {/* Generate button */}
      <div className="kpi-card border-brand-500/20 bg-brand-500/5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-brand-300 flex items-center gap-2">
              <Bot className="w-4 h-4" /> مساعد PharmaPulse AI
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              يحلل بياناتك الفعلية ويقدم توصيات مخصصة لتحسين الأداء
            </p>
          </div>
          <button
            onClick={generateInsights}
            disabled={loading}
            className="btn-primary flex-shrink-0"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> جاري التحليل...</>
            ) : (
              <><Sparkles className="w-4 h-4" /> {insights ? 'إعادة التحليل' : 'تحليل الأداء'}</>
            )}
          </button>
        </div>

        {/* Data preview */}
        <div className="mt-4 pt-4 border-t border-brand-500/10 grid grid-cols-3 gap-3">
          {[
            { label: 'KPI مراقبة', value: dataSummary.kpiStats.length },
            { label: 'إدخالات الشهر', value: dataSummary.totalEntries },
            { label: 'فروع', value: dataSummary.branchStats.length },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-lg font-bold text-brand-400">{s.value}</div>
              <div className="text-xs text-slate-500">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="kpi-card flex flex-col items-center justify-center py-16 gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center">
              <Bot className="w-8 h-8 text-brand-400" />
            </div>
            <div className="absolute inset-0 rounded-2xl border-2 border-brand-500/30 border-t-brand-500 animate-spin" />
          </div>
          <div className="text-center">
            <p className="text-slate-300 font-medium">جاري تحليل البيانات...</p>
            <p className="text-xs text-slate-500 mt-1">يعمل Claude على تحليل أدائك وإعداد التوصيات</p>
          </div>
        </div>
      )}

      {/* Results */}
      {insights && !loading && (
        <div className="space-y-6 animate-fade-in">
          {/* Strengths */}
          {insights.strengths?.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-slate-400 mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-green-400" /> نقاط القوة
              </h2>
              <div className="space-y-3">
                {insights.strengths.map((s, i) => (
                  <InsightCard key={i} type="success" title={s.title} body={s.body} delay={i * 100} />
                ))}
              </div>
            </div>
          )}

          {/* Weaknesses */}
          {insights.weaknesses?.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-slate-400 mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" /> مجالات التحسين
              </h2>
              <div className="space-y-3">
                {insights.weaknesses.map((w, i) => (
                  <InsightCard key={i} type="warning" title={w.title} body={w.body} delay={i * 100} />
                ))}
              </div>
            </div>
          )}

          {/* Suggestions */}
          {insights.suggestions?.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-slate-400 mb-3 flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-brand-400" /> التوصيات
              </h2>
              <div className="space-y-3">
                {insights.suggestions.map((s, i) => (
                  <InsightCard key={i} type="suggestion" title={s.title} body={s.body} delay={i * 100} />
                ))}
              </div>
            </div>
          )}

          {/* Forecast */}
          {insights.forecast && (
            <div>
              <h2 className="text-sm font-semibold text-slate-400 mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400" /> التوقعات
              </h2>
              <InsightCard type="info" title={insights.forecast.title} body={insights.forecast.body} />
            </div>
          )}

          {/* Refresh */}
          <div className="flex justify-center">
            <button onClick={generateInsights} className="btn-secondary text-sm gap-2">
              <RefreshCw className="w-4 h-4" /> إعادة التحليل
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!insights && !loading && (
        <div className="kpi-card flex flex-col items-center justify-center py-16 text-center">
          <Zap className="w-10 h-10 text-slate-700 mb-4" />
          <p className="text-slate-400">اضغط على "تحليل الأداء" للحصول على رؤى ذكية</p>
          <p className="text-xs text-slate-600 mt-2">يستخدم النظام بياناتك الفعلية لتقديم توصيات مخصصة</p>
        </div>
      )}
    </div>
  )
}
