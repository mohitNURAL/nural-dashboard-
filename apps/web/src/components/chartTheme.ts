// Chart colours and text follow the Nural tokens in theme/tokens.css.

/** Reads a CSS custom property, e.g. token('--primary'). */
export const token = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** Chart text in the current theme (read when a chart draws; charts redraw on a theme change). */
export const chartText = () => ({
  fontFamily: '"Work Sans", system-ui, sans-serif',
  fontSize: 10,
  color: token('--text'),
});

/** "#32499f" → [50, 73, 159]; other colour forms → undefined. */
export function rgbOf(color: string): [number, number, number] | undefined {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return undefined;
  const h = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join('') : m[1]!;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/** The colour with transparency, e.g. alpha('#32499f', 0.3) → "rgba(50,73,159,0.3)". */
export function alpha(color: string, a: number): string {
  const rgb = rgbOf(color);
  return rgb ? `rgba(${rgb.join(',')},${a})` : color;
}

/** Tooltip look (Nural brand): a flat White chip with a Primary 300 hairline, no blur or shadow. */
export const chartTooltip = () => ({
  backgroundColor: token('--surface'),
  borderColor: token('--primary-soft-300'),
  borderWidth: 1,
  padding: [8, 12],
  extraCssText: 'border-radius: 8px; box-shadow: none;',
  textStyle: { color: token('--text'), fontFamily: '"Work Sans", system-ui, sans-serif' },
});
