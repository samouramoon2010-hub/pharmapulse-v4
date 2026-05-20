/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans:    ['Cairo', 'sans-serif'],
        display: ['Sora', 'sans-serif'],
        mono:    ['JetBrains Mono', 'monospace'],
      },
      colors: {
        brand: {
          50:  '#edfaf5', 100: '#d3f3e6', 200: '#aae6d1',
          300: '#72d2b7', 400: '#3ab598', 500: '#1a9a7e',
          600: '#0f7c65', 700: '#0d6354', 800: '#0d4f44',
          900: '#0b4139', 950: '#052520',
        },
        slate: { 850: '#172033', 950: '#020b14' },
      },
      boxShadow: {
        'glow':    '0 0 20px rgba(26,154,126,0.3)',
        'glow-lg': '0 0 50px rgba(26,154,126,0.15)',
        'card':    '0 1px 3px rgba(0,0,0,0.4)',
        'card-lg': '0 8px 30px rgba(0,0,0,0.4)',
      },
      backgroundImage: {
        'gradient-brand': 'linear-gradient(135deg, #1a9a7e, #0f7c65)',
        'gradient-dark':  'linear-gradient(180deg, #0f172a, #020b14)',
        'gradient-card':  'linear-gradient(135deg, rgba(26,154,126,0.1), rgba(26,154,126,0.02))',
      },
    },
  },
  plugins: [],
}
