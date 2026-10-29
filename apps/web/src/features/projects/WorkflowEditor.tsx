// Edit the workflow (admins; 2026-10-12, SRS 22). The stages as cards to drag into board order;
// each with its title, department, what it counts as, its roles, colour, description, the board
// column names that mean it, and its usual next stages. Stages can be added and removed; the
// rework rule is set below. Renaming a stage keeps its old name as a column name and follows
// through every arrow, rule and project type. Save shows what changes before anything applies;
// the server checks it again and every open page then counts with it.
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import * as Dialog from '@radix-ui/react-dialog';
import {
  CATEGORY_LABEL,
  DEPARTMENT_LABEL,
  DEPARTMENTS,
  ROLE_LABEL,
  STAGE_ROLES,
  type StageCategory,
  type StageRole,
  type Workflow,
  type WorkflowStage,
} from '@nural/shared';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useState } from 'react';
import { toast } from 'sonner';
import { apiPost } from '../../api/client';
import { API_KEY } from '../../api/queries';
import { confirm } from '../../components/ui/ConfirmDialog';
import { IconChevron, IconClose, IconGrip } from '../../components/ui/icons';
import { Select } from '../../components/ui/Select';
import { finalize, type Item } from './finalize';

const field =
  'h-9 w-full rounded-control border border-border bg-surface px-2.5 text-table text-text outline-none focus:border-primary focus:ring-2 focus:ring-primary/15';

let seq = 0;
const newId = () => `s${++seq}`;

/** What changes, in words, for the confirmation. */
function summary(before: Workflow, after: Workflow): { label: string; value: string }[] {
  const b = new Map(before.stages.map((s) => [s.title, s]));
  const a = new Map(after.stages.map((s) => [s.title, s]));
  const out: { label: string; value: string }[] = [];
  const added = after.stages.filter((s) => !b.has(s.title) && !s.aliases.some((x) => b.has(x)));
  const removed = before.stages.filter(
    (s) => !a.has(s.title) && !after.stages.some((x) => x.aliases.includes(s.title)),
  );
  const renamed = after.stages.filter((s) => !b.has(s.title) && s.aliases.some((x) => b.has(x)));
  if (added.length) out.push({ label: 'Added', value: added.map((s) => s.title).join(', ') });
  if (removed.length) out.push({ label: 'Removed', value: removed.map((s) => s.title).join(', ') });
  for (const s of renamed)
    out.push({ label: 'Renamed', value: `${s.aliases.find((x) => b.has(x))} → ${s.title}` });
  for (const s of after.stages) {
    const old = b.get(s.title) ?? before.stages.find((x) => s.aliases.includes(x.title));
    if (!old) continue;
    if (old.category !== s.category)
      out.push({
        label: 'Counts as',
        value: `${s.title}: ${CATEGORY_LABEL[old.category]} → ${CATEGORY_LABEL[s.category]}`,
      });
    if (old.roles.join() !== s.roles.join())
      out.push({
        label: 'Roles',
        value: `${s.title}: ${s.roles.map((r) => ROLE_LABEL[r].split(':')[0]).join(', ') || 'none'}`,
      });
    if (old.department !== s.department)
      out.push({ label: 'Department', value: `${s.title}: ${DEPARTMENT_LABEL[s.department]}` });
  }
  if (
    before.stages.map((s) => s.title).join() !== after.stages.map((s) => s.title).join() &&
    !added.length &&
    !removed.length
  )
    out.push({ label: 'Order', value: after.stages.map((s) => s.title).join(' › ') });
  return out.length
    ? out
    : [{ label: 'Change', value: 'Descriptions, colours, column names or arrows' }];
}

function Chips({ values, onRemove }: { values: string[]; onRemove: (v: string) => void }) {
  return (
    <span className="flex flex-wrap gap-1">
      {values.map((v) => (
        <span
          key={v}
          className="inline-flex items-center gap-1 rounded-full bg-primary-soft-100 px-2 py-0.5 text-[12px]"
        >
          {v}
          <button
            type="button"
            aria-label={`Remove ${v}`}
            onClick={() => onRemove(v)}
            className="text-text-muted hover:text-bad"
          >
            <IconClose size={10} />
          </button>
        </span>
      ))}
    </span>
  );
}

function StageCard({
  item,
  titles,
  onChange,
  onRemove,
}: {
  item: Item;
  titles: string[];
  onChange: (s: WorkflowStage) => void;
  onRemove: () => void;
}) {
  const sort = useSortable({ id: item.id });
  const [open, setOpen] = useState(!item.orig);
  const [alias, setAlias] = useState('');
  const s = item.stage;
  const set = <K extends keyof WorkflowStage>(k: K, v: WorkflowStage[K]) =>
    onChange({ ...s, [k]: v });
  return (
    <li
      ref={sort.setNodeRef}
      style={{ transform: CSS.Translate.toString(sort.transform), transition: sort.transition }}
      className={clsx(
        'rounded-xl border bg-surface',
        sort.isDragging ? 'z-10 border-accent shadow-pop' : 'border-border',
      )}
    >
      <div className="flex items-center gap-2 px-2 py-2">
        <button
          type="button"
          ref={sort.setActivatorNodeRef}
          {...sort.attributes}
          {...sort.listeners}
          aria-label={`Drag ${s.title}`}
          className="grid h-8 w-6 cursor-grab touch-none place-items-center text-text-muted hover:text-primary"
        >
          <IconGrip size={14} />
        </button>
        <span className="h-6 w-1.5 rounded-full" style={{ background: s.color }} />
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="truncate font-heading text-button text-primary-dark">
            {s.title || 'New stage'}
          </span>
          <span className="truncate text-[12px] text-text-muted">
            {DEPARTMENT_LABEL[s.department]} · {CATEGORY_LABEL[s.category].split(' ')[0]}
            {s.roles.length
              ? ` · ${s.roles.map((r) => ROLE_LABEL[r].split(':')[0]).join(', ')}`
              : ''}
          </span>
          <IconChevron
            size={13}
            className={clsx(
              'ml-auto shrink-0 text-text-muted transition-transform',
              open && 'rotate-90',
            )}
          />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-lg px-2 py-1 text-[12px] font-bold text-bad hover:bg-bad/10"
        >
          Remove
        </button>
      </div>
      {open && (
        <div className="grid gap-2 border-t border-border p-3 sm:grid-cols-2">
          <label className="text-[12px] text-text-muted">
            Title
            <input
              value={s.title}
              onChange={(e) => set('title', e.target.value)}
              className={field}
            />
          </label>
          <label className="text-[12px] text-text-muted">
            Department
            <Select
              size="sm"
              className="w-full"
              value={s.department}
              onChange={(e) => set('department', e.target.value as WorkflowStage['department'])}
            >
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {DEPARTMENT_LABEL[d]}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-[12px] text-text-muted">
            Counts as
            <Select
              size="sm"
              className="w-full"
              value={s.category}
              onChange={(e) => set('category', e.target.value as StageCategory)}
            >
              {(Object.keys(CATEGORY_LABEL) as StageCategory[]).map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-[12px] text-text-muted">
            Colour
            <span className="flex items-center gap-2">
              <input
                type="color"
                value={s.color}
                onChange={(e) => set('color', e.target.value.toUpperCase())}
                className="h-9 w-12 cursor-pointer rounded border border-border"
              />
              <input
                value={s.color}
                onChange={(e) => set('color', e.target.value)}
                className={field}
              />
            </span>
          </label>
          <div className="sm:col-span-2">
            <p className="mb-1 text-[12px] text-text-muted">
              Roles (each role belongs to one stage)
            </p>
            <span className="flex flex-wrap gap-1.5">
              {STAGE_ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  title={ROLE_LABEL[r]}
                  onClick={() =>
                    set(
                      'roles',
                      s.roles.includes(r)
                        ? s.roles.filter((x) => x !== r)
                        : [...s.roles, r as StageRole],
                    )
                  }
                  className={clsx(
                    'rounded-full border px-2.5 py-0.5 text-[12px] transition',
                    s.roles.includes(r)
                      ? 'border-primary bg-primary text-white'
                      : 'border-border text-text-muted hover:border-primary',
                  )}
                >
                  {ROLE_LABEL[r].split(':')[0]}
                </button>
              ))}
            </span>
          </div>
          <label className="text-[12px] text-text-muted sm:col-span-2">
            Description (shown on the diagram and in the guides)
            <textarea
              value={s.description}
              rows={2}
              onChange={(e) => set('description', e.target.value)}
              className={clsx(field, 'h-auto py-1.5')}
            />
          </label>
          <div className="sm:col-span-2">
            <p className="mb-1 text-[12px] text-text-muted">
              Board column names that mean this stage
            </p>
            <Chips
              values={s.aliases}
              onRemove={(v) =>
                set(
                  'aliases',
                  s.aliases.filter((x) => x !== v),
                )
              }
            />
            <span className="mt-1.5 flex gap-2">
              <input
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && alias.trim()) {
                    e.preventDefault();
                    set('aliases', [...new Set([...s.aliases, alias.trim()])]);
                    setAlias('');
                  }
                }}
                placeholder="e.g. Code Review (Enter to add)"
                className={field}
              />
            </span>
          </div>
          <div className="sm:col-span-2">
            <p className="mb-1 text-[12px] text-text-muted">Usual next stages (arrows)</p>
            <span className="flex flex-wrap gap-1.5">
              {titles
                .filter((t) => t !== s.title)
                .map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() =>
                      set(
                        'next',
                        s.next.includes(t) ? s.next.filter((x) => x !== t) : [...s.next, t],
                      )
                    }
                    className={clsx(
                      'rounded-full border px-2.5 py-0.5 text-[12px] transition',
                      s.next.includes(t)
                        ? 'border-accent bg-accent/15 text-accent-dark'
                        : 'border-border text-text-muted hover:border-accent',
                    )}
                  >
                    {t}
                  </button>
                ))}
            </span>
          </div>
        </div>
      )}
    </li>
  );
}

export function WorkflowEditor({ workflow, onClose }: { workflow: Workflow; onClose: () => void }) {
  const qc = useQueryClient();
  const [items, setItems] = useState<Item[]>(() =>
    workflow.stages.map((s) => ({ id: newId(), orig: s.title, stage: structuredClone(s) })),
  );
  const [rework, setRework] = useState(structuredClone(workflow.rework));
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const titles = items.map((i) => i.stage.title);

  const onDrop = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = items.map((i) => i.id);
    setItems(arrayMove(items, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  };
  const add = () =>
    setItems([
      ...items,
      {
        id: newId(),
        orig: null,
        stage: {
          title: '',
          aliases: [],
          category: 'open',
          roles: [],
          department: 'development',
          color: '#5B6CD9',
          description: '',
          next: [],
        },
      },
    ]);

  const save = async () => {
    const next = finalize(workflow, items, rework);
    const ok = await confirm({
      title: 'Save the workflow?',
      message:
        'Every page counts with the new rules at once, for everyone. Earlier versions stay and can be restored.',
      details: summary(workflow, next),
      confirmLabel: 'Save workflow',
      tone: 'warn',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await apiPost('/api/workflow', next, 'PUT');
      toast.success('Workflow saved', { description: 'Every page now counts with it.' });
      void qc.invalidateQueries({ queryKey: [API_KEY] });
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setErrors([msg]);
      toast.error('Not saved', { description: msg });
    } finally {
      setBusy(false);
    }
  };

  const toggle = (side: 'from' | 'to', t: string) =>
    setRework((r) => ({
      ...r,
      [side]: r[side].includes(t) ? r[side].filter((x) => x !== t) : [...r[side], t],
    }));

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed inset-y-4 left-1/2 z-50 flex w-[min(900px,96vw)] -translate-x-1/2 flex-col overflow-hidden rounded-card border border-border bg-surface shadow-pop outline-none">
          <div className="flex items-center gap-3 border-b border-border px-5 py-3">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="font-heading text-h2 text-primary-dark">
                Edit the workflow
              </Dialog.Title>
              <Dialog.Description className="text-table text-text-muted">
                Drag ⠿ to order the stages. Changes apply to every page once saved.
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-lg text-text-muted hover:bg-primary-soft-100"
            >
              <IconClose size={16} />
            </Dialog.Close>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {errors.length > 0 && (
              <div className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-table text-bad">
                {errors.map((e) => (
                  <p key={e}>{e}</p>
                ))}
              </div>
            )}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDrop}>
              <SortableContext
                items={items.map((i) => i.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul className="space-y-1.5">
                  {items.map((it) => (
                    <StageCard
                      key={it.id}
                      item={it}
                      titles={titles}
                      onChange={(stage) =>
                        setItems(items.map((x) => (x.id === it.id ? { ...x, stage } : x)))
                      }
                      onRemove={() => setItems(items.filter((x) => x.id !== it.id))}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
            <button
              type="button"
              onClick={add}
              className="w-full rounded-xl border-2 border-dashed border-primary/40 py-2 font-heading text-button text-primary hover:bg-primary-soft-100"
            >
              + Add a stage
            </button>
            <section className="rounded-xl border border-bad/30 bg-bad/5 p-3">
              <p className="font-heading text-h3 text-primary-dark">Rework rule</p>
              <p className="mb-2 text-table text-text-muted">
                A move from one of the first stages back to one of the second counts as QA sending
                work back.
              </p>
              {(['from', 'to'] as const).map((side) => (
                <div key={side} className="mb-2">
                  <p className="mb-1 text-[12px] text-text-muted">
                    {side === 'from' ? 'From' : 'Back to'}
                  </p>
                  <span className="flex flex-wrap gap-1.5">
                    {titles.filter(Boolean).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => toggle(side, t)}
                        className={clsx(
                          'rounded-full border px-2.5 py-0.5 text-[12px]',
                          rework[side].includes(t)
                            ? 'border-bad bg-bad/15 text-bad'
                            : 'border-border text-text-muted hover:border-bad',
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </span>
                </div>
              ))}
            </section>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
            <span className="text-table text-text-muted">{items.length} stages</span>
            <span className="flex gap-2">
              <Dialog.Close className="btn btn-stroke h-10 px-4">Cancel</Dialog.Close>
              <button
                type="button"
                disabled={busy}
                onClick={() => void save()}
                className="btn btn-page h-10 px-4 disabled:opacity-50"
              >
                {busy ? 'Saving…' : 'Save workflow'}
              </button>
            </span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
