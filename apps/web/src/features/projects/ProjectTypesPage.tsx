// Projects › Project types (2026-10-12, SRS 22): every project grouped by its Kanban board.
// Most follow the full development flow; support desks, DevOps and personal projects use short
// boards (New › In progress › Finished), others skip the release or code stages. Each project
// shows its own columns and the stage each counts as; columns the workflow does not know are
// marked. Everyone can view; admins edit the types, set a project's type by hand and map an
// unknown column to a stage (it becomes one of that stage's column names, for every project).
import * as Dialog from '@radix-ui/react-dialog';
import { STAGE_COLORS, type ProjectType, type Workflow } from '@nural/shared';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { apiPost } from '../../api/client';
import { useMe } from '../../api/me';
import { API_KEY } from '../../api/queries';
import { Card } from '../../components/Card';
import { SortableGroup } from '../../components/layout/SortableGroup';
import { StatTile } from '../../components/StatTile';
import { confirm } from '../../components/ui/ConfirmDialog';
import { IconClose, IconLayers } from '../../components/ui/icons';
import { PageHead } from '../../components/ui/PageHead';
import { SearchInput } from '../../components/ui/SearchInput';
import { Select } from '../../components/ui/Select';
import { useProjectBoards, useWorkflowInfo, type ProjectBoard } from './api';

async function saveWorkflow(wf: Workflow) {
  await apiPost('/api/workflow', wf, 'PUT');
}

export function ProjectTypesPage() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const admin = !!me?.admin;
  const { data: info } = useWorkflowInfo();
  const { data, isLoading } = useProjectBoards();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(false);
  const wf = info?.workflow;
  const projects = useMemo(
    () =>
      (data?.projects ?? []).filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase())),
    [data, q],
  );
  const typeOf = (key: string | null) => wf?.projectTypes.find((t) => t.key === key);
  const refresh = () => void qc.invalidateQueries({ queryKey: [API_KEY] });

  const setType = async (p: ProjectBoard, key: string) => {
    if (!wf) return;
    const next = structuredClone(wf);
    if (key) next.projectOverrides[String(p.id)] = key;
    else delete next.projectOverrides[String(p.id)];
    try {
      await saveWorkflow(next);
      toast.success(`${p.name}: ${key ? typeOf(key)?.name : 'type from its board'}`);
      refresh();
    } catch (e) {
      toast.error('Not saved', { description: e instanceof Error ? e.message : '' });
    }
  };

  const mapColumn = async (column: string, stage: string) => {
    if (!wf || !stage) return;
    const ok = await confirm({
      title: `Count "${column}" as ${stage}?`,
      message:
        'It becomes one of the column names of that stage, for every project. Every page counts with it at once.',
      confirmLabel: 'Map column',
      tone: 'warn',
    });
    if (!ok) return;
    const next = structuredClone(wf);
    const s = next.stages.find((x) => x.title === stage)!;
    s.aliases = [...new Set([...s.aliases, column])];
    try {
      await saveWorkflow(next);
      toast.success(`"${column}" now counts as ${stage}`);
      refresh();
    } catch (e) {
      toast.error('Not saved', { description: e instanceof Error ? e.message : '' });
    }
  };

  const groups = (wf?.projectTypes ?? []).map((t) => ({
    t,
    list: projects.filter((p) => p.type === t.key),
  }));
  const untyped = projects.filter((p) => !p.type);

  return (
    <div className="space-y-4">
      <PageHead
        title="Project types"
        sub="Projects by their Kanban stages: the full development flow, and the ones that differ"
        icon={<IconLayers size={24} />}
      >
        <SearchInput value={q} onChange={setQ} placeholder="Find a project" className="w-64" />
        {admin && wf && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            data-tour="projecttypes-edit"
            className="btn btn-page h-10 px-4"
          >
            Edit types
          </button>
        )}
      </PageHead>

      <SortableGroup
        group="projecttypes.tiles"
        noun="tile"
        className="grid grid-cols-2 gap-3 lg:grid-cols-[repeat(var(--cols),minmax(0,1fr))]"
        items={[
          {
            id: 'projects',
            node: (
              <StatTile
                label="Projects"
                info="Projects (Bitrix24 workgroups) with a board."
                value={data?.projects.length}
                sub="With a Kanban board"
              />
            ),
          },
          {
            id: 'full',
            node: (
              <StatTile
                label="Full development"
                info="Projects following the development flow up to LIVE."
                value={data?.projects.filter((p) => p.type === 'release').length}
                sub="Up to LIVE"
              />
            ),
          },
          {
            id: 'differ',
            node: (
              <StatTile
                label="Different stages"
                info="Projects whose boards differ from the full development flow: support, individual, QA-only and others."
                value={data?.projects.filter((p) => p.type !== 'release').length}
                sub="Support, individual and others"
              />
            ),
          },
          {
            id: 'unmapped',
            node: (
              <StatTile
                label="Unknown columns"
                info="Projects with board columns the workflow does not know: their tasks there count in no stage until mapped."
                value={data?.projects.filter((p) => p.unmapped.length).length}
                sub="Projects to check"
                tone={data?.projects.some((p) => p.unmapped.length) ? 'bad' : undefined}
              />
            ),
          },
        ]}
      />

      <SortableGroup
        group="projecttypes.cards"
        noun="card"
        className="grid grid-cols-1 gap-4 xl:grid-cols-12"
        items={[
          ...groups.map(({ t, list }) => ({
            id: `type-${t.key}`,
            className: 'xl:col-span-12',
            node: (
              <Card
                title={`${t.name} · ${list.length}`}
                info={t.description}
                loading={isLoading}
                empty={!isLoading && !list.length}
                emptyText="No project of this type."
              >
                <p className="mb-3 flex flex-wrap items-center gap-2 text-table text-text-muted">
                  <span className="h-3 w-3 rounded-full" style={{ background: t.color }} />
                  {t.description}
                  {t.requires.length > 0 && <span>· has {t.requires.join(', ')}</span>}
                  {t.forbids.length > 0 && <span>· without {t.forbids.join(', ')}</span>}
                </p>
                <ul className="grid gap-2 lg:grid-cols-2">
                  {list.map((p) => (
                    <ProjectRow
                      key={p.id}
                      p={p}
                      wf={wf!}
                      admin={admin}
                      onType={setType}
                      onMap={mapColumn}
                    />
                  ))}
                </ul>
              </Card>
            ),
          })),
          ...(untyped.length
            ? [
                {
                  id: 'untyped',
                  className: 'xl:col-span-12',
                  node: (
                    <Card
                      title={`No type · ${untyped.length}`}
                      info="Boards that match no type rule."
                    >
                      <ul className="grid gap-2 lg:grid-cols-2">
                        {untyped.map((p) => (
                          <ProjectRow
                            key={p.id}
                            p={p}
                            wf={wf!}
                            admin={admin}
                            onType={setType}
                            onMap={mapColumn}
                          />
                        ))}
                      </ul>
                    </Card>
                  ),
                },
              ]
            : []),
        ]}
      />
      {editing && wf && <TypesEditor wf={wf} onClose={() => setEditing(false)} onSaved={refresh} />}
    </div>
  );
}

function ProjectRow({
  p,
  wf,
  admin,
  onType,
  onMap,
}: {
  p: ProjectBoard;
  wf: Workflow;
  admin: boolean;
  onType: (p: ProjectBoard, key: string) => void;
  onMap: (column: string, stage: string) => void;
}) {
  return (
    <li className="rounded-xl border border-border bg-bg/40 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-heading text-button text-primary-dark">{p.name}</span>
        <span className="text-[12px] text-text-muted">{p.tasks} tasks</span>
        {p.overridden && (
          <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[12px] font-bold text-warn">
            set by hand
          </span>
        )}
        {admin && (
          <Select
            size="sm"
            className="ml-auto"
            aria-label={`Type of ${p.name}`}
            value={p.overridden ? (p.type ?? '') : ''}
            onChange={(e) => onType(p, e.target.value)}
          >
            <option value="">Type from its board</option>
            {wf.projectTypes.map((t) => (
              <option key={t.key} value={t.key}>
                {t.name}
              </option>
            ))}
          </Select>
        )}
      </div>
      <p className="mt-1.5 flex flex-wrap items-center gap-1">
        {p.columns.map((c, i) => {
          const unknown = p.unmapped.includes(c.title);
          return (
            <span key={`${c.title}-${i}`} className="inline-flex items-center gap-1">
              {i > 0 && <span className="text-text-muted">›</span>}
              <span
                title={unknown ? 'Not in the workflow: counts in no stage' : `Counts as ${c.stage}`}
                className={clsx(
                  'rounded-full px-2 py-0.5 text-[11.5px] font-bold',
                  unknown && 'ring-2 ring-bad',
                )}
                style={
                  unknown
                    ? { color: 'var(--bad)' }
                    : {
                        background: `${STAGE_COLORS[c.stage ?? ''] ?? '#999999'}26`,
                        color: STAGE_COLORS[c.stage ?? ''] ?? 'var(--text)',
                      }
                }
              >
                {c.title}
                {!unknown && c.stage && c.stage !== c.title && (
                  <span className="font-normal opacity-70"> = {c.stage}</span>
                )}
              </span>
              {unknown && admin && (
                <Select
                  size="sm"
                  aria-label={`Map ${c.title}`}
                  value=""
                  onChange={(e) => onMap(c.title, e.target.value)}
                >
                  <option value="">Map to…</option>
                  {wf.stages.map((s) => (
                    <option key={s.title} value={s.title}>
                      {s.title}
                    </option>
                  ))}
                </Select>
              )}
            </span>
          );
        })}
      </p>
    </li>
  );
}

function StagePicker({
  label,
  value,
  stages,
  onChange,
}: {
  label: string;
  value: string[];
  stages: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-[12px] text-text-muted">{label}</p>
      <span className="flex flex-wrap gap-1">
        {stages.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() =>
              onChange(value.includes(s) ? value.filter((x) => x !== s) : [...value, s])
            }
            className={clsx(
              'rounded-full border px-2 py-0.5 text-[11.5px]',
              value.includes(s)
                ? 'border-primary bg-primary text-white'
                : 'border-border text-text-muted hover:border-primary',
            )}
          >
            {s}
          </button>
        ))}
      </span>
    </div>
  );
}

function TypesEditor({
  wf,
  onClose,
  onSaved,
}: {
  wf: Workflow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [types, setTypes] = useState<ProjectType[]>(() => structuredClone(wf.projectTypes));
  const [busy, setBusy] = useState(false);
  const stages = wf.stages.map((s) => s.title);
  const set = (i: number, t: ProjectType) => setTypes(types.map((x, j) => (j === i ? t : x)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= types.length) return;
    const next = [...types];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setTypes(next);
  };
  const save = async () => {
    setBusy(true);
    try {
      const keys = new Set(types.map((t) => t.key));
      const overrides = Object.fromEntries(
        Object.entries(wf.projectOverrides).filter(([, k]) => keys.has(k)),
      );
      await saveWorkflow({ ...wf, projectTypes: types, projectOverrides: overrides });
      toast.success('Project types saved');
      onSaved();
      onClose();
    } catch (e) {
      toast.error('Not saved', { description: e instanceof Error ? e.message : '' });
    } finally {
      setBusy(false);
    }
  };
  const field =
    'h-9 w-full rounded-control border border-border bg-surface px-2.5 text-table outline-none focus:border-primary';
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 overlay" />
        <Dialog.Content className="fixed inset-y-4 left-1/2 z-50 flex w-[min(820px,96vw)] -translate-x-1/2 flex-col overflow-hidden rounded-card border border-border bg-surface shadow-pop outline-none">
          <div className="flex items-center gap-3 border-b border-border px-5 py-3">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="font-heading text-h2 text-primary-dark">
                Edit project types
              </Dialog.Title>
              <Dialog.Description className="text-table text-text-muted">
                Checked from the top: a project gets the first type whose rule its board meets.
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-lg text-text-muted hover:bg-primary-soft-100"
            >
              <IconClose size={16} />
            </Dialog.Close>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto px-5 py-4">
            {types.map((t, i) => (
              <section key={i} className="rounded-xl border border-border p-3">
                <div className="mb-2 flex items-center gap-2">
                  <input
                    type="color"
                    value={t.color}
                    onChange={(e) => set(i, { ...t, color: e.target.value.toUpperCase() })}
                    className="h-9 w-10 cursor-pointer rounded border border-border"
                    aria-label="Colour"
                  />
                  <input
                    value={t.name}
                    onChange={(e) => set(i, { ...t, name: e.target.value })}
                    className={field}
                    aria-label="Name"
                  />
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    className="rounded-lg px-2 text-text-muted hover:text-primary"
                    aria-label="Up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    className="rounded-lg px-2 text-text-muted hover:text-primary"
                    aria-label="Down"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => setTypes(types.filter((_, j) => j !== i))}
                    className="rounded-lg px-2 text-[12px] font-bold text-bad hover:bg-bad/10"
                  >
                    Remove
                  </button>
                </div>
                <textarea
                  value={t.description}
                  rows={2}
                  onChange={(e) => set(i, { ...t, description: e.target.value })}
                  className={clsx(field, 'mb-2 h-auto py-1.5')}
                  aria-label="Description"
                />
                <StagePicker
                  label="The board has all of these"
                  value={t.requires}
                  stages={stages}
                  onChange={(v) => set(i, { ...t, requires: v })}
                />
                <div className="h-2" />
                <StagePicker
                  label="…and none of these"
                  value={t.forbids}
                  stages={stages}
                  onChange={(v) => set(i, { ...t, forbids: v })}
                />
              </section>
            ))}
            <button
              type="button"
              onClick={() =>
                setTypes([
                  ...types,
                  {
                    key: `type${Date.now().toString(36)}`,
                    name: 'New type',
                    description: '',
                    color: '#5B6CD9',
                    requires: [],
                    forbids: [],
                  },
                ])
              }
              className="w-full rounded-xl border-2 border-dashed border-primary/40 py-2 font-heading text-button text-primary hover:bg-primary-soft-100"
            >
              + Add a type
            </button>
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
            <Dialog.Close className="btn btn-stroke h-10 px-4">Cancel</Dialog.Close>
            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className="btn btn-page h-10 px-4 disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save types'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
