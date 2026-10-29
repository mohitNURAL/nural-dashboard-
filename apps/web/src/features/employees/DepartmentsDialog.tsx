// Manage departments (People directory, admins; SRS 17): add a department, rename one, move it
// under another, or change its head. Sent to Bitrix24 with the admin's own sign-in after a
// confirmation; the directory is synced from Bitrix24 right after.
import * as Dialog from '@radix-ui/react-dialog';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { apiPost } from '../../api/client';
import { API_KEY } from '../../api/queries';
import { confirm } from '../../components/ui/ConfirmDialog';
import { IconClose, IconTree } from '../../components/ui/icons';
import { useEmployees, useOrgTree, type DeptNode } from './api';
import { Select } from '../../components/ui/Select';

const field =
  'h-9 w-full rounded-control border border-border bg-surface px-2.5 text-table text-text focus:border-primary focus:outline-none';

/** Departments in tree order with an indent, for the parent pickers. */
function useTreeOptions(exclude?: number) {
  const { data } = useOrgTree();
  return useMemo(() => {
    const all = data?.departments ?? [];
    const out: { id: number; label: string }[] = [];
    const walk = (p: number | null, depth: number) => {
      for (const d of all
        .filter((x) => x.parentId === p)
        .sort((a, b) => a.name.localeCompare(b.name))) {
        if (d.id === exclude) continue; // not under itself (nor its sub-departments)
        out.push({ id: d.id, label: `${'- '.repeat(depth)}${d.name}` });
        walk(d.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }, [data, exclude]);
}

/** Add a department (inline in the person editor, and in the dialog). `onDone` gets its new ID. */
export function DepartmentForm({ onDone }: { onDone: (id: number | null) => void }) {
  const qc = useQueryClient();
  const parents = useTreeOptions();
  const { data: people } = useEmployees();
  const [name, setName] = useState('');
  const [parent, setParent] = useState('');
  const [head, setHead] = useState('');
  const [busy, setBusy] = useState(false);
  const add = async () => {
    if (name.trim().length < 2 || !parent)
      return toast.error('Give a name and a parent department');
    const ok = await confirm({
      title: `Add "${name.trim()}" to Bitrix24?`,
      message: 'A new department is created in Bitrix24, in your name.',
      details: [
        {
          label: 'Under',
          value:
            parents.find((p) => String(p.id) === parent)?.label.replace(/^(- )+/, '') ?? parent,
        },
        ...(head
          ? [
              {
                label: 'Head',
                value: people?.rows.find((p) => String(p.id) === head)?.name ?? head,
              },
            ]
          : []),
      ],
      confirmLabel: 'Add department',
      tone: 'warn',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await apiPost<{ id: number | null }>('/api/departments', {
        name: name.trim(),
        parentId: Number(parent),
        headId: head ? Number(head) : null,
      });
      toast.success(`${name.trim()} added in Bitrix24`);
      void qc.invalidateQueries({ queryKey: [API_KEY] });
      setName('');
      onDone(typeof r.id === 'number' ? r.id : null);
    } catch (e) {
      toast.error('Not added', { description: e instanceof Error ? e.message : '' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New department name"
        className={`${field} sm:col-span-2`}
      />
      <Select
        className="w-full"
        size="sm"
        value={parent}
        onChange={(e) => setParent(e.target.value)}

        aria-label="Parent department"
      >
        <option value="">Under…</option>
        {parents.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </Select>
      <Select
        className="w-full"
        size="sm"
        value={head}
        onChange={(e) => setHead(e.target.value)}

        aria-label="Head"
      >
        <option value="">Head (optional)</option>
        {(people?.rows ?? [])
          .filter((p) => p.active)
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
      </Select>
      <button
        type="button"
        disabled={busy}
        onClick={() => void add()}
        className="btn btn-page h-9 disabled:opacity-50 sm:col-span-2"
      >
        {busy ? 'Adding…' : 'Add department'}
      </button>
    </div>
  );
}

function DeptRow({ d, depth }: { d: DeptNode; depth: number }) {
  const qc = useQueryClient();
  const parents = useTreeOptions(d.id);
  const { data: people } = useEmployees();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(d.name);
  const [parent, setParent] = useState(d.parentId ? String(d.parentId) : '');
  const [head, setHead] = useState(d.head ? String(d.head.id) : '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const change: Record<string, unknown> = {};
    const details: { label: string; value: string }[] = [];
    if (name.trim() !== d.name) {
      change.name = name.trim();
      details.push({ label: 'Name', value: `${d.name} → ${name.trim()}` });
    }
    if (parent && Number(parent) !== d.parentId) {
      change.parentId = Number(parent);
      details.push({
        label: 'Under',
        value: parents.find((p) => String(p.id) === parent)?.label.replace(/^(- )+/, '') ?? parent,
      });
    }
    const headNow = d.head ? String(d.head.id) : '';
    if (head !== headNow) {
      change.headId = head ? Number(head) : null;
      details.push({
        label: 'Head',
        value: `${d.head?.name ?? '-'} → ${people?.rows.find((p) => String(p.id) === head)?.name ?? '-'}`,
      });
    }
    if (!details.length) return setEditing(false);
    const ok = await confirm({
      title: `Change ${d.name} in Bitrix24?`,
      message: 'The department changes in Bitrix24, in your name.',
      details,
      confirmLabel: 'Save in Bitrix24',
      tone: 'warn',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await apiPost(`/api/departments/${d.id}`, change, 'PUT');
      toast.success(`${name.trim()} saved in Bitrix24`);
      void qc.invalidateQueries({ queryKey: [API_KEY] });
      setEditing(false);
    } catch (e) {
      toast.error('Not saved', { description: e instanceof Error ? e.message : '' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <li
      className="rounded-xl border border-border bg-surface"
      style={{ marginLeft: Math.min(depth, 6) * 16 }}
    >
      <div className="flex items-center gap-3 px-3 py-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-heading text-button text-primary-dark">
            {d.name}
          </span>
          <span className="block truncate text-[12px] text-text-muted">
            {d.members.length} people{d.head ? ` · head ${d.head.name}` : ''}
          </span>
        </span>
        <button
          type="button"
          onClick={() => setEditing(!editing)}
          className="btn btn-stroke px-2.5 py-1"
        >
          {editing ? 'Close' : 'Edit'}
        </button>
      </div>
      {editing && (
        <div className="grid gap-2 border-t border-border px-3 py-3 sm:grid-cols-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={field}
            aria-label="Name"
          />
          <Select
            className="w-full"
            size="sm"
            value={parent}
            onChange={(e) => setParent(e.target.value)}

            aria-label="Parent"
          >
            <option value="">{d.parentId ? 'Under…' : 'Top level'}</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
          <Select
            className="w-full"
            size="sm"
            value={head}
            onChange={(e) => setHead(e.target.value)}

            aria-label="Head"
          >
            <option value="">No head</option>
            {(people?.rows ?? [])
              .filter((p) => p.active)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </Select>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="btn btn-page h-9 disabled:opacity-50 sm:col-span-3"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </li>
  );
}

export function DepartmentsDialog({ onClose }: { onClose: () => void }) {
  const { data } = useOrgTree();
  const rows = useMemo(() => {
    const all = data?.departments ?? [];
    const out: { d: DeptNode; depth: number }[] = [];
    const walk = (p: number | null, depth: number) => {
      for (const d of all
        .filter((x) => x.parentId === p)
        .sort((a, b) => a.name.localeCompare(b.name))) {
        out.push({ d, depth });
        walk(d.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }, [data]);
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 overlay" />
        <Dialog.Content className="fixed inset-y-4 left-1/2 z-50 flex w-[min(760px,94vw)] -translate-x-1/2 flex-col overflow-hidden rounded-card border border-border bg-surface shadow-pop outline-none">
          <div className="flex items-center gap-3 border-b border-border px-5 py-4">
            <span className="grid h-10 w-10 place-items-center text-primary">
              <IconTree size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="font-heading text-h2 text-primary-dark">
                Departments
              </Dialog.Title>
              <Dialog.Description className="text-table text-text-muted">
                Changes are made in Bitrix24, in your name, and show here within seconds.
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
            <section className="rounded-card border border-accent/40 bg-accent/5 p-3">
              <p className="mb-2 font-heading text-h3 text-primary-dark">Add a department</p>
              <DepartmentForm onDone={() => undefined} />
            </section>
            <ul className="space-y-1.5">
              {rows.map(({ d, depth }) => (
                <DeptRow key={d.id} d={d} depth={depth} />
              ))}
            </ul>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
