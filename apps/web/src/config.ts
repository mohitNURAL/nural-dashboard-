// Browser-safe settings. Only VITE_* variables reach the browser (vite.config.ts).

/** "Today" and date presets use the app time zone, not the viewer's (CLAUDE.md). */
export const APP_TIMEZONE: string =
  (import.meta.env.VITE_APP_TIMEZONE as string | undefined) || 'Asia/Kolkata';
