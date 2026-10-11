// Integration module data (apps/api/src/routes/reports.ts): connections, the report catalogue,
// reports and their runs.
import { useApi } from '../../api/queries';

export interface Status {
  mail: { connected: boolean; from: string | null };
  slack: { connected: boolean; team: string | null };
  infowan: { connected: boolean };
  /** Reports are scheduled here (the server); false on local copies. */
  scheduling: boolean;
}

export type Kind = 'daily' | 'weekly' | 'monthly' | 'conditional';
export type AudienceRole = 'admin' | 'pm' | 'teamLead' | 'productOwner' | 'member';
export type ReportState = 'preview' | 'live' | 'paused';

export interface Definition {
  schedule: {
    kind: Kind;
    time: string;
    weekday: number;
    monthDay: number;
    workingDaysOnly: boolean;
  };
  condition: { metric: string; when: 'poor' | 'good'; threshold: number } | null;
  audience: { roles: AudienceRole[]; users: number[] };
  topics: string[];
  prompts: string[];
  delivery: { mail: boolean; slackDm: boolean; slackChannels: string[]; cc: string[] };
}

export interface Run {
  id: number;
  at: string;
  periodKey: string;
  recipient: string;
  channel: 'mail' | 'slack' | 'slack-channel';
  status: 'pending' | 'sent' | 'failed' | 'skipped' | 'test';
  preview: boolean;
  subject: string;
  error: string | null;
}

export interface Report {
  id: number;
  name: string;
  state: ReportState;
  definition: Definition;
  schedule: string;
  updatedAt: string;
  lastRuns: Run[];
}

export interface Catalogue {
  topics: { key: string; label: string; hint: string }[];
  prompts: string[];
  metrics: {
    key: string;
    label: string;
    unit: string;
    poor: number;
    good: number;
    higherIsBetter: boolean;
  }[];
  roles: AudienceRole[];
}

export const useStatus = () => useApi<Status>('/api/integrations/status', {});
export const useCatalogue = () => useApi<Catalogue>('/api/reports/catalogue', {});
export const useReports = () => useApi<{ reports: Report[] }>('/api/reports', {});
export const useRuns = (id: number | null) =>
  useApi<{ runs: Run[] }>(`/api/reports/${id ?? 0}/runs`, {}, { enabled: id !== null });
export const useSlackChannels = (on: boolean) =>
  useApi<{ channels: { id: string; name: string }[] }>(
    '/api/integrations/slack/channels',
    {},
    { enabled: on },
  );

export const ROLE_TEXT: Record<AudienceRole, string> = {
  admin: 'Admins (management)',
  pm: 'Project managers',
  teamLead: 'Team leads',
  productOwner: 'Product owners',
  member: 'Members',
};

export const emptyDefinition = (): Definition => ({
  schedule: { kind: 'daily', time: '18:30', weekday: 1, monthDay: 1, workingDaysOnly: true },
  condition: null,
  audience: { roles: ['member'], users: [] },
  topics: ['summary', 'dueToday', 'inHand', 'improve'],
  prompts: [],
  delivery: { mail: true, slackDm: false, slackChannels: [], cc: [] },
});
