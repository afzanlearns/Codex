export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist Mono', 'JetBrains Mono', 'monospace'],
        mono: ['Geist Mono', 'JetBrains Mono', 'monospace'],
      },
      colors: {
        bg:      '#0c0c0c',
        'bg-1':  '#111111',
        'bg-2':  '#161616',
        'bg-3':  '#1c1c1c',
        border:  '#222222',
        red:     '#c41e1e',
        cream:   '#e8e4d4',
      },
    },
  },
  plugins: [],
};
