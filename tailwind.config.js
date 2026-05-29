/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans:    ['Inter', 'Cairo', 'system-ui', 'sans-serif'],
        display: ['Inter', 'Cairo', 'system-ui', 'sans-serif'],
        mono:    ['JetBrains Mono', 'ui-monospace', 'monospace'],
        arabic:  ['Cairo', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#e6fff9', 100:'#b3ffe9', 200:'#80ffd9', 300:'#4dffc9',
          400:'#26e8b4', 500:'#00d2ad', 600:'#00a989', 700:'#008067',
          800:'#005745', 900:'#002e23', 950:'#001a14',
        },
        zinc: {
          925: '#111113', 950: '#09090b',
        },
        // ── Design token surface aliases (CSS-var-backed for runtime)
        // These Tailwind classes work without CSS var support
        canvas:   '#09090b',
        surface:  '#141417',
        elevated: '#1c1c20',
        overlay:  '#222226',

        // ── KPI semantic (for Tailwind text-* / bg-* utilities)
        'kpi-excellent': '#22c55e',
        'kpi-good':      '#00d2ad',
        'kpi-warning':   '#f59e0b',
        'kpi-critical':  '#ef4444',
        'kpi-fallback':  '#a1a1aa',

        // ── Core KPI brand palette
        'kpi-wasfaty':      '#6366f1',
        'kpi-omni':         '#ef4444',
        'kpi-wellness':     '#f59e0b',
        'kpi-basket':       '#22c55e',
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
        'xs':          '0 1px 2px rgba(0,0,0,0.4)',
        'sm':          '0 1px 3px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.4)',
        'card':        '0 0 0 1px rgba(255,255,255,0.04), 0 2px 4px rgba(0,0,0,0.3)',
        'card-inner':  'inset 0 1px 0 rgba(255,255,255,0.04)',
        'float':       '0 8px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)',
        'glow':        '0 0 0 1px rgba(0,210,173,0.3), 0 4px 16px rgba(0,210,173,0.15)',
        'glow-danger': '0 0 0 1px rgba(239,68,68,0.3), 0 4px 16px rgba(239,68,68,0.15)',
        'focus-ring':  '0 0 0 2px rgba(0,210,173,0.12)',
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

