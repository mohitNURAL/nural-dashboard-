// Projects › Workflow (2026-10-12, SRS 22): how a task moves through the Kanban stages to LIVE,
// who works at each stage, and what each stage counts as on the dashboard. Everyone can view it;
// admins edit it, and a saved change applies to every number on every page. Drawn from the
// workflow definition the dashboard counts with.
import {
  CATEGORY_LABEL,
  DEPARTMENT_LABEL,
  DEPARTMENTS,
  ROLE_LABEL,
  stageUsage,
  type Workflow,
} from '@nural/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { apiPost } from '../../api/client';
import { useMe } from '../../api/me';
import { API_KEY } from '../../api/queries';
import { Card } from '../../components/Card';
import { SortableGroup } from '../../components/layout/SortableGroup';
import { StatTile } from '../../components/StatTile';
import { confirm } from '../../components/ui/ConfirmDialog';
import { IconFlow } from '../../components/ui/icons';
import { PageHead } from '../../components/ui/PageHead';
import { timeAgo } from '../employees/labels';
import { useWorkflowHistory, useWorkflowInfo } from './api';
import { WorkflowDiagram } from './WorkflowDiagram';
import { WorkflowEditor } from './WorkflowEditor';

/** What each department does, in words, from the stages it owns. */
function departmentRoles(wf: Workflow) {
  return DEPARTMENTS.map((d) => ({
    d,
    stages: wf.stages.filter((s) => s.department === d),
  })).filter((x) => x.stages.length);
}

export function WorkflowPage() {
  const { data: me } = useMe();
  const { data, isLoading } = useWorkflowInfo();
  const admin = !!me?.admin;
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const wf = data?.workflow;
  const stage = wf?.stages.find((s) => s.title === (selected ?? wf.stages[0]?.title));

  return (
    <div className="space-y-4">
      <PageHead
        title="Workflow"
        sub="How tasks move through the Kanban stages to LIVE, and who does what at each"
        icon={<IconFlow size={24} />}
      >
        {admin && wf && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            data-tour="workflow-edit"
            className="h-10 rounded-control bg-gradient-to-r from-primary to-accent px-4 font-heading text-button text-white shadow-sm hover:brightness-110"
          >
            Edit workflow
          </button>
        )}
      </PageHead>

      <SortableGroup
        group="workflow.tiles"
        noun="tile"
        className="grid grid-cols-2 gap-3 lg:grid-cols-[repeat(var(--cols),minmax(0,1fr))]"
        items={[
          {
            id: 'stages',
            node: (
              <StatTile
                label="Stages"
                info="Kanban stages in the workflow, in board order."
                value={wf?.stages.length}
                sub="To do … LIVE"
              />
            ),
          },
          {
            id: 'open',
            node: (
              <StatTile
                label="Open stages"
                info="Stages that count as pending."
                value={wf?.stages.filter((s) => s.category === 'open').length}
                sub="Count as pending"
              />
            ),
          },
          {
            id: 'completed',
            node: (
              <StatTile
                label="Completed stages"
                info="Stages from QA entry on: the task counts as done for the developer."
                value={wf?.stages.filter((s) => s.category === 'completed').length}
                sub={
                  wf
                    ? `From ${wf.stages.find((s) => s.roles.includes('qaEntry'))?.title ?? '—'}`
                    : undefined
                }
              />
            ),
          },
          {
            id: 'version',
            node: (
              <StatTile
                label="Version"
                info="Every saved workflow is kept; admins can restore any of them."
                value={isLoading ? undefined : data?.isDefault ? 'Standard' : `v${data?.version}`}
                sub={data?.at ? `Changed ${timeAgo(data.at)}` : 'Not changed yet'}
              />
            ),
          },
        ]}
      />

      <SortableGroup
        group="workflow.cards"
        noun="card"
        className="grid grid-cols-1 gap-4 xl:grid-cols-12"
        items={[
          {
            id: 'diagram',
            className: 'xl:col-span-12',
            node: (
              <Card
                title="Flow diagram"
                info="One lane per department; stages left to right in board order. Click a stage for what it means and which numbers it feeds."
                loading={isLoading}
              >
                {wf && (
                  <WorkflowDiagram workflow={wf} selected={stage?.title} onSelect={setSelected} />
                )}
              </Card>
            ),
          },
          {
            id: 'stage',
            className: 'xl:col-span-6',
            node: (
              <Card
                title={stage ? `Stage: ${stage.title}` : 'Stage'}
                info="Click a stage on the diagram."
                loading={isLoading}
              >
                {stage && (
                  <div className="space-y-3 text-table">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ background: stage.color }} />
                      <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-heading text-label font-bold text-primary">
                        {DEPARTMENT_LABEL[stage.department]}
                      </span>
                      <span className="rounded-full bg-accent/15 px-2.5 py-0.5 font-heading text-label font-bold text-accent-dark">
                        {CATEGORY_LABEL[stage.category]}
                      </span>
                      {stage.roles.map((r) => (
                        <span
                          key={r}
                          className="rounded-full bg-good/15 px-2.5 py-0.5 font-heading text-label font-bold text-good"
                        >
                          {ROLE_LABEL[r]}
                        </span>
                      ))}
                    </p>
                    <p className="text-body text-text">{stage.description || '—'}</p>
                    <div>
                      <p className="font-heading text-label uppercase text-text-muted">
                        Moves on to
                      </p>
                      <p>{stage.next.join(', ') || '— (the end of the flow)'}</p>
                    </div>
                    {stage.aliases.length > 0 && (
                      <div>
                        <p className="font-heading text-label uppercase text-text-muted">
                          Board columns that mean it
                        </p>
                        <p>{stage.aliases.join(', ')}</p>
                      </div>
                    )}
                    <div>
                      <p className="font-heading text-label uppercase text-text-muted">
                        On the dashboard
                      </p>
                      <ul className="list-disc space-y-0.5 pl-5">
                        {stageUsage(stage).map((u) => (
                          <li key={u}>{u}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </Card>
            ),
          },
          {
            id: 'departments',
            className: 'xl:col-span-6',
            node: (
              <Card
                title="Who does what"
                info="Each department and the stages where the next step is theirs."
                loading={isLoading}
              >
                <ul className="space-y-2">
                  {wf &&
                    departmentRoles(wf).map(({ d, stages }) => (
                      <li key={d} className="rounded-xl border border-border bg-bg/50 px-3 py-2">
                        <p className="font-heading text-button text-primary-dark">
                          {DEPARTMENT_LABEL[d]}
                        </p>
                        <p className="mt-0.5 flex flex-wrap gap-1">
                          {stages.map((s) => (
                            <button
                              key={s.title}
                              type="button"
                              onClick={() => setSelected(s.title)}
                              className="rounded-full px-2 py-0.5 text-[12px] font-bold"
                              style={{ background: `${s.color}26`, color: s.color }}
                            >
                              {s.title}
                            </button>
                          ))}
                        </p>
                        <p className="mt-1 text-table text-text-muted">
                          {stages
                            .map((s) => s.description)
                            .filter(Boolean)
                            .join(' ')}
                        </p>
                      </li>
                    ))}
                </ul>
              </Card>
            ),
          },
          ...(admin ? [{ id: 'versions', className: 'xl:col-span-12', node: <Versions /> }] : []),
        ]}
      />
      {editing && wf && <WorkflowEditor workflow={wf} onClose={() => setEditing(false)} />}
    </div>
  );
}

function Versions() {
  const qc = useQueryClient();
  const { data } = useWorkflowHistory(true);
  const restore = async (version: number) => {
    const ok = await confirm({
      title: version ? `Restore version ${version}?` : 'Restore the standard workflow?',
      message: 'It is saved again as the newest version and every page counts with it at once.',
      confirmLabel: 'Restore',
      tone: 'warn',
    });
    if (!ok) return;
    try {
      await apiPost(`/api/workflow/restore/${version}`, {});
      toast.success('Workflow restored');
      void qc.invalidateQueries({ queryKey: [API_KEY] });
    } catch (e) {
      toast.error('Not restored', { description: e instanceof Error ? e.message : '' });
    }
  };
  return (
    <Card title="Versions" info="Every saved workflow, newest first. Admins only.">
      <ul className="grid gap-2 md:grid-cols-3">
        {(data?.versions ?? []).map((v, i) => (
          <li
            key={v.version}
            className="flex items-center justify-between rounded-xl border border-border bg-bg/50 px-3 py-2 text-table"
          >
            <span>
              <b className="font-heading">v{v.version}</b> · {timeAgo(v.at)}
              {i === 0 && <span className="ml-1 text-good">(in force)</span>}
            </span>
            {i > 0 && (
              <button
                type="button"
                onClick={() => void restore(v.version)}
                className="font-heading text-button text-primary hover:underline"
              >
                Restore
              </button>
            )}
          </li>
        ))}
        <li className="flex items-center justify-between rounded-xl border border-dashed border-border px-3 py-2 text-table">
          <span>Standard workflow</span>
          <button
            type="button"
            onClick={() => void restore(0)}
            className="font-heading text-button text-primary hover:underline"
          >
            Restore
          </button>
        </li>
      </ul>
    </Card>
  );
}
