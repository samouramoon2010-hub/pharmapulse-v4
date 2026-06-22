// ============================================================
// App-wide constants — single source of truth
// ============================================================

// ── Roles ─────────────────────────────────────────────────────
// RBAC Phase 0: future roles added as constants.
// 'manager' is kept as a backward-compatible alias for 'branch_manager'.
// Phase 1A: 'district_supervisor', 'regional_manager', 'general_manager'
// added to route guards. Data scoping (assignedPharmacyIds) is Phase 2.
export const ROLES = {
  ADMIN:               'admin',
  MANAGER:             'manager',             // alias — backward-compat for existing users
  BRANCH_MANAGER:      'branch_manager',
  DISTRICT_SUPERVISOR: 'district_supervisor', // Phase 1A: route access only; data scope Phase 2
  REGIONAL_MANAGER:    'regional_manager',    // Phase 1A: route access only; data scope Phase 2
  GENERAL_MANAGER:     'general_manager',     // Phase 1A: route access only; data scope Phase 2
  PHARMACIST:          'pharmacist',
}

export const ROLE_LABELS = {
  admin:               'مدير النظام',
  manager:             'مدير الفرع',          // alias kept
  branch_manager:      'مدير الفرع',
  district_supervisor: 'مشرف المنطقة',
  regional_manager:    'مدير الإقليم',
  general_manager:     'المدير العام',
  pharmacist:          'صيدلاني',
}

export const ROLE_COLORS = {
  admin:               { text: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20'    },
  manager:             { text: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20'  },
  branch_manager:      { text: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20'  },
  district_supervisor: { text: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
  regional_manager:    { text: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
  general_manager:     { text: 'text-sky-400',    bg: 'bg-sky-500/10',    border: 'border-sky-500/20'    },
  pharmacist:          { text: 'text-brand-400',  bg: 'bg-brand-500/10',  border: 'border-brand-500/20'  },
}

// ── Permissions matrix ─────────────────────────────────────────
// branch_manager is added alongside manager for every permission manager holds.
// Phase 0 stubs for future roles: only admin can use them until Phase 1.
export const PERMISSIONS = {
  // Route access
  VIEW_ALL_BRANCHES:  [ROLES.ADMIN],
  VIEW_OWN_BRANCH:    [ROLES.ADMIN, ROLES.MANAGER, ROLES.BRANCH_MANAGER],
  VIEW_KPI_ENTRIES:   [ROLES.ADMIN, ROLES.MANAGER, ROLES.BRANCH_MANAGER, ROLES.PHARMACIST],
  MANAGE_USERS:       [ROLES.ADMIN],
  MANAGE_BRANCHES:    [ROLES.ADMIN],
  APPROVE_KPI:        [ROLES.ADMIN, ROLES.MANAGER, ROLES.BRANCH_MANAGER],
  EXPORT_REPORTS:     [ROLES.ADMIN, ROLES.MANAGER, ROLES.BRANCH_MANAGER],
  VIEW_AUDIT_LOGS:    [ROLES.ADMIN],
  IMPORT_EXCEL:       [ROLES.ADMIN, ROLES.MANAGER, ROLES.BRANCH_MANAGER],
  MANAGE_TARGETS:     [ROLES.ADMIN, ROLES.MANAGER, ROLES.BRANCH_MANAGER],
  // Phase 0 stubs — admin-only until future phases assign additional roles
  VIEW_DISTRICT_INTELLIGENCE: [ROLES.ADMIN],
  VIEW_REGIONAL_INTELLIGENCE: [ROLES.ADMIN],
  VIEW_EXECUTIVE_BI:          [ROLES.ADMIN],
  MANAGE_DISTRICT_TARGETS:    [ROLES.ADMIN],
  MANAGE_REGIONAL_TARGETS:    [ROLES.ADMIN],
  MANAGE_EVALUATION_PROFILES: [ROLES.ADMIN],
  MANAGE_EVALUATION_REGISTRY: [ROLES.ADMIN],  // ER-0: Evaluation Registry CRUD
}

export function can(userRole, permission) {
  return PERMISSIONS[permission]?.includes(userRole) ?? false
}

// ── KPI definitions ───────────────────────────────────────────
// @deprecated Phase 4D: KPI_KEYS is superseded by getCoreEngineKeys() from engine/kpiAnalyticsEngine.
// CROSS_SELLING uses the legacy 'cross_selling' underscore form — active code uses 'crossSelling'.
// Do NOT import this in new code. Kept for historical reference only.
export const KPI_KEYS = {
  SALES:         'sales',
  OMNIHEALTH:    'omnihealth',
  WASFATY:       'wasfaty',
  WELLNESS:      'wellness',
  CROSS_SELLING: 'cross_selling',
}

// @deprecated Phase 4D: KPI_META is superseded by getKpiLabel/getKpiColor/getKpiMetaForDisplay
// from engine/kpiRegistry/kpiUiAdapter. Do NOT import this in new code.
export const KPI_META = {
  sales:         { label: 'المبيعات',       unit: 'ر.س',  color: '#1a9a7e', icon: 'DollarSign',    type: 'currency'    },
  omnihealth:    { label: 'أومني هيلث',     unit: 'وحدة', color: '#ef4444', icon: 'Heart',         type: 'number'      },
  wasfaty:       { label: 'وصفتي',          unit: 'وصفة', color: '#6366f1', icon: 'Package',       type: 'number'      },
  wellness:      { label: 'ويلنس',          unit: 'وحدة', color: '#f59e0b', icon: 'Star',          type: 'number'      },
  cross_selling: { label: 'البيع المتقاطع', unit: 'وحدة', color: '#8b5cf6', icon: 'ArrowLeftRight', type: 'number'      },
}

// ── Status ────────────────────────────────────────────────────
export const ENTRY_STATUS = {
  PENDING:    'pending',
  APPROVED:   'approved',
  REJECTED:   'rejected',
  NEEDS_EDIT: 'needs_edit',
}

export const STATUS_META = {
  pending:    { label: 'في الانتظار',  color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20'  },
  approved:   { label: 'معتمد',        color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/20'  },
  rejected:   { label: 'مرفوض',        color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20'    },
  needs_edit: { label: 'يحتاج تعديل',  color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/20'   },
}

// ── Saudi regions ─────────────────────────────────────────────
export const SA_REGIONS = [
  'الرياض','مكة المكرمة','المدينة المنورة','القصيم','المنطقة الشرقية',
  'عسير','تبوك','حائل','الحدود الشمالية','جازان','نجران','الباحة','الجوف',
]

// ── Achievement thresholds ────────────────────────────────────
export const ACHIEVEMENT = {
  EXCELLENT: 100,
  GOOD:       80,
  AVERAGE:    60,
}

export function getAchievementLevel(pct) {
  if (pct >= ACHIEVEMENT.EXCELLENT) return 'excellent'
  if (pct >= ACHIEVEMENT.GOOD)      return 'good'
  if (pct >= ACHIEVEMENT.AVERAGE)   return 'average'
  return 'poor'
}

export const ACHIEVEMENT_META = {
  excellent: { label: 'ممتاز',  color: '#22c55e', textClass: 'text-green-400'  },
  good:      { label: 'جيد',    color: '#1a9a7e', textClass: 'text-brand-400'  },
  average:   { label: 'متوسط',  color: '#eab308', textClass: 'text-yellow-400' },
  poor:      { label: 'ضعيف',   color: '#ef4444', textClass: 'text-red-400'    },
}
