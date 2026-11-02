// Focus view (2026-10-11): clicking a card's title or empty area brings it to the centre of the
// screen with the page behind blurred; a click outside, Escape or the close button puts it back.
// Clicks on counts, charts, tables, buttons and fields keep doing what they do (drill-downs).
// The card stays mounted where it is (sorting, paging and chart state are kept); only its
// position changes, animated from where it was (FLIP) unless the system asks for less motion.
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';

/** Clicks on these never start the focus view. */
const INTERACTIVE =
  'button,a,input,select,textarea,label,svg,canvas,table,[role=button],[role=radio],[role=radiogroup],[role=menu],[role=dialog],[role=listbox],[data-no-focus]';

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Below the sticky top bar (56 px) with a margin. */
const TOP = 72;
const BOTTOM = 24;

/**
 * Where a centred panel goes (focus view and spotlight): 70% of the screen wide (nearly full
 * width on a phone), under the top bar, never taller than what is left of the screen.
 */
export function focusBox() {
  const W = window.innerWidth;
  const width = Math.round(W * (W < 768 ? 0.94 : 0.7));
  return { width, top: TOP, maxHeight: window.innerHeight - TOP - BOTTOM };
}

export function useFocusBox<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [focused, setFocused] = useState(false);
  const [height, setHeight] = useState(0);
  const from = useRef<DOMRect | null>(null);

  const open = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    from.current = el.getBoundingClientRect();
    setHeight(from.current.height);
    setFocused(true);
  }, []);

  const close = useCallback(() => {
    if (!ref.current) return;
    from.current = ref.current.getBoundingClientRect();
    setFocused(false);
  }, []);

  // FLIP: start the card where it was and let it glide to where it is now.
  useLayoutEffect(() => {
    const el = ref.current;
    const first = from.current;
    from.current = null;
    if (!el || !first || reduceMotion()) return;
    const last = el.getBoundingClientRect();
    if (!last.width || !last.height) return;
    el.animate(
      [
        {
          transformOrigin: 'top left',
          transform: `translate(${first.left - last.left}px, ${first.top - last.top}px) scale(${
            first.width / last.width
          }, ${first.height / last.height})`,
        },
        { transformOrigin: 'top left', transform: 'none' },
      ],
      { duration: 280, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
    );
  }, [focused]);

  useEffect(() => {
    if (!focused) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    const onResize = () => close();
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [focused, close]);

  /** On the card: a click on its title or empty area focuses it. */
  const onClick = (e: React.MouseEvent) => {
    if (focused) return;
    const target = e.target as HTMLElement;
    if (target.closest(INTERACTIVE)) return;
    if (window.getSelection()?.toString()) return; // selecting text, not clicking
    open();
  };

  // 70% of the screen, centred under the top bar, scrolling inside when taller than the screen.
  const { width, top, maxHeight } = focusBox();
  const style: CSSProperties | undefined = focused
    ? {
        position: 'fixed',
        zIndex: 50,
        top,
        left: Math.round((window.innerWidth - width) / 2),
        width,
        maxHeight,
        overflow: 'auto',
        boxShadow: '0 24px 64px rgba(0, 0, 0, 0.35)',
      }
    : undefined;

  /** Keeps the card's place on the page while it is in the centre. */
  const placeholder = focused ? <div aria-hidden style={{ height }} /> : null;

  const backdrop = focused
    ? createPortal(
        <div
          aria-hidden
          onClick={close}
          className="fixed inset-0 z-40 overlay"
          style={reduceMotion() ? undefined : { animation: 'fade-in 200ms ease-out' }}
        />,
        document.body,
      )
    : null;

  return { ref, focused, onClick, close, style, placeholder, backdrop };
}
