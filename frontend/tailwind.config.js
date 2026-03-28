/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'JetBrains Mono', 'monospace'],
      },
      colors: {
        obsidian: '#050505',
        surface: {
          1: 'rgba(255,255,255,0.03)',
          2: 'rgba(255,255,255,0.06)',
          3: 'rgba(255,255,255,0.10)',
        },
      },
      keyframes: {
        'fade-up': {
          '0%':   { opacity: '0', transform: 'translateY(24px)', filter: 'blur(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)',     filter: 'blur(0px)' },
        },
        'score-ring': {
          '0%':   { strokeDashoffset: '283' },
          '100%': { strokeDashoffset: 'var(--target-offset)' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '0.4' },
          '50%':      { opacity: '0.8' },
        },
      },
      animation: {
        'fade-up':    'fade-up 0.8s cubic-bezier(0.32,0.72,0,1) forwards',
        'score-ring': 'score-ring 1.2s cubic-bezier(0.32,0.72,0,1) forwards',
        'pulse-glow': 'pulse-glow 3s ease-in-out infinite',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.32,0.72,0,1)',
      },
    },
  },
  plugins: [],
};
