// DEV-01: one row of summary tiles (Projects first, 2026-10-13, opens its popup). Clicking a tile opens the matching task list. Under the
// number, All splits into Dev and Issues and Issues into Bug and Feedback; each part opens too.
import type { DevPreset, SummaryPart } from '@nural/shared';
import { SortableGroup } from '../../components/layout/SortableGroup';
import { InHandTile } from '../../components/InHandTile';
import { StatTile } from '../../components/StatTile';
import { useDevScope } from '../filters/useFilters';
import { useDevProjects, useDevSummary } from './api';
import { ProjectsDialog } from './ProjectsDialog';
import { useProjectsPopup } from './projectsPopup';
import { useDrillStore, useDrillTo } from './drill';
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
  const shown = useDrillStore((st) => st.drill?.label);
  const split = data?.split;
  const { data: projects } = useDevProjects();
  const pj = projects?.summary;
  const openProjects = useProjectsPopup((st) => st.openPopup);
  return (
    <>
      <SortableGroup
        group="dev.tiles"
        noun="tile"
        className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-[repeat(var(--cols),minmax(0,1fr))]"
        items={[
          {
            id: 'projects',
            node: (
              <StatTile
                label="Projects"
                info={INFO.devProjects}
                value={pj?.projects}
                sub="Active + silent + hold"
                onClick={() => openProjects('all')}
                parts={
                  pj && [
                    { label: 'Active', value: pj.active, onClick: () => openProjects('active') },
                    { label: 'Silent', value: pj.silent, onClick: () => openProjects('silent') },
                    { label: 'Hold', value: pj.hold, onClick: () => openProjects('hold') },
                  ]
                }
              />
            ),
          },
          ...TILES.map(({ preset, sub }) => ({
            id: preset,
            node: (
              <StatTile
                label={
                  preset === 'total' && scope === 'issues' ? 'Total issues' : TILE_LABELS[preset]
                }
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
                note={
                  preset === 'pending' && data?.unassigned.ids.length
                    ? {
                        label: 'Unassigned',
                        value: data.unassigned.count,
                        onClick: () =>
                          drill({
                            label: 'Pending · Unassigned',
                            preset: 'pending',
                            params: { assignee: data.unassigned.ids.join(',') },
                          }),
                      }
                    : undefined
                }
              />
            ),
          })),
          {
            id: 'inHand',
            node: (
              <InHandTile
                counts={data?.inHand}
                info={INFO.inHand}
                active={!!shown?.startsWith('Tasks in hand')}
                onOpen={(w, label) => drill({ label, preset: 'pending', params: { due: w } })}
              />
            ),
          },
        ]}
      />
      <ProjectsDialog />
    </>
  );
}
