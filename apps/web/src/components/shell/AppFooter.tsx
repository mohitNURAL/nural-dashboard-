// The footer on every page (2026-10-12): Nural Pulse, powered by Bitrix24 and Nural.
export function AppFooter() {
  return (
    <footer className="mx-auto flex max-w-page flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-4 text-table text-text-muted lg:px-6">
      <span className="flex items-center gap-1.5">
        <span className="font-heading font-bold text-primary-dark">Nural</span>
        <span className="font-heading font-bold text-accent">Pulse</span>
        <span>· the live heartbeat of every project and person</span>
      </span>
      <span>
        Powered by <span className="font-heading font-bold text-[#2fc6f6]">Bitrix24</span> and{' '}
        <span className="font-heading font-bold text-primary-dark">Nural</span>
      </span>
    </footer>
  );
}
