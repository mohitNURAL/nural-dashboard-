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

/** Tooltip look in the current theme. */
export const chartTooltip = () => ({
  backgroundColor: token('--surface'),
  borderColor: token('--border'),
  textStyle: { color: token('--text'), fontFamily: '"Work Sans", system-ui, sans-serif' },
});
