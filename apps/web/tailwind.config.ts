import type { Config } from 'tailwindcss';

// Nural tokens (SRS section 6; Nural brand skill, Product UI track, 2026-10-29). Colours point at
// CSS variables in src/theme/tokens.css; font sizes are named after the Figma text styles. The
// brand rules are enforced here for every page at once: line height Auto, letter-spacing 0, only
// weights 400 and 700, no drop shadows (focus rings stay) and no blur.

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
        navy: { DEFAULT: v('--navy'), deep: v('--navy-deep') },
        'on-accent': v('--on-accent'),
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
        title: ['24px', { lineHeight: 'normal', fontWeight: '700' }], // Title Bold 24
        tile: ['20px', { lineHeight: 'normal', fontWeight: '700' }], // Subtitle Bold 20 (KPI values)
        h1: ['18px', { lineHeight: 'normal', fontWeight: '700' }], // H1 Bold 18
        h2: ['16px', { lineHeight: 'normal', fontWeight: '700' }], // H2 Bold 16
        h3: ['12px', { lineHeight: 'normal', fontWeight: '700' }], // H3 Bold 12 (card headers, tabs)
        label: ['12px', { lineHeight: 'normal' }], // Label LG 12 (field labels, column headers)
        button: ['12px', { lineHeight: 'normal', fontWeight: '700' }], // Button SM Bold 12
        body: ['12px', { lineHeight: 'normal' }], // Body 12
        table: ['10px', { lineHeight: 'normal' }], // Table Data 10
      },
      borderRadius: { card: 'var(--radius-card)', control: 'var(--radius-control)' },
      maxWidth: { page: '1440px' },
    },
    // Only Regular and Bold exist (Nural brand): the in-between weights map to the nearest one.
    fontWeight: {
      normal: '400',
      medium: '400',
      semibold: '700',
      bold: '700',
      extrabold: '700',
      black: '700',
    },
    letterSpacing: { tighter: '0', tight: '0', normal: '0', wide: '0', wider: '0', widest: '0' },
    // No drop shadows (Nural brand): separation comes from fill, a hairline or space.
    boxShadow: {
      none: 'none',
      sm: 'none',
      DEFAULT: 'none',
      md: 'none',
      lg: 'none',
      xl: 'none',
      '2xl': 'none',
      inner: 'none',
      pop: 'none',
    },
    backdropBlur: { none: '0', sm: '0', DEFAULT: '0', md: '0', lg: '0', xl: '0' },
    blur: { none: '0', sm: '0', DEFAULT: '0', md: '0', lg: '0', xl: '0', '2xl': '0', '3xl': '0' },
  },
  plugins: [],
} satisfies Config;
