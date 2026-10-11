// Spotlight (2026-10-12, SRS 6): a click on a number, bar or cell no longer scrolls the page to
// the list at the bottom. The page dims, the clicked data point stays lit with a glowing ring,
// and the list that depends on it comes to the centre of the screen, under (or over) it.
// Escape, a click on the dimmed page or ✕ puts everything back where it was.
// The list keeps living where it is (sorting, paging, editing work as usual); only its position
// changes while it is in the spotlight, like the focus view (layout/useFocusBox.tsx).

/** The last click on the page, so a drill-down knows which data point started it. */
let last: { el: Element; at: number } | null = null;

/** Records clicks (capture phase, before React handlers run). Installed once by App. */
export function trackClicks() {
  const on = (e: MouseEvent) => {
    const t = e.target as Element | null;
    if (!t?.closest('main') || t.closest('[data-spotlight-panel]')) return;
    // The data point: a count button, a tile, a table cell or a chart mark.
    const el =
      t.closest('button, [role=button], td, th, li') ?? t.closest('svg')?.parentElement ?? t;
    // A tile is lit whole; elsewhere the count, cell or chart mark itself.
    const tile = t.closest('[data-group$=".tiles"] > [data-slot]');
    last = { el: tile ?? (t.closest('svg') && !t.closest('button') ? t : el), at: Date.now() };
  };
  document.addEventListener('click', on, true);
  return () => document.removeEventListener('click', on, true);
}

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const TOP_BAR = 64;
const GAP = 14;
const PAD = 6;

let close: (() => void) | null = null;

export const spotlightOpen = () => !!close;

/**
 * Brings `panel` (an open list or card) to the centre with the page dimmed around the data point
 * clicked just before (if any). Calling it again moves the spotlight to the new panel.
 */
export function spotlight(panel: HTMLElement | null, opts: { onClose?: () => void } = {}) {
  if (!panel) return;
  close?.();
  const anchor = last && Date.now() - last.at < 2500 && !panel.contains(last.el) ? last.el : null;

  // Bring the clicked point near the top, so the list fits under it.
  if (anchor) {
    const r = anchor.getBoundingClientRect();
    if (r.top < TOP_BAR + 40 || r.bottom > window.innerHeight * 0.45)
      window.scrollBy({ top: r.top - TOP_BAR - 40, behavior: 'instant' as ScrollBehavior });
  }

  // Keep the panel's place on the page while it is away.
  const placeholder = document.createElement('div');
  placeholder.style.height = `${panel.offsetHeight}px`;
  placeholder.setAttribute('aria-hidden', 'true');
  panel.before(placeholder);
  const saved = panel.style.cssText;
  panel.setAttribute('data-spotlight-panel', '');
  const prevOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = 'hidden';

  // The dimmed page with a hole around the data point, its ring and the close button.
  const layer = document.createElement('div');
  layer.setAttribute('data-spotlight', '');
  layer.innerHTML = `
    <svg class="spot-dim" width="100%" height="100%" aria-hidden="true"><path fill-rule="evenodd"/></svg>
    <div class="spot-ring" aria-hidden="true"></div>
    <button type="button" class="spot-close" aria-label="Close and go back to the page">✕</button>`;
  document.body.append(layer);
  const path = layer.querySelector('path')!;
  const ring = layer.querySelector<HTMLElement>('.spot-ring')!;
  const btn = layer.querySelector<HTMLButtonElement>('.spot-close')!;

  // The ring and the hole follow the data point (cards above may still load and move it).
  const place = () => {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const a = anchor?.isConnected ? anchor.getBoundingClientRect() : null;
    const hole =
      a && a.width && a.bottom > 0 && a.top < H
        ? {
            x: a.left - PAD,
            y: a.top - PAD,
            w: a.width + 2 * PAD,
            h: a.height + 2 * PAD,
          }
        : null;
    path.setAttribute(
      'd',
      `M0 0H${W}V${H}H0Z` + (hole ? `M${hole.x} ${hole.y}h${hole.w}v${hole.h}h${-hole.w}Z` : ''),
    );
    ring.style.display = hole ? 'block' : 'none';
    if (hole)
      Object.assign(ring.style, {
        left: `${hole.x}px`,
        top: `${hole.y}px`,
        width: `${hole.w}px`,
        height: `${hole.h}px`,
      });
  };

  // The list is placed once (and again if the window is resized), never per frame: a tile lifting
  // on hover would otherwise make it jitter. Under the point when most of the screen is left
  // there, else at full height from the top.
  const placePanel = () => {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const a = anchor?.isConnected ? anchor.getBoundingClientRect() : null;
    const width = Math.min(1100, Math.round(W * 0.94));
    const below = a && a.bottom > 0 && a.top < H ? a.bottom + PAD + GAP : 0;
    const top = below && H - below >= H * 0.55 ? below : TOP_BAR + 12;
    Object.assign(panel.style, {
      position: 'fixed',
      zIndex: '46',
      left: `${Math.round((W - width) / 2)}px`,
      top: `${top}px`,
      width: `${width}px`,
      maxHeight: `${H - top - 16}px`,
      overflow: 'auto',
      boxShadow:
        '0 24px 64px rgba(0,0,0,0.38), 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent)',
    });
    btn.style.top = `${top - 14}px`;
    btn.style.left = `${Math.round((W + width) / 2) - 18}px`;
  };

  // Cards above may still load and move the point: follow it while the spotlight is on.
  let frame = 0;
  const follow = () => {
    place();
    frame = requestAnimationFrame(follow);
  };
  placePanel();
  follow();
  window.addEventListener('resize', placePanel);
  if (!reduceMotion()) {
    panel.animate(
      [
        { opacity: 0, transform: 'translateY(12px) scale(0.98)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 240, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
    );
  }

  const onKey = (e: KeyboardEvent) => {
    // Escape inside an open popup (a picker, the task view) closes that first.
    if (
      e.key === 'Escape' &&
      !document.querySelector('[role=dialog], [data-radix-popper-content-wrapper]')
    )
      close?.();
  };
  const onDown = (e: MouseEvent) => {
    if (e.target instanceof Element && e.target.closest('.spot-dim')) close?.();
  };
  window.addEventListener('keydown', onKey);
  layer.addEventListener('mousedown', onDown);
  btn.addEventListener('click', () => close?.());

  close = () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', placePanel);
    layer.remove();
    placeholder.remove();
    panel.style.cssText = saved;
    panel.removeAttribute('data-spotlight-panel');
    document.documentElement.style.overflow = prevOverflow;
    close = null;
    last = null;
    opts.onClose?.();
  };
}

/** Puts the spotlight away (e.g. when the page changes). */
export const closeSpotlight = () => close?.();

/** Spotlights the element behind a ref once the list has opened and drawn (two frames). */
export function spotlightSoon(ref: { current: HTMLElement | null }) {
  requestAnimationFrame(() => requestAnimationFrame(() => spotlight(ref.current)));
}
