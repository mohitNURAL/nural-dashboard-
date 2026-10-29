// The footer on every page (2026-10-12): Nural Pulse, powered by Bitrix24 and Nural. The supplied
// lockup in the colourway for the theme (Nural brand, 2026-10-29), never the name set in type.
export function AppFooter() {
  return (
    <footer className="mx-auto flex max-w-page flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-4 text-table text-text-muted lg:px-6">
      <span className="flex items-center gap-2">
        <img
          src="/brand/pulse-lockup-primary.svg"
          alt="Nural Pulse"
          width={56}
          height={20}
          className="logo-light h-5 w-auto"
        />
        <img
          src="/brand/pulse-lockup-white.svg"
          alt="Nural Pulse"
          width={56}
          height={20}
          className="logo-dark h-5 w-auto"
        />
        <span>the live heartbeat of every project and person</span>
      </span>
      <span>
        Powered by <span className="font-heading font-bold text-primary-dark">Bitrix24</span> and{' '}
        <span className="font-heading font-bold text-primary-dark">Nural</span>
      </span>
    </footer>
  );
}
