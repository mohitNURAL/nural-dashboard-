// The workflow as a swimlane diagram (2026-10-12, SRS 22): one lane per department, the stages
// in board order from left to right, solid arrows for the usual forward moves, red dashed arrows
// for QA sending work back (the rework rule) and grey dashed ones for other moves back (e.g. out
// of On Hold). A band under the stages shows what each counts as. Click a stage for its details.
// Drawn from the workflow definition, so it always shows the rules the dashboard counts with.
import { DEPARTMENT_LABEL, DEPARTMENTS, type Workflow } from '@nural/shared';

const COL_W = 140;
const CARD_W = 124;
const CARD_H = 60;
const LANE_H = 92;
const LEFT = 118;
const TOP = 12;

const CATEGORY: Record<string, { label: string; color: string }> = {
  open: { label: 'Open', color: '#00C4FB' },
  hold: { label: 'On hold', color: '#EF3000' },
  completed: { label: 'Completed', color: '#8EC82F' },
};

const ROLE_SHORT: Record<string, string> = {
  start: 'Start',
  working: 'Working',
  qaEntry: 'Closes the task',
  testing: 'Testing',
  issue: 'Issue',
  ready: 'Ready',
  live: 'Live',
};

export function WorkflowDiagram({
  workflow,
  selected,
  onSelect,
}: {
  workflow: Workflow;
  selected?: string | null;
  onSelect?: (title: string) => void;
}) {
  const stages = workflow.stages;
  const lanes = DEPARTMENTS.filter((d) => stages.some((s) => s.department === d));
  const laneOf = (d: string) => lanes.indexOf(d as (typeof lanes)[number]);
  const pos = new Map(
    stages.map((s, i) => [
      s.title,
      {
        x: LEFT + i * COL_W + (COL_W - CARD_W) / 2,
        y: TOP + laneOf(s.department) * LANE_H + (LANE_H - CARD_H) / 2,
        i,
      },
    ]),
  );
  const width = LEFT + stages.length * COL_W + 16;
  const bandY = TOP + lanes.length * LANE_H + 10;
  const height = bandY + 44;
  const rework = (from: string, to: string) =>
    workflow.rework.from.includes(from) && workflow.rework.to.includes(to);

  const arrows = stages.flatMap((s) =>
    s.next
      .filter((n) => pos.has(n))
      .map((n) => {
        const a = pos.get(s.title)!;
        const b = pos.get(n)!;
        const forward = b.i > a.i;
        if (forward) {
          const sx = a.x + CARD_W;
          const sy = a.y + CARD_H / 2;
          const tx = b.x;
          const ty = b.y + CARD_H / 2;
          const dx = Math.max(30, (tx - sx) / 2);
          return {
            key: `${s.title}>${n}`,
            d: `M${sx} ${sy} C${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}`,
            kind: 'forward' as const,
          };
        }
        // Back: under the cards (or over them when the target lane is higher).
        const below = b.y >= a.y;
        const sx = a.x + CARD_W / 2;
        const sy = below ? a.y + CARD_H : a.y;
        const tx = b.x + CARD_W / 2;
        const ty = below ? b.y + CARD_H : b.y;
        const bend = below ? 34 : -34;
        return {
          key: `${s.title}>${n}`,
          d: `M${sx} ${sy} C${sx} ${sy + bend}, ${tx} ${ty + bend}, ${tx} ${ty}`,
          kind: rework(s.title, n) ? ('rework' as const) : ('back' as const),
        };
      }),
  );

  return (
    <div className="overflow-x-auto rounded-card border border-border bg-bg/60 p-2" data-no-focus>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Workflow diagram: stages by department, with the moves between them"
        className="font-body"
      >
        <defs>
          {[
            ['fwd', 'var(--primary)'],
            ['rw', 'var(--bad)'],
            ['bk', 'var(--text-muted)'],
          ].map(([id, c]) => (
            <marker
              key={id}
              id={`wf-${id}`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0 0 L10 5 L0 10 z" fill={c} />
            </marker>
          ))}
        </defs>
        {lanes.map((d, i) => (
          <g key={d}>
            <rect
              x={4}
              y={TOP + i * LANE_H}
              width={width - 8}
              height={LANE_H - 4}
              rx={12}
              fill={
                i % 2 ? 'color-mix(in srgb, var(--primary) 4%, var(--surface))' : 'var(--surface)'
              }
              stroke="color-mix(in srgb, var(--primary) 12%, transparent)"
            />
            <text
              x={18}
              y={TOP + i * LANE_H + LANE_H / 2 + 4}
              fontFamily="Manrope, sans-serif"
              fontWeight={800}
              fontSize={12}
              fill="var(--primary-dark)"
            >
              {DEPARTMENT_LABEL[d]}
            </text>
          </g>
        ))}
        {arrows.map((a) => (
          <path
            key={a.key}
            d={a.d}
            fill="none"
            stroke={
              a.kind === 'forward'
                ? 'var(--primary)'
                : a.kind === 'rework'
                  ? 'var(--bad)'
                  : 'var(--text-muted)'
            }
            strokeWidth={a.kind === 'forward' ? 2 : 1.6}
            strokeDasharray={a.kind === 'forward' ? undefined : '5 4'}
            opacity={a.kind === 'forward' ? 0.8 : a.kind === 'rework' ? 0.75 : 0.35}
            markerEnd={`url(#wf-${a.kind === 'forward' ? 'fwd' : a.kind === 'rework' ? 'rw' : 'bk'})`}
          />
        ))}
        {stages.map((s) => {
          const p = pos.get(s.title)!;
          const on = selected === s.title;
          return (
            <g
              key={s.title}
              transform={`translate(${p.x} ${p.y})`}
              onClick={() => onSelect?.(s.title)}
              style={{ cursor: onSelect ? 'pointer' : undefined }}
              role={onSelect ? 'button' : undefined}
              aria-label={onSelect ? `Stage ${s.title}` : undefined}
            >
              <rect
                width={CARD_W}
                height={CARD_H}
                rx={12}
                fill="var(--surface)"
                stroke={on ? 'var(--accent)' : s.color}
                strokeWidth={on ? 3 : 1.6}
                style={
                  on
                    ? { filter: 'drop-shadow(0 0 8px var(--accent))' }
                    : { filter: 'drop-shadow(0 2px 3px rgba(16,24,64,0.12))' }
                }
              />
              <rect width={6} height={CARD_H} rx={3} fill={s.color} />
              <text
                x={14}
                y={24}
                fontFamily="Manrope, sans-serif"
                fontWeight={800}
                fontSize={12.5}
                fill="var(--primary-dark)"
              >
                {s.title.length > 16 ? `${s.title.slice(0, 15)}…` : s.title}
              </text>
              <text x={14} y={44} fontSize={10.5} fill="var(--text-muted)">
                {s.roles.length
                  ? s.roles.map((r) => ROLE_SHORT[r]).join(' · ')
                  : CATEGORY[s.category]!.label}
              </text>
            </g>
          );
        })}
        {stages.map((s) => {
          const p = pos.get(s.title)!;
          const c = CATEGORY[s.category]!;
          return (
            <g key={`band-${s.title}`} transform={`translate(${LEFT + p.i * COL_W + 4} ${bandY})`}>
              <rect width={COL_W - 8} height={24} rx={8} fill={c.color} opacity={0.16} />
              <text
                x={(COL_W - 8) / 2}
                y={16}
                textAnchor="middle"
                fontSize={10.5}
                fontWeight={700}
                fill={c.color}
              >
                {c.label}
              </text>
            </g>
          );
        })}
        <text
          x={18}
          y={bandY + 16}
          fontFamily="Manrope, sans-serif"
          fontWeight={800}
          fontSize={11}
          fill="var(--text-muted)"
        >
          Counts as
        </text>
      </svg>
      <p className="flex flex-wrap gap-x-5 gap-y-1 px-2 pt-2 text-[11px] text-text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-6 bg-primary" /> usual move
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0 w-6 border-t-2 border-dashed border-bad" /> sent back by QA (rework)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0 w-6 border-t-2 border-dashed border-text-muted" /> other move back
        </span>
      </p>
    </div>
  );
}
