// Customise (2026-10-11): the panel behind the dock's Customise icon, to choose which tiles and
// cards this tab shows. Hidden ones leave no gap: tiles spread over the row and cards fill their
// rows. Task-list sections cannot be hidden. Saved per person (user_prefs.layout).
import clsx from 'clsx';
import { useSavePrefs } from '../../api/prefs';
import { pointLabel } from '../../features/tour/labels';
import { useCustomisable } from './customisable';
import { hiddenKey } from './registry';

const NOUN_TITLE = { tile: 'Tiles', card: 'Cards' } as const;

export function CustomisePanel() {
  const { list, hiddenOf, hiddenCount } = useCustomisable();
  const save = useSavePrefs();
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
    <>
      <div className="border-b border-border p-4">
        <p className="font-heading text-h3 text-primary-dark">Customise this tab</p>
        <p className="text-table text-text-muted">
          Choose the data points to show. The rest closes up; bring any back here.
        </p>
      </div>
      {list.map(([group, g]) => {
        const hidden = hiddenOf(group);
        const shown = g.ids.filter((id) => !hidden.has(id)).length;
        const title = NOUN_TITLE[g.noun as 'tile' | 'card'];
        return (
          <fieldset key={group} className="border-b border-border p-4">
            <legend className="sr-only">{title}</legend>
            <div className="mb-2 flex items-center justify-between">
              <span className="font-heading text-label uppercase text-text-muted">{title}</span>
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
    </>
  );
}
