// ============================================================
// Alerts Store — auto-generate alerts from KPI data
// ============================================================
import { create } from 'zustand'

export const ALERT_TYPES = {
  MISSING_KPI:      'missing_kpi',
  PENDING_APPROVAL: 'pending_approval',
  LOW_KPI:          'low_kpi',
  LOW_BRANCH:       'low_branch',
  LOW_PERFORMER:    'low_performer',
}

export const ALERT_PRIORITY = {
  HIGH:   'high',
  MEDIUM: 'medium',
  LOW:    'low',
}

export const useAlertStore = create((set, get) => ({
  alerts: [],

  // ── Generate alerts from live data ─────────────────────────
  generateAlerts: ({ entries, templates, users, branches, today, approvalOverlay }) => {
    const alerts = []
    const pharmacists = users.filter((u) => u.role === 'pharmacist')
    const activeKpis  = templates.filter((t) => t.active && t.type !== 'formula')

    // ① Missing KPI entries today
    pharmacists.forEach((user) => {
      const todayEntries = entries.filter((e) => e.userId === user.uid && e.date === today)
      const filledKpiIds = new Set(todayEntries.map((e) => e.kpiId))
      const missingKpis  = activeKpis.filter((k) => !filledKpiIds.has(k.id) && (k.visibleTo?.includes('pharmacist') ?? true))

      if (missingKpis.length > 0) {
        alerts.push({
          id:       `missing-${user.uid}-${today}`,
          type:     ALERT_TYPES.MISSING_KPI,
          priority: ALERT_PRIORITY.HIGH,
          title:    `إدخالات ناقصة: ${user.displayName}`,
          message:  `${missingKpis.length} KPI لم تُدخَل اليوم`,
          userId:   user.uid,
          branchId: user.branchId,
          relatedId: user.uid,
          read: false,
          createdAt: new Date().toISOString(),
        })
      }
    })

    // ② Pending approvals
    const pendingCount = Object.values(approvalOverlay).filter((o) => !o.status || o.status === 'pending').length
    if (pendingCount > 0) {
      alerts.push({
        id:       `pending-approvals-${today}`,
        type:     ALERT_TYPES.PENDING_APPROVAL,
        priority: ALERT_PRIORITY.MEDIUM,
        title:    'إدخالات تنتظر الاعتماد',
        message:  `${pendingCount} إدخال في انتظار مراجعتك`,
        relatedId: null,
        read: false,
        createdAt: new Date().toISOString(),
      })
    }

    // ③ KPI achievement < 70% today
    const todayAllEntries = entries.filter((e) => e.date === today)
    const lowEntries = todayAllEntries.filter((e) => e.achievement < 70)
    if (lowEntries.length > 0) {
      const grouped = {}
      lowEntries.forEach((e) => {
        if (!grouped[e.userId]) grouped[e.userId] = []
        grouped[e.userId].push(e)
      })
      Object.entries(grouped).forEach(([uid, ents]) => {
        const user = users.find((u) => u.uid === uid)
        alerts.push({
          id:       `low-kpi-${uid}-${today}`,
          type:     ALERT_TYPES.LOW_KPI,
          priority: ALERT_PRIORITY.MEDIUM,
          title:    `أداء منخفض: ${user?.displayName || uid}`,
          message:  `${ents.length} مؤشر أقل من 70% اليوم`,
          userId:   uid,
          branchId: user?.branchId,
          relatedId: uid,
          read: false,
          createdAt: new Date().toISOString(),
        })
      })
    }

    // ④ Branch below 70% average
    branches.forEach((branch) => {
      const branchTodayEntries = todayAllEntries.filter((e) => e.branchId === branch.id)
      if (!branchTodayEntries.length) return
      const avg = Math.round(branchTodayEntries.reduce((s, e) => s + e.achievement, 0) / branchTodayEntries.length)
      if (avg < 70) {
        alerts.push({
          id:       `low-branch-${branch.id}-${today}`,
          type:     ALERT_TYPES.LOW_BRANCH,
          priority: ALERT_PRIORITY.HIGH,
          title:    `فرع دون الهدف: ${branch.name}`,
          message:  `متوسط إنجاز الفرع اليوم ${avg}% (دون 70%)`,
          branchId: branch.id,
          relatedId: branch.id,
          read: false,
          createdAt: new Date().toISOString(),
        })
      }
    })

    // ⑤ Consistent low performer: pharmacist <70% for 3+ days
    pharmacists.forEach((user) => {
      const last3days = []
      for (let i = 1; i <= 3; i++) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        const ds = d.toISOString().split('T')[0]
        const dayEntries = entries.filter((e) => e.userId === user.uid && e.date === ds)
        if (dayEntries.length === 0) continue
        const avg = Math.round(dayEntries.reduce((s, e) => s + e.achievement, 0) / dayEntries.length)
        last3days.push(avg)
      }
      if (last3days.length === 3 && last3days.every((v) => v < 70)) {
        alerts.push({
          id:       `low-performer-${user.uid}`,
          type:     ALERT_TYPES.LOW_PERFORMER,
          priority: ALERT_PRIORITY.HIGH,
          title:    `أداء ضعيف متواصل: ${user.displayName}`,
          message:  `أداء أقل من 70% لمدة 3 أيام متتالية`,
          userId:   user.uid,
          branchId: user.branchId,
          relatedId: user.uid,
          read: false,
          createdAt: new Date().toISOString(),
        })
      }
    })

    set({ alerts })
    return alerts
  },

  markAlertRead: (id) => {
    set((s) => ({
      alerts: s.alerts.map((a) => a.id === id ? { ...a, read: true } : a),
    }))
  },

  markAllRead: () => {
    set((s) => ({ alerts: s.alerts.map((a) => ({ ...a, read: true })) }))
  },

  getUnreadCount: () => get().alerts.filter((a) => !a.read).length,
}))
