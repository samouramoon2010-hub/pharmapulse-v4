// ============================================================
// Settings Store — Real Theme System + User Preferences
// ============================================================
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const THEMES = {
  DARK:      'dark',
  LIGHT:     'light',
  CORPORATE: 'corporate',
  MIDNIGHT:  'midnight',
  NAHDI:     'nahdi',
  OCEAN:     'ocean',
}

export const THEME_META = {
  dark:      { label: 'Dark',      labelAr: 'داكن',           preview: '#040d18' },
  light:     { label: 'Light',     labelAr: 'فاتح',           preview: '#f8fafc' },
  corporate: { label: 'Corporate', labelAr: 'كوربوريت',       preview: '#0a0f1e' },
  midnight:  { label: 'Midnight',  labelAr: 'منتصف الليل',   preview: '#050210' },
  nahdi:     { label: 'Nahdi',     labelAr: 'نهدي',           preview: '#003a2e' },
  ocean:     { label: 'Ocean',     labelAr: 'أوشن',           preview: '#01172a' },
}

export const SIDEBAR_MODE = {
  EXPANDED:  'expanded',
  COLLAPSED: 'collapsed',
}

// All 9 possible dashboard cards
export const DASHBOARD_CARDS = {
  overall_achievement: { label: 'Overall Achievement',  labelAr: 'الإنجاز الكلي' },
  today_kpi:           { label: 'Today KPI',            labelAr: 'KPI اليوم' },
  wasfaty:             { label: 'Wasfaty',              labelAr: 'وصفتي' },
  omni:                { label: 'OmniHealth',           labelAr: 'أومني هيلث' },
  wellness:            { label: 'Wellness',             labelAr: 'ويلنس' },
  cross_selling:       { label: 'Cross Selling',        labelAr: 'البيع المتقاطع' },
  branch_rank:         { label: 'Branch Rank',          labelAr: 'ترتيب الفرع' },
  month_progress:      { label: 'Month Progress',       labelAr: 'تقدم الشهر' },
  forecast:            { label: 'Forecast',             labelAr: 'التوقع' },
}

const DEFAULT_CARDS = ['overall_achievement', 'today_kpi', 'wasfaty', 'omni', 'wellness', 'forecast']

export const useSettingsStore = create(
  persist(
    (set, get) => ({
      theme:          THEMES.DARK,
      sidebarMode:    SIDEBAR_MODE.EXPANDED,
      compactMode:    false,
      reducedMotion:  false,
      fontSize:       'normal',
      dashboardCards: DEFAULT_CARDS,

      setTheme: (theme) => {
        set({ theme })
        applyTheme(theme)
      },

      toggleSidebar: () => {
        const next = get().sidebarMode === SIDEBAR_MODE.EXPANDED
          ? SIDEBAR_MODE.COLLAPSED : SIDEBAR_MODE.EXPANDED
        set({ sidebarMode: next })
      },

      setDashboardCards: (cards) => {
        if (cards.length < 2) return  // minimum 2 cards
        set({ dashboardCards: cards })
      },

      toggleCompact:       () => set((s) => ({ compactMode: !s.compactMode })),
      toggleReducedMotion: () => set((s) => ({ reducedMotion: !s.reducedMotion })),
      setFontSize:         (sz) => set({ fontSize: sz }),
    }),
    {
      name: 'pharma-settings-v4',
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.theme)
      },
    }
  )
)

// ── Apply theme via CSS variables on <html> ───────────────────
export function applyTheme(theme) {
  const root = document.documentElement
  root.setAttribute('data-theme', theme || 'dark')

  const T = {
    dark: {
      '--bg-canvas':      '#09090b',
      '--bg-surface':     '#141417',
      '--bg-elevated':    '#1c1c20',
      '--bg-overlay':     '#222226',
      '--bg-hover':       'rgba(255,255,255,0.04)',
      '--bg-active':      'rgba(0,210,173,0.08)',
      '--bg-base':        '#09090b',
      '--bg-card':        '#141417',
      '--border-subtle':  'rgba(255,255,255,0.06)',
      '--border-default': 'rgba(255,255,255,0.09)',
      '--border-strong':  'rgba(255,255,255,0.14)',
      '--border-brand':   'rgba(0,210,173,0.2)',
      '--border':         'rgba(255,255,255,0.06)',
      '--border-hover':   'rgba(255,255,255,0.09)',
      '--text-primary':   '#fafafa',
      '--text-secondary': '#a1a1aa',
      '--text-muted':     '#52525b',
      '--text-brand':     '#00d2ad',
      '--brand-300':      '#4dffc9',
      '--brand-400':      '#26e8b4',
      '--brand-500':      '#00d2ad',
      '--brand-600':      '#00a989',
      '--sidebar-bg':     'rgba(9,9,11,0.97)',
      '--topbar-bg':      'rgba(9,9,11,0.88)',
      '--input-bg':       'rgba(20,20,23,0.8)',
      '--modal-bg':       'rgba(14,14,16,0.99)',
    },
    light: {
      '--bg-canvas':      '#fafafa',
      '--bg-surface':     '#ffffff',
      '--bg-elevated':    '#f4f4f5',
      '--bg-overlay':     '#e4e4e7',
      '--bg-hover':       'rgba(0,0,0,0.04)',
      '--bg-active':      'rgba(0,210,173,0.08)',
      '--bg-base':        '#fafafa',
      '--bg-card':        '#ffffff',
      '--border-subtle':  'rgba(0,0,0,0.08)',
      '--border-default': 'rgba(0,0,0,0.12)',
      '--border-strong':  'rgba(0,0,0,0.18)',
      '--border-brand':   'rgba(0,210,173,0.3)',
      '--border':         'rgba(0,0,0,0.08)',
      '--border-hover':   'rgba(0,0,0,0.12)',
      '--text-primary':   '#09090b',
      '--text-secondary': '#3f3f46',
      '--text-muted':     '#71717a',
      '--text-brand':     '#00a989',
      '--brand-300':      '#00a989',
      '--brand-400':      '#00a989',
      '--brand-500':      '#00d2ad',
      '--brand-600':      '#00a989',
      '--sidebar-bg':     'rgba(255,255,255,0.97)',
      '--topbar-bg':      'rgba(255,255,255,0.92)',
      '--input-bg':       'rgba(244,244,245,0.8)',
      '--modal-bg':       'rgba(255,255,255,0.99)',
    },
    corporate: {
      '--bg-canvas':      '#04080f',
      '--bg-surface':     '#080f1c',
      '--bg-elevated':    '#0d1729',
      '--bg-overlay':     '#121f34',
      '--bg-hover':       'rgba(59,130,246,0.06)',
      '--bg-active':      'rgba(59,130,246,0.12)',
      '--bg-base':        '#04080f',
      '--bg-card':        '#080f1c',
      '--border-subtle':  'rgba(255,255,255,0.06)',
      '--border-default': 'rgba(59,130,246,0.15)',
      '--border-strong':  'rgba(59,130,246,0.25)',
      '--border-brand':   'rgba(59,130,246,0.25)',
      '--border':         'rgba(255,255,255,0.06)',
      '--border-hover':   'rgba(59,130,246,0.2)',
      '--text-primary':   '#e8f0fe',
      '--text-secondary': '#7a9cc4',
      '--text-muted':     '#2d4a6a',
      '--text-brand':     '#60a5fa',
      '--brand-300':      '#93c5fd',
      '--brand-400':      '#60a5fa',
      '--brand-500':      '#3b82f6',
      '--brand-600':      '#2563eb',
      '--sidebar-bg':     'rgba(4,8,15,0.97)',
      '--topbar-bg':      'rgba(4,8,15,0.9)',
      '--input-bg':       'rgba(8,15,28,0.8)',
      '--modal-bg':       'rgba(4,8,15,0.99)',
    },
    midnight: {
      '--bg-canvas':      '#060310',
      '--bg-surface':     '#0c0820',
      '--bg-elevated':    '#130f2d',
      '--bg-overlay':     '#1a1538',
      '--bg-hover':       'rgba(139,92,246,0.07)',
      '--bg-active':      'rgba(139,92,246,0.14)',
      '--bg-base':        '#060310',
      '--bg-card':        '#0c0820',
      '--border-subtle':  'rgba(255,255,255,0.05)',
      '--border-default': 'rgba(139,92,246,0.15)',
      '--border-strong':  'rgba(139,92,246,0.25)',
      '--border-brand':   'rgba(139,92,246,0.25)',
      '--border':         'rgba(255,255,255,0.05)',
      '--border-hover':   'rgba(139,92,246,0.2)',
      '--text-primary':   '#ede9fe',
      '--text-secondary': '#9782c4',
      '--text-muted':     '#4a3a6a',
      '--text-brand':     '#a78bfa',
      '--brand-300':      '#c4b5fd',
      '--brand-400':      '#a78bfa',
      '--brand-500':      '#8b5cf6',
      '--brand-600':      '#7c3aed',
      '--sidebar-bg':     'rgba(6,3,16,0.98)',
      '--topbar-bg':      'rgba(6,3,16,0.92)',
      '--input-bg':       'rgba(12,8,32,0.8)',
      '--modal-bg':       'rgba(6,3,16,0.99)',
    },
    nahdi: {
      '--bg-canvas':      '#011a12',
      '--bg-surface':     '#03261c',
      '--bg-elevated':    '#063322',
      '--bg-overlay':     '#094028',
      '--bg-hover':       'rgba(0,185,100,0.07)',
      '--bg-active':      'rgba(0,185,100,0.14)',
      '--bg-base':        '#011a12',
      '--bg-card':        '#03261c',
      '--border-subtle':  'rgba(255,255,255,0.06)',
      '--border-default': 'rgba(0,185,100,0.15)',
      '--border-strong':  'rgba(0,185,100,0.25)',
      '--border-brand':   'rgba(0,185,100,0.25)',
      '--border':         'rgba(255,255,255,0.06)',
      '--border-hover':   'rgba(0,185,100,0.2)',
      '--text-primary':   '#e8fdf4',
      '--text-secondary': '#5ca882',
      '--text-muted':     '#1e4a35',
      '--text-brand':     '#00c878',
      '--brand-300':      '#6effc0',
      '--brand-400':      '#00e87a',
      '--brand-500':      '#00b964',
      '--brand-600':      '#009a52',
      '--sidebar-bg':     'rgba(1,18,10,0.98)',
      '--topbar-bg':      'rgba(1,18,10,0.92)',
      '--input-bg':       'rgba(3,28,18,0.8)',
      '--modal-bg':       'rgba(1,18,10,0.99)',
    },
    ocean: {
      '--bg-canvas':      '#01162a',
      '--bg-surface':     '#031e3d',
      '--bg-elevated':    '#06284f',
      '--bg-overlay':     '#083260',
      '--bg-hover':       'rgba(6,182,212,0.07)',
      '--bg-active':      'rgba(6,182,212,0.14)',
      '--bg-base':        '#01162a',
      '--bg-card':        '#031e3d',
      '--border-subtle':  'rgba(255,255,255,0.06)',
      '--border-default': 'rgba(6,182,212,0.15)',
      '--border-strong':  'rgba(6,182,212,0.25)',
      '--border-brand':   'rgba(6,182,212,0.25)',
      '--border':         'rgba(255,255,255,0.06)',
      '--border-hover':   'rgba(6,182,212,0.2)',
      '--text-primary':   '#e0f8ff',
      '--text-secondary': '#3ea8c2',
      '--text-muted':     '#0e3a4e',
      '--text-brand':     '#22d3ee',
      '--brand-300':      '#67e8f9',
      '--brand-400':      '#22d3ee',
      '--brand-500':      '#06b6d4',
      '--brand-600':      '#0891b2',
      '--sidebar-bg':     'rgba(1,16,28,0.98)',
      '--topbar-bg':      'rgba(1,16,28,0.92)',
      '--input-bg':       'rgba(3,24,48,0.8)',
      '--modal-bg':       'rgba(1,16,28,0.99)',
    },
  }

  const vars = T[theme] || T.dark
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v))
  root.style.colorScheme = theme === 'light' ? 'light' : 'dark'
}
