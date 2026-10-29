// The one loading mark (2026-10-30): a single-colour ring that turns while something is saving or
// loading (Nural brand: motion marks a state change only). Inherits the text colour.
import clsx from 'clsx';

export function Spinner({ size = 12, className }: { size?: number; className?: string }) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className={clsx('shrink-0 animate-spin motion-reduce:animate-none', className)}
    >
      <circle
        cx="8"
        cy="8"
        r="6.5"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="2"
      />
      <path
        d="M8 1.5a6.5 6.5 0 0 1 6.5 6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
