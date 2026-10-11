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

/** Full width in the 12-column card grid. */
export const FULL = 12;

/** Cards the person put side by side, e.g. a half card dropped next to a full one. */
export type Pairs = [string, string][];

const partnerOf = (pairs: Pairs, id: string) =>
  pairs.find((p) => p.includes(id))?.find((x) => x !== id);

/**
 * The width of each card in the order shown, filling rows with no gaps (2026-10-11):
 * - a pair the person made sits side by side, 6 + 6 (when the two are next to each other);
 * - otherwise a full card has its own row;
 * - two half cards side by side share a row: at their default widths when those add up to a row
 *   (e.g. 7 + 5), otherwise 6 + 6;
 * - a half card left alone in its row widens to full.
 */
export function rowSpans(
  ids: string[],
  spans: Map<string, number>,
  pairs: Pairs = [],
): Map<string, number> {
  const want = (id: string) => spans.get(id) ?? FULL;
  /** Paired by the person with the card right after it. */
  const pairedNext = (i: number) =>
    ids[i + 1] !== undefined && partnerOf(pairs, ids[i]!) === ids[i + 1];
  const out = new Map<string, number>();
  for (let i = 0; i < ids.length; i++) {
    const a = ids[i]!;
    const b = ids[i + 1];
    const fits = b !== undefined && want(a) + want(b) === FULL;
    if (pairedNext(i)) {
      out.set(a, fits ? want(a) : 6);
      out.set(b!, fits ? want(b!) : 6);
      i++;
    } else if (
      want(a) < FULL &&
      b !== undefined &&
      want(b) < FULL &&
      !pairedNext(i + 1) // b belongs with the card after it
    ) {
      out.set(a, fits ? want(a) : 6);
      out.set(b, fits ? want(b) : 6);
      i++;
    } else {
      out.set(a, FULL);
    }
  }
  return out;
}

/**
 * After a drop: a half card that lands alone next to a full card pairs with it, the full card
 * turning half (the card after it first, else the one before). Pairs whose cards are no longer
 * next to each other are dropped. Returns the new pairs.
 */
export function pairOnDrop(
  ids: string[],
  spans: Map<string, number>,
  pairs: Pairs,
  moved: string,
): Pairs {
  const adjacent = (p: [string, string]) => Math.abs(ids.indexOf(p[0]) - ids.indexOf(p[1])) === 1;
  let kept = pairs.filter((p) => ids.includes(p[0]) && ids.includes(p[1]) && adjacent(p));
  const want = (id: string) => spans.get(id) ?? FULL;
  const shown = rowSpans(ids, spans, kept);
  if (want(moved) >= FULL || shown.get(moved)! < FULL) return kept;
  const i = ids.indexOf(moved);
  const free = (id: string | undefined): id is string =>
    id !== undefined && want(id) >= FULL && shown.get(id) === FULL;
  const partner = free(ids[i + 1]) ? ids[i + 1] : free(ids[i - 1]) ? ids[i - 1] : undefined;
  if (!partner) return kept;
  kept = kept.filter((p) => !p.includes(moved) && !p.includes(partner));
  return [...kept, [moved, partner]];
}
