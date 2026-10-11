// The signed-in person and their access (NFR-4): full access sees everything and the KPI tab;
// a member sees only their own tasks (the server enforces it; the web app follows).
import { useApi } from './queries';

export interface Me {
  id: number;
  name: string;
  auth: 'off' | 'bitrix';
  role: 'admin' | 'pm' | 'teamLead' | 'productOwner' | 'member' | 'local';
  full: boolean;
}

export const useMe = () => useApi<Me>('/api/auth/me', {});

export const ROLE_LABEL: Record<Me['role'], string> = {
  admin: 'Admin',
  pm: 'PM',
  teamLead: 'Team lead',
  productOwner: 'Product owner',
  member: 'My tasks',
  local: 'Local copy',
};
