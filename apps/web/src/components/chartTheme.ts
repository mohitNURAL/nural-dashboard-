// Chart colours and text follow the Nural tokens in theme/tokens.css.

/** Reads a CSS custom property, e.g. token('--primary'). */
export const token = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export const chartText = {
  fontFamily: '"Work Sans", system-ui, sans-serif',
  fontSize: 10,
  color: '#231F20',
};
