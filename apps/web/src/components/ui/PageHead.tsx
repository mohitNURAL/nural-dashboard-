// Page heading used by every page (2026-10-11): a gradient icon, the title and a line under it,
// and the page's own controls on the right.
import type { ReactNode } from 'react';

/** The heading at the top of a page. */
export function PageHead({
  title,
  sub,
  icon,
  children,
}: {
  title: string;
  sub: string;
  icon: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-primary to-accent text-white shadow-pop">
        {icon}
      </span>
      <div className="min-w-0">
        <h1 className="font-heading text-title text-primary-dark">{title}</h1>
        <p className="text-text-muted">{sub}</p>
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
