// DEV-01: one row of 7 summary tiles. Clicking a tile opens the matching task list. Under the
// number, All splits into Dev and Issues and Issues into Bug and Feedback; each part opens too.
import type { DevPreset, SummaryPart } from '@nural/shared';
import { StatTile } from '../../components/StatTile';
import { useDevScope } from '../filters/useFilters';
import { useDevSummary } from './api';
import { useDrillTo } from './drill';
import { splitLine, TILE_LABELS } from './format';
import { INFO } from '../info';

const TILES: { preset: DevPreset; sub?: string }[] = [
  { preset: 'total' },
  { preset: 'pending', sub: 'Behind QA Backlog, not on hold' },
  { preset: 'hold', sub: 'In On Hold' },
  { preset: 'ready', sub: 'In Done' },
  { preset: 'deployed', sub: 'In LIVE' },
  { preset: 'overdue', sub: 'Pending, past deadline' },
  { preset: 'doneToday', sub: 'Moved to QA Backlog today' },
];

type Count = Exclude<keyof SummaryPart, 'key'>;

/** How each part is named and which /api/tasks params narrow a list to it. */
const PART: Record<SummaryPart['key'], { label: string; params: Record<string, string> }> = {
  dev: { label: 'Dev', params: { scope: 'dev' } },
  issues: { label: 'Issues', params: { scope: 'issues' } },
  bug: { label: 'Bug', params: { type: 'bug' } },
  feedback: { label: 'Feedback', params: { type: 'feedback' } },
};

interface Props {
  active: DevPreset | null;
  onSelect: (preset: DevPreset) => void;
}

export function SummaryTiles({ active, onSelect }: Props) {
  const { data } = useDevSummary();
  const [scope] = useDevScope();
  const drill = useDrillTo();
  const split = data?.split;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
      {TILES.map(({ preset, sub }) => (
        <StatTile
          key={preset}
          label={preset === 'total' && scope === 'issues' ? 'Total issues' : TILE_LABELS[preset]}
          info={INFO[preset as keyof typeof INFO]}
          value={data?.[preset as keyof typeof data] as number | undefined}
          sub={preset === 'total' && split?.items.length ? splitLine(split.items) : sub}
          tone={preset === 'overdue' ? 'bad' : undefined}
          active={active === preset}
          onClick={() => onSelect(preset)}
          parts={data?.parts.map((p) => ({
            label: PART[p.key].label,
            value: p[preset as Count],
            onClick: () =>
              drill({
                label: `${TILE_LABELS[preset]} · ${PART[p.key].label}`,
                preset,
                params: PART[p.key].params,
              }),
          }))}
        />
      ))}
    </div>
  );
}
