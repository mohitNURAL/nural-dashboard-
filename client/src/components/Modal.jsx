import { useEffect, useRef } from 'react';

/** Accessible modal shell: Esc / backdrop click closes, focus moves in and returns (SRS §7 Accessibility). */
export default function Modal({ title, subtitle, small, wide, onClose, children }) {
  const boxRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Runs once per open, so parent re-renders never move focus.
  useEffect(() => {
    const previous = document.activeElement;
    const first = boxRef.current?.querySelector('input, select, button:not(.modal-close)') || boxRef.current;
    first?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab') {
        const focusable = [...boxRef.current.querySelectorAll('button, input, select, [tabindex="0"]')].filter((el) => !el.disabled);
        if (!focusable.length) return;
        const [head, tail] = [focusable[0], focusable[focusable.length - 1]];
        if (e.shiftKey && document.activeElement === head) { e.preventDefault(); tail.focus(); }
        else if (!e.shiftKey && document.activeElement === tail) { e.preventDefault(); head.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, []);

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal-box${small ? ' small' : ''}${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title" ref={boxRef} tabIndex={-1}>
        <div className="modal-head">
          <div>
            <div className="modal-title" id="modal-title">{title}</div>
            {subtitle && <div className="modal-sub">{subtitle}</div>}
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
