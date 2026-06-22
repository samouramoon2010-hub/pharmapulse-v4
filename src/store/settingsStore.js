// ============================================================
// Settings Store — Real Theme System + User Preferences
// ============================================================
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { applyLanguage, normaliseLang } from '../i18n/index'

export const THEMES = {
  DARK:        'dark',
  LIGHT:       'light',
  CORPORATE:   'corporate',
  MIDNIGHT:    'midnight',
  NAHDI:       'nahdi',
  OCEAN:       'ocean',
  PHARMA:      'pharma',
  PHARMA_LIGHT:'pharma-light',
  FUTURISTIC:  'pharmapulse-futuristic',
}

export const THEME_META = {
  pharma:               { label: 'Pharma',       labelAr: 'فارما',             preview: '#1A2235' },
  'pharma-light':       { label: 'Pharma Light', labelAr: 'فارما فاتح',       preview: '#F7F8FA' },
  'pharmapulse-futuristic': { label: 'Futuristic', labelAr: 'مستقبلي',        preview: '#071426' },
  dark:                 { label: 'Dark',          labelAr: 'داكن',             preview: '#040d18' },
  light:                { label: 'Light',         labelAr: 'فاتح',             preview: '#f8fafc' },
  corporate:            { label: 'Corporate',     labelAr: 'كوربوريت',         preview: '#0a0f1e' },
  midnight:             { label: 'Midnight',      labelAr: 'منتصف الليل',     preview: '#050210' },
  nahdi:                { label: 'Nahdi',         labelAr: 'نهدي',             preview: '#003a2e' },
  ocean:                { label: 'Ocean',         labelAr: 'أوشن',             preview: '#01172a' },
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
  crossSelling:        { label: 'Cross Selling',        labelAr: 'البيع المتقاطع' },
  branch_rank:         { label: 'Branch Rank',          labelAr: 'ترتيب الفرع' },
  month_progress:      { label: 'Month Progress',       labelAr: 'تقدم الشهر' },
  forecast:            { label: 'Forecast',             labelAr: 'التوقع' },
}

const DEFAULT_CARDS = ['overall_achievement', 'today_kpi', 'wasfaty', 'omni', 'wellness', 'forecast']

export const useSettingsStore = create(
  persist(
    (set, get) => ({
      theme:          THEMES.PHARMA,
      sidebarMode:    SIDEBAR_MODE.EXPANDED,
      compactMode:    false,
      reducedMotion:  false,
      fontSize:       'normal',
      dashboardCards: DEFAULT_CARDS,
      language:       'ar',   // 'ar' | 'en' — default Arabic

      setTheme: (theme) => {
        set({ theme })
        applyTheme(theme)
      },

      setLanguage: (lang) => {
        const safe = normaliseLang(lang)
        set({ language: safe })
        applyLanguage(safe)
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
        if (state) {
          applyTheme(state.theme)
          applyLanguage(normaliseLang(state.language))
        }
      },
    }
  )
)

// ── Apply theme via CSS variables on <html> ───────────────────
export function applyTheme(theme) {
  const root = document.documentElement
  root.setAttribute('data-theme', theme || 'dark')

  const T = {
    // ── PharmaPulse 2.0 — Primary theme (Deep Teal / Warm Slate) ──
    pharma: {
      '--bg-canvas':      '#0F1623',
      '--bg-surface':     '#1A2235',
      '--bg-elevated':    '#232E44',
      '--bg-overlay':     '#2A3550',
      '--bg-hover':       'rgba(255,255,255,0.04)',
      '--bg-active':      'rgba(13,107,116,0.12)',
      '--bg-base':        '#0F1623',
      '--bg-card':        '#1A2235',
      '--border-subtle':  '#2A3550',
      '--border-default': 'rgba(255,255,255,0.09)',
      '--border-strong':  'rgba(255,255,255,0.15)',
      '--border-brand':   'rgba(13,107,116,0.35)',
      '--border':         '#2A3550',
      '--border-hover':   'rgba(255,255,255,0.09)',
      '--text-primary':   '#F1F5F9',
      '--text-secondary': '#94A3B8',
      '--text-muted':     '#64748B',
      '--text-brand':     '#0D9BAA',
      '--brand-300':      '#5EEAD4',
      '--brand-400':      '#2DD4BF',
      '--brand-500':      '#0D6B74',
      '--brand-600':      '#0A5560',
      '--sidebar-bg':     '#1E2A3A',
      '--topbar-bg':      'rgba(15,22,35,0.92)',
      '--input-bg':       'rgba(26,34,53,0.8)',
      '--modal-bg':       'rgba(15,22,35,0.99)',
    },
    // ── PharmaPulse 2.0 — Light mode ──────────────────────────────
    'pharma-light': {
      '--bg-canvas':      '#F7F8FA',
      '--bg-surface':     '#FFFFFF',
      '--bg-elevated':    '#F0F2F5',
      '--bg-overlay':     '#E8EBF0',
      '--bg-hover':       'rgba(0,0,0,0.04)',
      '--bg-active':      'rgba(13,107,116,0.08)',
      '--bg-base':        '#F7F8FA',
      '--bg-card':        '#FFFFFF',
      '--border-subtle':  '#E2E6EC',
      '--border-default': 'rgba(0,0,0,0.10)',
      '--border-strong':  'rgba(0,0,0,0.16)',
      '--border-brand':   'rgba(13,107,116,0.30)',
      '--border':         '#E2E6EC',
      '--border-hover':   'rgba(0,0,0,0.10)',
      '--text-primary':   '#1E2A3A',
      '--text-secondary': '#475569',
      '--text-muted':     '#94A3B8',
      '--text-brand':     '#0D6B74',
      '--brand-300':      '#0D9BAA',
      '--brand-400':      '#0D8090',
      '--brand-500':      '#0D6B74',
      '--brand-600':      '#0A5560',
      '--sidebar-bg':     '#1E2A3A',
      '--topbar-bg':      'rgba(247,248,250,0.94)',
      '--input-bg':       'rgba(255,255,255,0.9)',
      '--modal-bg':       'rgba(255,255,255,0.99)',
    },
    // ── Legacy dark (preserved for existing users) ──────────────
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
    // ── PharmaPulse Futuristic — Deep navy + cyan/emerald accents ──
    // Inspired by premium SaaS intelligence dashboards.
    // Uses cyan (#06B6D4) and emerald (#00F5A0) as accent pair.
    // Background is deep navy-black; borders glow in cyan.
    // Does NOT replace 'pharma' — additive optional theme.
    'pharmapulse-futuristic': {
      '--bg-canvas':      '#020617',
      '--bg-surface':     '#071426',
      '--bg-elevated':    '#0B1F33',
      '--bg-overlay':     '#102A44',
      '--bg-hover':       'rgba(6,182,212,0.06)',
      '--bg-active':      'rgba(6,182,212,0.14)',
      '--bg-base':        '#020617',
      '--bg-card':        '#071426',
      '--border-subtle':  'rgba(56,189,248,0.22)',
      '--border-default': 'rgba(56,189,248,0.32)',
      '--border-strong':  'rgba(6,182,212,0.55)',
      '--border-brand':   '#06B6D4',
      '--border':         'rgba(56,189,248,0.22)',
      '--border-hover':   'rgba(6,182,212,0.45)',
      '--text-primary':   '#F8FAFC',
      '--text-secondary': '#CBD5E1',
      '--text-muted':     '#64748B',
      '--text-brand':     '#06B6D4',
      '--brand-300':      '#00F5A0',
      '--brand-400':      '#22D3EE',
      '--brand-500':      '#06B6D4',
      '--brand-600':      '#0EA5E9',
      '--sidebar-bg':     'rgba(2,6,23,0.98)',
      '--topbar-bg':      'rgba(2,6,23,0.92)',
      '--input-bg':       'rgba(7,20,38,0.85)',
      '--modal-bg':       'rgba(2,6,23,0.99)',
    },
  }

  const vars = T[theme] || T.dark
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v))
  root.style.colorScheme = theme === 'light' ? 'light' : 'dark'
}
