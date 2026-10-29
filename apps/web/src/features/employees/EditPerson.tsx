// Edit a person (People directory, admins; SRS 17): their dashboard role (kept on the dashboard),
// their designation and departments (sent to Bitrix24 with the admin's own sign-in). A
// confirmation lists every change and where it goes before anything is sent.
import * as Dialog from '@radix-ui/react-dialog';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { apiPost } from '../../api/client';
import { API_KEY } from '../../api/queries';
import { confirm } from '../../components/ui/ConfirmDialog';
import { IconClose, IconLock } from '../../components/ui/icons';
import { useOrgTree, type Employee, type Role } from './api';
import { Avatar } from './common';
import { DepartmentForm } from './DepartmentsDialog';
import { ROLE_NAME } from './labels';
import { Select } from '../../components/ui/Select';
import { SearchInput } from '../../components/ui/SearchInput';

const ROLES: Exclude<Role, 'local'>[] = ['admin', 'pm', 'teamLead', 'productOwner', 'member'];
const field =
  'h-10 w-full rounded-control border border-border bg-surface px-3 text-body text-text focus:border-primary focus:outline-none';

export function EditPerson({ person, onClose }: { person: Employee; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: tree } = useOrgTree();
  const [role, setRole] = useState<Role>(person.role);
  const [position, setPosition] = useState(person.position ?? '');
  const [depts, setDepts] = useState<number[]>(person.departmentIds);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const all = tree?.departments ?? [];
  const name = (id: number) => all.find((d) => d.id === id)?.name ?? String(id);
  // Departments in tree order with their depth, for the picker.
  const ordered = useMemo(() => {
    const kids = (p: number | null) => all.filter((d) => d.parentId === p);
    const out: { id: number; name: string; depth: number }[] = [];
    const walk = (p: number | null, depth: number) => {
      for (const d of kids(p).sort((a, b) => a.name.localeCompare(b.name))) {
        out.push({ id: d.id, name: d.name, depth });
        walk(d.id, depth + 1);
      }
    };
    walk(null, 0);
    // Departments whose parent is not in the list.
    for (const d of all)
      if (!out.some((o) => o.id === d.id)) out.push({ id: d.id, name: d.name, depth: 0 });
    return out;
  }, [all]);
  const shown = ordered.filter((d) => !q || d.name.toLowerCase().includes(q.toLowerCase()));

  const roleChanged = role !== person.role;
  const posChanged = position.trim() !== (person.position ?? '');
  const deptChanged = [...depts].sort().join() !== [...person.departmentIds].sort().join();

  const save = async () => {
    if (!depts.length) return toast.error('Keep at least one department');
    const details = [
      ...(roleChanged
        ? [{ label: 'Role', value: `${ROLE_NAME[person.role]} → ${ROLE_NAME[role]} (dashboard)` }]
        : []),
      ...(posChanged
        ? [
            {
              label: 'Designation',
              value: `${person.position ?? '-'} → ${position.trim() || '-'} (Bitrix24)`,
            },
          ]
        : []),
      ...(deptChanged
        ? [
            {
              label: 'Departments',
              value: `${person.departmentIds.map(name).join(', ') || '-'} → ${depts.map(name).join(', ')} (Bitrix24)`,
            },
          ]
        : []),
    ];
    if (!details.length) return onClose();
    const ok = await confirm({
      title: `Change ${person.name}?`,
      message:
        posChanged || deptChanged
          ? 'Designation and departments change in Bitrix24, in your name; the role changes on the dashboard.'
          : 'The role changes on the dashboard: their rights follow it.',
      details,
      confirmLabel: 'Save changes',
      tone: posChanged || deptChanged ? 'warn' : 'primary',
    });
    if (!ok) return;
    setBusy(true);
    try {
      if (roleChanged) await apiPost(`/api/people/${person.id}/role`, { role }, 'PUT');
      if (posChanged || deptChanged)
        await apiPost(
          `/api/people/${person.id}`,
          {
            ...(deptChanged ? { departments: depts } : {}),
            ...(posChanged ? { position: position.trim() } : {}),
          },
          'PUT',
        );
      toast.success(`${person.name} updated`, {
        description:
          posChanged || deptChanged
            ? 'Saved in Bitrix24; the directory is refreshed.'
            : 'Their rights follow the new role.',
      });
      void qc.invalidateQueries({ queryKey: [API_KEY] });
      onClose();
    } catch (e) {
      toast.error('Not saved', { description: e instanceof Error ? e.message : '' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 overlay" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-[min(460px,100vw)] flex-col bg-surface shadow-pop outline-none">
          <div className="flex items-center gap-3 border-b border-border px-5 py-4">
            <Avatar id={person.id} name={person.name} size={40} />
            <div className="min-w-0 flex-1">
              <Dialog.Title className="truncate font-heading text-h2 text-primary-dark">
                {person.name}
              </Dialog.Title>
              <Dialog.Description className="truncate text-table text-text-muted">
                {person.departments.join(', ') || 'No department'}
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-lg text-text-muted hover:bg-primary-soft-100"
            >
              <IconClose size={16} />
            </Dialog.Close>
          </div>
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
            <label className="block">
              <span className="mb-1.5 flex items-center gap-2 font-heading text-label uppercase text-text-muted">
                Dashboard role{' '}
                <span className="normal-case tracking-normal">· decides their rights</span>
              </span>
              {person.locked ? (
                <p className="flex items-center gap-2 rounded-control bg-bad/10 px-3 py-2 text-table text-bad">
                  <IconLock size={14} /> Admin, locked in config/roles.json
                </p>
              ) : (
                <Select
                  className="w-full"
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_NAME[r]}
                    </option>
                  ))}
                </Select>
              )}
            </label>
            <label className="block">
              <span className="mb-1.5 block font-heading text-label uppercase text-text-muted">
                Designation <span className="normal-case tracking-normal">· in Bitrix24</span>
              </span>
              <input
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                maxLength={120}
                placeholder="e.g. Senior Developer"
                className={field}
              />
            </label>
            <div>
              <span className="mb-1.5 flex items-center justify-between font-heading text-label uppercase text-text-muted">
                <span>
                  Departments <span className="normal-case tracking-normal">· in Bitrix24</span>
                </span>
                <button
                  type="button"
                  onClick={() => setAdding(!adding)}
                  className="normal-case tracking-normal text-primary hover:underline"
                >
                  {adding ? 'Cancel new department' : '+ New department'}
                </button>
              </span>
              {adding && (
                <div className="mb-3 rounded-card border border-accent/40 bg-accent/5 p-3">
                  <DepartmentForm
                    onDone={(id) => {
                      setAdding(false);
                      if (id) setDepts((d) => [...new Set([...d, id])]);
                    }}
                  />
                </div>
              )}
              <div className="mb-2 flex flex-wrap gap-1.5">
                {depts.map((d) => (
                  <span
                    key={d}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-table text-primary"
                  >
                    {name(d)}
                    <button
                      type="button"
                      aria-label={`Remove ${name(d)}`}
                      onClick={() => setDepts(depts.filter((x) => x !== d))}
                      className="hover:text-bad"
                    >
                      <IconClose size={11} />
                    </button>
                  </span>
                ))}
              </div>
              <SearchInput
                value={q}
                onChange={setQ}
                size="sm"
                placeholder="Find a department"
                className="mb-1.5"
              />
              <ul className="max-h-64 overflow-y-auto rounded-control border border-border p-1">
                {shown.map((d) => (
                  <li key={d.id}>
                    <label
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-table hover:bg-primary-soft-100"
                      style={{ paddingLeft: 8 + (q ? 0 : d.depth * 14) }}
                    >
                      <input
                        type="checkbox"
                        checked={depts.includes(d.id)}
                        onChange={() =>
                          setDepts(
                            depts.includes(d.id)
                              ? depts.filter((x) => x !== d.id)
                              : [...depts, d.id],
                          )
                        }
                        className="h-4 w-4 accent-[var(--primary)]"
                      />
                      {d.name}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
            <span className="text-table text-text-muted">
              {[roleChanged, posChanged, deptChanged].filter(Boolean).length || 'No'} change
              {[roleChanged, posChanged, deptChanged].filter(Boolean).length === 1 ? '' : 's'}
            </span>
            <span className="flex gap-2">
              <Dialog.Close className="btn btn-stroke h-10 px-4">Cancel</Dialog.Close>
              <button
                type="button"
                disabled={busy || !(roleChanged || posChanged || deptChanged)}
                onClick={() => void save()}
                className="btn btn-page h-10 px-4 disabled:opacity-40"
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
            </span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
