import type { Config } from 'tailwindcss';

// Nural tokens (SRS section 6). Colours point at CSS variables in src/theme/tokens.css;
// font sizes are named after the Figma text styles.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'var(--primary)',
          dark: 'var(--primary-dark)',
          deep: 'var(--primary-deep)',
          muted: 'var(--primary-muted)',
          soft: 'var(--primary-soft)',
          'soft-100': 'var(--primary-soft-100)',
          'soft-300': 'var(--primary-soft-300)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          dark: 'var(--accent-dark)',
          darker: 'var(--accent-darker)',
          soft: 'var(--accent-soft)',
        },
        bad: {
          DEFAULT: 'var(--bad)',
          dark: 'var(--bad-dark)',
          soft: 'var(--bad-soft)',
        },
        good: 'var(--good)',
        warn: 'var(--warn)',
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        text: { DEFAULT: 'var(--text)', muted: 'var(--text-muted)' },
        border: 'var(--border)',
      },
      fontFamily: {
        heading: ['Manrope', 'system-ui', 'sans-serif'],
        body: ['"Work Sans"', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        title: ['24px', { lineHeight: '32px', fontWeight: '700' }], // Titles/T-B
        h1: ['18px', { lineHeight: '24px', fontWeight: '700' }], // Headers/H1-B
        h3: ['14px', { lineHeight: '20px', fontWeight: '700' }], // Headers/H3-B
        tile: ['20px', { lineHeight: '28px', fontWeight: '700' }], // Titles/ST-B
        label: ['10px', { lineHeight: '14px', letterSpacing: '0.04em' }], // Labels/Label-L
        button: ['12px', { lineHeight: '16px', letterSpacing: '0.04em', fontWeight: '700' }],
        body: ['12px', { lineHeight: '18px' }], // Body/Body-R
        table: ['10px', { lineHeight: '14px' }], // Table Data
      },
      borderRadius: { card: 'var(--radius-card)', control: 'var(--radius-control)' },
      boxShadow: { pop: 'var(--shadow-pop)' },
      maxWidth: { page: '1440px' },
    },
  },
  plugins: [],
} satisfies Config;
