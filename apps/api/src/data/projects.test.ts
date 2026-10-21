import { describe, expect, it } from 'vitest';
import { projectsOf } from './dataset';

describe('project names (2026-10-21)', () => {
  it('names a private project the webhook cannot list from its tasks', () => {
    const p = projectsOf(
      [{ id: 154, name: 'Moto India', active: true, isDevProject: true }],
      [
        { groupId: 154, raw: { group: { id: '154', name: 'Old name' } } },
        { groupId: 170, raw: { group: { id: '170', name: 'Nural BA', opened: false } } },
        { groupId: 168, raw: {} },
        { groupId: 0, raw: null },
      ],
    );
    expect(p.get(154)).toEqual({ id: 154, name: 'Moto India', active: true });
    expect(p.get(170)).toEqual({ id: 170, name: 'Nural BA', active: true });
    // No name anywhere: left out, shown as "Group 168" as before.
    expect(p.has(168)).toBe(false);
    expect(p.has(0)).toBe(false);
  });
});
