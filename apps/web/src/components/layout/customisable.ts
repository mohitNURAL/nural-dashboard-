// The tile and card groups on screen and their hidden data points (Customise panel, dock).
import { usePrefs } from '../../api/prefs';
import { hiddenKey, useLayoutRegistry } from './registry';

/** The tile and card groups on screen, and how many of their data points are hidden. */
export function useCustomisable() {
  const groups = useLayoutRegistry((s) => s.groups);
  const { data: prefs } = usePrefs();
  const list = Object.entries(groups).filter(([, g]) => g.noun !== 'section');
  const hiddenOf = (group: string) => new Set(prefs?.layout[hiddenKey(group)] ?? []);
  const hiddenCount = list.reduce(
    (n, [group, g]) => n + g.ids.filter((id) => hiddenOf(group).has(id)).length,
    0,
  );
  return { list, hiddenOf, hiddenCount, ready: !!prefs && list.length > 0 };
}
