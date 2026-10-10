// A count that opens the tasks behind it. Zero is plain text: there is nothing to open.
import clsx from 'clsx';

interface Props {
  n: number | undefined;
  onClick: () => void;
  title?: string;
  tone?: 'bad';
  className?: string;
}

export function CountButton({ n, onClick, title, tone, className }: Props) {
  if (!n) return <span className="text-text-muted">{n ?? ''}</span>;
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={clsx(
        'tabular-nums underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary',
        tone === 'bad' ? 'font-bold text-bad' : 'text-primary-dark hover:text-primary',
        className,
      )}
    >
      {n.toLocaleString('en-IN')}
    </button>
  );
}
