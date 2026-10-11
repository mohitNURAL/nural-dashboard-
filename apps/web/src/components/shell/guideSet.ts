// Which set of PDF guides fits a person (docs/guides/src SETS): by their current rights.
import type { Me } from '../../api/me';

export type GuideSet = 'admin' | 'manager' | 'owner' | 'support' | 'member';

export const GUIDE_SET_LABEL: Record<GuideSet, string> = {
  admin: 'admins',
  manager: 'team leads and PM',
  owner: 'product owners',
  support: 'the support team',
  member: 'team members',
};

export function guideSet(
  me: Pick<Me, 'admin' | 'employees' | 'kpi' | 'full' | 'support'> | undefined,
): GuideSet {
  if (!me) return 'member';
  if (me.admin) return 'admin';
  if (me.employees) return 'manager';
  if (me.kpi ?? me.full) return 'owner';
  if (me.support) return 'support';
  return 'member';
}
