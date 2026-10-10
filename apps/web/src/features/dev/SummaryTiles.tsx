// DEV-01: one row of 7 summary tiles. Clicking a tile opens the matching task list.
import type { DevPreset } from '@nural/shared';
import { StatTile } from '../../components/StatTile';
import { useDevSummary } from './api';
import { splitLine, TILE_LABELS } from './format';

const TILES: { preset: DevPreset; sub?: string }[] = [
  { preset: 'total' },
  { preset: 'completed', sub: 'QA Backlog to LIVE' },
  { preset: 'pending', sub: 'To do to Pending for QA' },
  { preset: 'ready', sub: 'In Done' },
  { preset: 'deployed', sub: 'In LIVE' },
  { preset: 'overdue', sub: 'Pending, past deadline' },
  { preset: 'doneToday', sub: 'Moved to QA Backlog today' },
];

interface Props {
  active: DevPreset | null;
  onSelect: (preset: DevPreset) => void;
}

export function SummaryTiles({ active, onSelect }: Props) {
  const { data } = useDevSummary();
  const split = data?.split;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
      {TILES.map(({ preset, sub }) => (
        <StatTile
          key={preset}
          label={TILE_LABELS[preset]}
          value={data?.[preset as keyof typeof data] as number | undefined}
          sub={preset === 'total' && split?.items.length ? splitLine(split.items) : sub}
          tone={preset === 'overdue' ? 'bad' : undefined}
          active={active === preset}
          onClick={() => onSelect(preset)}
        />
      ))}
    </div>
  );
}
