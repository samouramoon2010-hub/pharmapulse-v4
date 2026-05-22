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
      },
      borderRadius: {
        'xl': '0.75rem', '2xl': '1rem', '3xl': '1.25rem',
      },
      boxShadow: {
        'xs':    '0 1px 2px rgba(0,0,0,0.4)',
        'sm':    '0 1px 3px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.4)',
        'card':  '0 0 0 1px rgba(255,255,255,0.04), 0 2px 4px rgba(0,0,0,0.3)',
        'float': '0 8px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)',
        'glow':  '0 0 0 1px rgba(0,210,173,0.3), 0 4px 16px rgba(0,210,173,0.15)',
      },
      fontSize: {
        '2xs': ['10px', { lineHeight: '14px', letterSpacing: '0.05em' }],
      },
    },
  },
  plugins: [],
}
