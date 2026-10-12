// The signed-in person and their access (NFR-4): full access sees everything and the KPI tab;
// a member sees only their own tasks (the server enforces it; the web app follows).
import { useEffect } from 'react';
import { apiPost, signInAgain } from './client';
import { useApi } from './queries';

export interface Me {
  id: number;
  name: string;
  auth: 'off' | 'bitrix';
  /** When the session ends (ms since epoch), 3 days after sign-in; null with sign-in off. */
  exp: number | null;
  role: 'admin' | 'pm' | 'teamLead' | 'productOwner' | 'member' | 'local';
  /** Data scope: every project and person (else only their own tasks). */
  full: boolean;
  /** KPI tab. */
  kpi?: boolean;
  /** Employee module: company tree and people directory. */
  employees?: boolean;
  /** Changes every task field (else stage, status and tags). */
  editAll?: boolean;
  /** Sees the Support tab (Tech Support team, PM, team leads, admins). */
  support: boolean;
  admin: boolean;
  /** Reads the feedback inbox: admins and the head of Tech Support. */
  inbox: boolean;
  /** One right per page (2026-10-12, Access permissions); missing on an older server. */
  dev?: boolean;
  qa?: boolean;
  insights?: boolean;
  workflow?: boolean;
  projectTypes?: boolean;
  org?: boolean;
  people?: boolean;
  connections?: boolean;
  mailing?: boolean;
  helpFeedback?: boolean;
  helpInbox?: boolean;
  helpDocs?: boolean;
  helpFaq?: boolean;
  /** Department (dev, qa, support, other) and Bitrix24 designation, for the guided tour. */
  dept?: 'dev' | 'qa' | 'support' | 'other';
  position?: string | null;
}

export const useMe = () => useApi<Me>('/api/auth/me', {});

/** An open page signs itself out when the session ends, even if nobody touches it. */
export function useSessionEnd() {
  const { data: me } = useMe();
  const exp = me?.exp;
  useEffect(() => {
    if (!exp) return;
    const end = () =>
      void apiPost('/api/auth/logout', {})
        .catch(() => undefined)
        .finally(() => signInAgain(true));
    // setTimeout holds at most ~24.8 days; sessions are 3, so one timer is enough.
    const timer = window.setTimeout(end, Math.max(0, exp - Date.now()));
    return () => window.clearTimeout(timer);
  }, [exp]);
}

export const ROLE_LABEL: Record<Me['role'], string> = {
  admin: 'Admin',
  pm: 'PM',
  teamLead: 'Team lead',
  productOwner: 'Product owner',
  member: 'My tasks',
  local: 'Local copy',
};
