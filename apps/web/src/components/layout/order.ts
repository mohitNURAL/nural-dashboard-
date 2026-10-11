// Saved order of a group of tiles, cards or sections (2026-10-11).

/**
 * The saved order of the ids the page has today. Ids no longer on the page are dropped; new ones
 * (added by an update) go in after the item that comes before them in the default order.
 */
export function applyOrder(defaults: string[], saved?: string[]): string[] {
  if (!saved?.length) return defaults;
  const known = new Set(defaults);
  const out = [...new Set(saved.filter((id) => known.has(id)))];
  defaults.forEach((id, i) => {
    if (out.includes(id)) return;
    const before = defaults
      .slice(0, i)
      .reverse()
      .find((d) => out.includes(d));
    out.splice(before === undefined ? 0 : out.indexOf(before) + 1, 0, id);
  });
  return out;
}
