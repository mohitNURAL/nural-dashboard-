import type { Config } from 'tailwindcss';

// Nural tokens (SRS section 6). Colours point at CSS variables in src/theme/tokens.css.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'var(--primary)',
          dark: 'var(--primary-dark)',
          muted: 'var(--primary-muted)',
          soft: 'var(--primary-soft)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          dark: 'var(--accent-dark)',
          soft: 'var(--accent-soft)',
        },
        bad: {
          DEFAULT: 'var(--bad)',
          dark: 'var(--bad-dark)',
          soft: 'var(--bad-soft)',
        },
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        text: { DEFAULT: 'var(--text)', muted: 'var(--text-muted)' },
        border: 'var(--border)',
      },
      fontFamily: {
        heading: ['Manrope', 'system-ui', 'sans-serif'],
        body: ['"Work Sans"', 'system-ui', 'sans-serif'],
      },
      borderRadius: { card: '8px' },
    },
  },
  plugins: [],
} satisfies Config;
