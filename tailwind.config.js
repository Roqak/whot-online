/** @type {import('tailwindcss').Config} */
const token = (name) => `oklch(var(--${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        table: {
          950: token('table-950'),
          900: token('table-900'),
          800: token('table-800'),
          700: token('table-700'),
          600: token('table-600'),
        },
        paper: {
          DEFAULT: token('paper'),
          dim: token('paper-dim'),
        },
        ink: {
          DEFAULT: token('ink'),
          soft: token('ink-soft'),
        },
        marigold: {
          DEFAULT: token('marigold'),
          deep: token('marigold-deep'),
        },
        leaf: token('leaf'),
        ember: token('ember'),
        fg: {
          DEFAULT: token('fg'),
          muted: token('fg-muted'),
          faint: token('fg-faint'),
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Bricolage Grotesque"', 'Inter', 'system-ui', 'sans-serif'],
      },
      transitionTimingFunction: {
        quart: 'cubic-bezier(0.25, 1, 0.5, 1)',
        expo: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      boxShadow: {
        card: '0 1px 2px oklch(0.1 0.03 264 / 0.5), 0 6px 16px oklch(0.1 0.03 264 / 0.35)',
        'card-lift': '0 8px 28px oklch(0.1 0.03 264 / 0.5), 0 2px 6px oklch(0.1 0.03 264 / 0.4)',
        seat: 'inset 0 1px 0 oklch(1 0 0 / 0.06)',
      },
      keyframes: {
        'pulse-ring': {
          '0%': { transform: 'scale(1)', opacity: '0.55' },
          '100%': { transform: 'scale(1.35)', opacity: '0' },
        },
        rise: {
          '0%': { transform: 'translateY(0) scale(0.8)', opacity: '0' },
          '25%': { opacity: '1' },
          '100%': { transform: 'translateY(-72px) scale(1.1)', opacity: '0' },
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 1.8s cubic-bezier(0.16, 1, 0.3, 1) infinite',
        rise: 'rise 2.4s cubic-bezier(0.25, 1, 0.5, 1) forwards',
      },
    },
  },
  plugins: [],
}
