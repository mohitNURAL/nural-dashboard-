// The workflow (apps/api/src/routes/workflow.ts, SRS 22): read by everyone, applied to the
// stage rules here as on the server, so stage chips, the stage matrix, colours and pickers follow
// an admin's edit. Refetched with every live change, so a new workflow arrives by itself.
import { applyWorkflow, type Workflow } from '@nural/shared';
import { useRef } from 'react';
import { useApi } from '../../api/queries';

export interface WorkflowInfo {
  workflow: Workflow;
  version: number;
  at: string | null;
  by: number | null;
  isDefault: boolean;
}

export interface ProjectBoard {
  id: number;
  name: string;
  columns: { title: string; stage: string | null }[];
  unmapped: string[];
  type: string | null;
  overridden: boolean;
  tasks: number;
}

export const useWorkflowInfo = () => useApi<WorkflowInfo>('/api/workflow', {});
export const useProjectBoards = () =>
  useApi<{ projects: ProjectBoard[] }>('/api/workflow/projects', {});
export const useWorkflowHistory = (on: boolean) =>
  useApi<{ versions: { version: number; at: string; by: number }[] }>(
    '/api/workflow/history',
    {},
    { enabled: on },
  );

/**
 * Applies the current workflow before anything draws (App): returns true once it is in place.
 * Applied during render (not in an effect), so the pages drawn in the same pass already use it.
 */
export function useApplyWorkflow(enabled: boolean): boolean {
  const { data } = useApi<WorkflowInfo>('/api/workflow', {}, { enabled });
  const applied = useRef<number | null>(null);
  if (data && applied.current !== data.version) {
    applyWorkflow(data.workflow);
    applied.current = data.version;
  }
  return !!data || !enabled;
}
