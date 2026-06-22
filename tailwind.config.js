/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans:    ['Inter', 'IBM Plex Sans Arabic', 'Cairo', 'system-ui', 'sans-serif'],
        display: ['Inter', 'IBM Plex Sans Arabic', 'Cairo', 'system-ui', 'sans-serif'],
        mono:    ['JetBrains Mono', 'ui-monospace', 'monospace'],
        arabic:  ['IBM Plex Sans Arabic', 'Cairo', 'sans-serif'],
      },
      colors: {
        // ── PharmaPulse 2.0 Brand — Deep Teal ──────────────────
        brand: {
          50:  '#E8F7F8',
          100: '#C4ECEF',
          200: '#8DD8DE',
          300: '#5EEAD4',
          400: '#2DD4BF',
          500: '#0D6B74',   // PRIMARY — Deep Teal
          600: '#0A5560',
          700: '#07404A',
          800: '#052C33',
          900: '#02181D',
          950: '#010C10',
        },
        // ── Accent — Soft Cyan ──────────────────────────────────
        accent: {
          400: '#22D3EE',
          500: '#06B6D4',
          600: '#0891B2',
        },
        zinc: {
          925: '#111113', 950: '#09090b',
        },
        // ── Design token surface aliases (CSS-var-backed) ───────
        canvas:   '#0F1623',
        surface:  '#1A2235',
        elevated: '#232E44',
        overlay:  '#2A3550',

        // ── Semantic status colors — 2.0 calmer palette ─────────
        'status-success':  '#2D7D5A',
        'status-warning':  '#D4840A',
        'status-critical': '#B92B2B',
        'status-info':     '#0D6B74',

        // ── KPI semantic (for Tailwind text-* / bg-* utilities) ─
        'kpi-excellent': '#2D7D5A',
        'kpi-good':      '#0D9BAA',
        'kpi-warning':   '#D4840A',
        'kpi-critical':  '#B92B2B',
        'kpi-fallback':  '#94A3B8',

        // ── Core KPI brand palette (per-KPI fixed colors) ───────
        'kpi-wasfaty':      '#6366f1',
        'kpi-omni':         '#B92B2B',
        'kpi-wellness':     '#D4840A',
        'kpi-basket':       '#2D7D5A',
        'kpi-crossSelling': '#8b5cf6',
      },
      borderRadius: {
        'xl':  '0.75rem',
        '2xl': '1rem',
        '3xl': '1.25rem',
        'card':  '12px',
        'badge': '9999px',
      },
      boxShadow: {
        'xs':          '0 1px 2px rgba(15,23,42,0.04)',
        'sm':          '0 1px 3px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04)',
        'card':        '0 1px 2px rgba(15,23,42,0.04)',
        'card-inner':  'inset 0 1px 0 rgba(255,255,255,0.04)',
        'float':       '0 8px 24px rgba(15,23,42,0.12), 0 0 0 1px rgba(255,255,255,0.05)',
        'glow':        '0 0 0 1px rgba(13,107,116,0.30), 0 4px 16px rgba(13,107,116,0.15)',
        'glow-danger': '0 0 0 1px rgba(185,43,43,0.30), 0 4px 16px rgba(185,43,43,0.15)',
        'focus-ring':  '0 0 0 2px rgba(13,107,116,0.25)',
      },
      fontSize: {
        '2xs': ['10px', { lineHeight: '14px', letterSpacing: '0.05em' }],
        'metric':    ['1.75rem', { lineHeight: '1', letterSpacing: '-0.04em' }],
        'metric-sm': ['1.25rem', { lineHeight: '1', letterSpacing: '-0.03em' }],
      },
      spacing: {
        // Enterprise semantic spacing aliases
        'card-pad':    '16px',
        'card-pad-sm': '12px',
        'section':     '24px',
        'page':        '24px',
      },
      letterSpacing: {
        'metric':  '-0.04em',
        'tight-2': '-0.02em',
        'caps':    '0.08em',
        'wider-2': '0.1em',
      },
      fontVariantNumeric: {
        // Explicit tabular-nums for metric values
        'tabular': 'tabular-nums',
      },
      transitionDuration: {
        '400': '400ms',
        '600': '600ms',
        '700': '700ms',
      },
    },
  },
  plugins: [
    // ── Tabular-nums utility plugin (no external dep)
    function({ addUtilities }) {
      addUtilities({
        '.tabular-nums': {
          'font-variant-numeric': 'tabular-nums',
          'font-feature-settings': '"tnum" 1',
        },
        '.no-spinners': {
          '-webkit-appearance': 'none',
          '-moz-appearance': 'textfield',
          '&::-webkit-inner-spin-button': { display: 'none' },
          '&::-webkit-outer-spin-button': { display: 'none' },
        },
        // Enterprise surface utility (bg + border in one)
        '.surface': {
          'background': 'var(--bg-surface)',
          'border': '1px solid var(--border-subtle)',
        },
        '.surface-elevated': {
          'background': 'var(--bg-elevated)',
          'border': '1px solid var(--border-default)',
        },
        // RTL-safe text alignment helpers
        '.text-start': { 'text-align': 'start' },
        '.text-end':   { 'text-align': 'end'   },
      })
    },
  ],
}

