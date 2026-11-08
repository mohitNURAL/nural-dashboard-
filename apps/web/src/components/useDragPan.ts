// Drag a scrolling box with the mouse (the Tasks in hand planner's grid, 2026-11-08).
import { useCallback, useEffect, useState, type MutableRefObject } from 'react';

/**
 * Drag with the mouse to move the grid (sideways through the weeks, or down the rows). A drag
 * longer than a few pixels is not a click, so the task under the pointer does not open. Returns
 * the ref to put on the box (it also fills `ref`), the box may appear after the first render, and
 * the box's inner width (kept up to date).
 */
export function useDragPan<T extends HTMLElement>(ref?: MutableRefObject<T | null>) {
  const [el, setEl] = useState<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [el]);
  const setRef = useCallback(
    (node: T | null) => {
      if (ref) ref.current = node;
      setEl(node);
    },
    [ref],
  );
  useEffect(() => {
    if (!el) return;
    // Step by step from the last position (not from where the drag began), so the grid can move
    // the scroll itself mid-drag (the planner keeps its columns in place as weeks load).
    let start: { x: number; y: number } | null = null;
    let last = { x: 0, y: 0 };
    let dragging = false;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      if ((e.target as HTMLElement).closest('input, textarea, select, a')) return;
      start = { x: e.clientX, y: e.clientY };
      last = start;
      dragging = false;
    };
    const onMove = (e: PointerEvent) => {
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (!dragging && Math.abs(dx) + Math.abs(dy) < 6) return;
      if (!dragging) {
        dragging = true;
        el.style.cursor = 'grabbing';
        el.style.userSelect = 'none';
      }
      el.scrollLeft -= e.clientX - last.x;
      el.scrollTop -= e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY };
    };
    const onUp = () => {
      if (dragging) {
        // Swallow the click that ends the drag.
        const stop = (ev: MouseEvent) => {
          ev.stopPropagation();
          ev.preventDefault();
        };
        window.addEventListener('click', stop, { capture: true, once: true });
        setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 0);
      }
      start = null;
      dragging = false;
      el.style.cursor = '';
      el.style.userSelect = '';
    };
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [el]);
  return { ref: setRef, width };
}
