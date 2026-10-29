// What each Insights tile counts, as a list of projects or people (2026-10-12): a tile first
// shows who or what is behind its number, with the reason in words, and a row then opens that
// one's tasks. Pure, from the /api/insights response.
import type { Entity, EntityList, Insights, TileKey } from './api';

const pct = (n: number | null) => (n == null ? '-' : `${Math.round(n)} %`);
const byWeight = (a: Entity, b: Entity) => (b.stats[0]?.[1] ?? 0) - (a.stats[0]?.[1] ?? 0);

export function tileEntities(key: TileKey, d: Insights, label: string): EntityList {
  const total = d.tiles[key];
  switch (key) {
    case 'laggingProjects':
      return {
        label,
        kind: 'project',
        total,
        rows: d.projects
          .filter((p) => p.lagging)
          .map((p) => ({
            id: p.id,
            name: p.name,
            reason:
              p.reasons.join('; ') ||
              `${p.overdue} of ${p.open} open overdue (${pct(p.overdueShare * 100)})`,
            stats: [
              ['Overdue', p.overdue],
              ['Open', p.open],
              ['Closed now', p.closedNow],
              ['Closed before', p.closedPrev],
            ],
            ids: p.overdueIds.length ? p.overdueIds : p.openIds,
          })),
      };
    case 'laggingPeople':
      return {
        label,
        kind: 'person',
        total,
        rows: d.people
          .filter((p) => p.lagging)
          .map((p) => ({
            id: p.id,
            name: p.name,
            reason:
              p.reasons.join('; ') ||
              `${p.overdue} of ${p.open} open overdue; ${pct(p.onTime)} on time`,
            stats: [
              ['Overdue', p.overdue],
              ['Open', p.open],
              ['Closed now', p.closedNow],
              ['Closed before', p.closedPrev],
            ],
            ids: [...p.overdueIds, ...p.closedIds],
          })),
      };
    case 'overloaded':
    case 'underloaded': {
      const level = key === 'overloaded' ? 'over' : 'under';
      return {
        label,
        kind: 'person',
        total,
        rows: d.load
          .filter((l) => l.level === level)
          .map((l) => ({
            id: l.id,
            name: l.name,
            reason:
              l.reason ??
              (level === 'over'
                ? `${l.open} open, ${l.dueSoon} due in the next 5 working days`
                : `${l.open} open and ${l.closedNow} closed lately`),
            stats: [
              ['Open', l.open],
              ['Due soon', l.dueSoon],
              ['Overdue', l.overdue],
              ['Projects', l.projects],
            ],
            ids: l.openIds,
          })),
      };
    }
    case 'shared': {
      const openIds = new Map(d.load.map((l) => [l.id, l.openIds]));
      return {
        label,
        kind: 'person',
        total,
        rows: d.overlap.shared
          .map((s) => ({
            id: s.id,
            name: s.name,
            reason: `Open work in ${s.projects.length} projects: ${s.projects
              .map((p) => `${p.name} (${p.open} open${p.overdue ? `, ${p.overdue} overdue` : ''})`)
              .join(', ')}`,
            stats: [
              ['Projects', s.projects.length],
              ['Open', s.projects.reduce((n, p) => n + p.open, 0)],
              ['Overdue', s.projects.reduce((n, p) => n + p.overdue, 0)],
            ] as [string, number][],
            ids: openIds.get(s.id) ?? [],
          }))
          .sort(byWeight),
      };
    }
    case 'atRisk': {
      // Releases at high risk, by project.
      const groups = new Map<string, { ids: number[]; thisWeek: number; reasons: Set<string> }>();
      for (const r of d.releases.filter((x) => x.risk === 'high')) {
        const g = groups.get(r.project) ?? { ids: [], thisWeek: 0, reasons: new Set<string>() };
        g.ids.push(r.id);
        if (r.week === 'this') g.thisWeek++;
        g.reasons.add(r.reason);
        groups.set(r.project, g);
      }
      return {
        label,
        kind: 'project',
        total,
        rows: [...groups]
          .map(([name, g], i) => ({
            id: i,
            name,
            reason: [...g.reasons].slice(0, 3).join('; '),
            stats: [
              ['At high risk', g.ids.length],
              ['Due this week', g.thisWeek],
            ] as [string, number][],
            ids: g.ids,
          }))
          .sort(byWeight),
      };
    }
  }
}
