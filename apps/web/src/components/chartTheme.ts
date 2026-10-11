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

/** The colour mixed towards white by `t` (0..1), for the light end of a gradient. */
export function lighten(color: string, t: number): string {
  const rgb = rgbOf(color);
  if (!rgb) return color;
  const [r, g, b] = rgb.map((c) => Math.round(c + (255 - c) * t));
  return `rgb(${r},${g},${b})`;
}

/** Tooltip look in the current theme: frosted glass with a soft shadow. */
export const chartTooltip = () => ({
  backgroundColor: alpha(token('--surface'), 0.92),
  borderColor: alpha(token('--primary'), 0.25),
  borderWidth: 1,
  padding: [8, 12],
  extraCssText:
    'backdrop-filter: blur(8px); border-radius: 12px; box-shadow: 0 12px 32px rgba(16,24,64,0.18);',
  textStyle: { color: token('--text'), fontFamily: '"Work Sans", system-ui, sans-serif' },
});
