// Customise (2026-10-11): a floating button at the bottom left opens a panel to choose which tiles
// and cards this tab shows. Hidden ones leave no gap: tiles spread over the row and cards fill
// their rows. Task-list sections cannot be hidden. Saved per person (user_prefs.layout).
import * as Popover from '@radix-ui/react-popover';
import clsx from 'clsx';
import { usePrefs, useSavePrefs } from '../../api/prefs';
import { pointLabel } from '../../features/tour/labels';
import { hiddenKey, useLayoutRegistry } from './registry';

const NOUN_TITLE = { tile: 'Tiles', card: 'Cards' } as const;

export function CustomiseView() {
  const groups = useLayoutRegistry((s) => s.groups);
  const { data: prefs } = usePrefs();
  const save = useSavePrefs();
  const list = Object.entries(groups).filter(([, g]) => g.noun !== 'section');
  if (!list.length || !prefs) return null;

  const hiddenOf = (group: string) => new Set(prefs.layout[hiddenKey(group)] ?? []);
  const hiddenCount = list.reduce(
    (n, [group, g]) => n + g.ids.filter((id) => hiddenOf(group).has(id)).length,
    0,
  );
  const toggle = (group: string, id: string, show: boolean) =>
    save((p) => {
      const cur = new Set(p.layout[hiddenKey(group)] ?? []);
      if (show) cur.delete(id);
      else cur.add(id);
      return { layout: { ...p.layout, [hiddenKey(group)]: [...cur] } };
    });
  const showAll = () =>
    save((p) => ({
      layout: {
        ...p.layout,
        ...Object.fromEntries(list.map(([group]) => [hiddenKey(group), []])),
      },
    }));

  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label="Customise this tab: choose the tiles and cards to show"
        title="Customise: choose the tiles and cards to show"
        data-tour="customise"
        className="fixed bottom-5 left-5 z-40 flex h-12 items-center gap-2 rounded-full bg-gradient-to-br from-primary to-accent pl-3.5 pr-4 font-heading text-button text-white shadow-pop ring-4 ring-primary/15 transition hover:-translate-y-0.5 hover:brightness-110"
      >
        <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden>
          {[5, 10, 15].map((y, i) => (
            <g key={y}>
              <path
                d={`M3 ${y}h14`}
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
              <circle
                cx={[7, 13, 9][i]}
                cy={y}
                r="2.2"
                fill="var(--primary)"
                stroke="currentColor"
                strokeWidth="1.6"
              />
            </g>
          ))}
        </svg>
        Customise
        {hiddenCount > 0 && (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-white px-1 text-label font-bold text-primary">
            {hiddenCount}
          </span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={10}
          className="z-50 max-h-[70vh] w-80 overflow-auto rounded-card border border-border bg-surface text-text shadow-pop"
        >
          <div className="border-b border-border p-4">
            <p className="font-heading text-h3 text-primary-dark">Customise this tab</p>
            <p className="text-table text-text-muted">
              Choose the data points to show. The rest closes up; bring any back here.
            </p>
          </div>
          {list.map(([group, g]) => {
            const hidden = hiddenOf(group);
            const shown = g.ids.filter((id) => !hidden.has(id)).length;
            return (
              <fieldset key={group} className="border-b border-border p-4">
                <legend className="sr-only">{NOUN_TITLE[g.noun as 'tile' | 'card']}</legend>
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-heading text-label uppercase text-text-muted">
                    {NOUN_TITLE[g.noun as 'tile' | 'card']}
                  </span>
                  <span className="text-table text-text-muted">
                    {shown} of {g.ids.length} shown
                  </span>
                </div>
                <div className="space-y-1">
                  {g.ids.map((id) => {
                    const on = !hidden.has(id);
                    return (
                      <label
                        key={id}
                        className={clsx(
                          'flex cursor-pointer items-center gap-2.5 rounded-control px-2 py-1.5 hover:bg-primary-soft-100',
                          !on && 'text-text-muted',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={(e) => toggle(group, id, e.target.checked)}
                          className="h-4 w-4 accent-[var(--primary)]"
                        />
                        {pointLabel(group, id)}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}
          <div className="flex justify-end p-3">
            <button
              type="button"
              onClick={showAll}
              disabled={!hiddenCount}
              className="rounded-control border border-border px-3 py-1.5 font-heading text-button text-primary hover:border-primary disabled:opacity-40"
            >
              Show all
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
