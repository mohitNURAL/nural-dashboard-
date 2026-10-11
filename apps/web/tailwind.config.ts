import type { Config } from 'tailwindcss';

// Nural tokens (SRS section 6). Colours point at CSS variables in src/theme/tokens.css;
// font sizes are named after the Figma text styles.

/**
 * A theme colour that also takes an opacity (`bg-accent/15`): the variable mixed with
 * transparent; Tailwind fills in <alpha-value> (1 without a modifier). Plain `var(--x)` colours
 * drop such classes silently.
 */
const v = (name: string) =>
  `color-mix(in srgb, var(${name}) calc(<alpha-value> * 100%), transparent)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: v('--primary'),
          dark: v('--primary-dark'),
          deep: v('--primary-deep'),
          muted: v('--primary-muted'),
          soft: v('--primary-soft'),
          'soft-100': v('--primary-soft-100'),
          'soft-300': v('--primary-soft-300'),
        },
        accent: {
          DEFAULT: v('--accent'),
          dark: v('--accent-dark'),
          darker: v('--accent-darker'),
          soft: v('--accent-soft'),
        },
        bad: {
          DEFAULT: v('--bad'),
          dark: v('--bad-dark'),
          soft: v('--bad-soft'),
        },
        good: v('--good'),
        chrome: v('--chrome'),
        warn: v('--warn'),
        bg: v('--bg'),
        surface: v('--surface'),
        text: { DEFAULT: v('--text'), muted: v('--text-muted') },
        border: v('--border'),
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
