// ============================================================
// Utility Functions
// ============================================================

import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns'
import { ar } from 'date-fns/locale'

// Format number based on KPI type
export function formatKpiValue(value, type, unit = '') {
  if (value === null || value === undefined) return '—'
  switch (type) {
    case 'currency':
      return `${Number(value).toLocaleString('ar-SA')} ${unit || 'ر.س'}`
    case 'percentage':
      return `${Number(value).toFixed(1)}%`
    case 'boolean':
      return value ? '✓ نعم' : '✗ لا'
    case 'number':
      return `${Number(value).toLocaleString('ar-SA')} ${unit || ''}`
    default:
      return `${value} ${unit || ''}`
  }
}

// Get achievement color class
export function getAchievementColor(pct) {
  if (pct >= 100) return 'text-green-400'
  if (pct >= 80) return 'text-brand-400'
  if (pct >= 60) return 'text-yellow-400'
  return 'text-red-400'
}

// Get achievement bg color for cards
export function getAchievementBg(pct) {
  if (pct >= 100) return 'bg-green-500/10 border-green-500/20'
  if (pct >= 80) return 'bg-brand-500/10 border-brand-500/20'
  if (pct >= 60) return 'bg-yellow-500/10 border-yellow-500/20'
  return 'bg-red-500/10 border-red-500/20'
}

// Get today's date string YYYY-MM-DD
export function todayStr() {
  return new Date().toISOString().split('T')[0]
}

// Arabic date format
export function formatDateAr(dateStr) {
  try {
    return format(new Date(dateStr), 'dd MMMM yyyy', { locale: ar })
  } catch {
    return dateStr
  }
}

// Role label in Arabic
export function getRoleLabel(role) {
  const map = {
    admin: 'مدير النظام',
    area_manager: 'مدير المنطقة',
    store_manager: 'مدير الفرع',
    pharmacist: 'صيدلاني',
  }
  return map[role] || role
}

// Role badge color
export function getRoleBadgeStyle(role) {
  const map = {
    admin: 'bg-red-500/20 text-red-300 border-red-500/30',
    area_manager: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    store_manager: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    pharmacist: 'bg-brand-500/20 text-brand-300 border-brand-500/30',
  }
  return map[role] || 'bg-slate-500/20 text-slate-300'
}

// Get current month range
export function currentMonthRange() {
  const now = new Date()
  return {
    from: format(startOfMonth(now), 'yyyy-MM-dd'),
    to: format(endOfMonth(now), 'yyyy-MM-dd'),
  }
}

// Get current week range
export function currentWeekRange() {
  const now = new Date()
  return {
    from: format(startOfWeek(now, { weekStartsOn: 0 }), 'yyyy-MM-dd'),
    to: format(endOfWeek(now, { weekStartsOn: 0 }), 'yyyy-MM-dd'),
  }
}

// Calculate trend (positive/negative/neutral)
export function calcTrend(current, previous) {
  if (!previous || previous === 0) return 0
  return Math.round(((current - previous) / previous) * 100)
}

// cn utility (clsx + tailwind-merge)
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

// KPI input validation
export function validateKpiValue(value, type) {
  if (value === '' || value === null || value === undefined) return 'القيمة مطلوبة'
  const num = Number(value)
  if (isNaN(num)) return 'يجب أن تكون القيمة رقماً'
  if (num < 0) return 'القيمة لا يمكن أن تكون سالبة'
  if (type === 'percentage' && num > 100) return 'النسبة لا يمكن أن تتجاوز 100%'
  return null
}

// ── Enhanced KPI validation (Phase 2) ───────────────────────
export function validateKpiValueStrict(value, kpi, existingEntryForDay = null) {
  const v = value === '' || value === null || value === undefined ? null : Number(value)

  if (kpi.type === 'formula') return 'المؤشرات المحسوبة لا تُدخَل يدوياً'
  if (kpi.type === 'boolean') {
    if (v === null) return 'يجب اختيار نعم أو لا'
    return null
  }

  if (v === null || isNaN(v)) return 'القيمة مطلوبة'
  if (v < 0) return 'القيمة لا يمكن أن تكون سالبة'

  if (kpi.type === 'percentage') {
    if (!kpi.allowOverAchievement && v > 100) return 'النسبة لا يمكن أن تتجاوز 100%'
  }

  if (kpi.type === 'currency' && v > 1000000) return 'القيمة أعلى من الحد المسموح (1,000,000)'

  return null
}

// Check if today's date is in the future
export function isFutureDate(dateStr) {
  return dateStr > new Date().toISOString().split('T')[0]
}
