import { describe, expect, it } from 'vitest';
import {
  PENDING_STAGES,
  SENT_TO_QA_STAGES,
  STAGE_ALIASES,
  STAGE_COLORS,
  STAGE_TITLES,
  canonicalStage,
  resolveStage,
  stageGroupOf,
} from './stages';

describe('stages', () => {
  it('has the 11 board stages, each in exactly one group (pending, completed or On Hold)', () => {
    expect(STAGE_TITLES).toHaveLength(11);
    for (const s of STAGE_TITLES) {
      const groups = [PENDING_STAGES.includes(s), SENT_TO_QA_STAGES.includes(s), s === 'On Hold'];
      expect(groups.filter(Boolean).length, s).toBe(1);
      expect(STAGE_COLORS[s]).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it('matches titles case- and whitespace-insensitively', () => {
    expect(canonicalStage('  in   qa ')).toBe('In QA');
    expect(canonicalStage('live')).toBe('LIVE');
    expect(canonicalStage('Backlog')).toBeNull();
  });

  it('maps non-standard board titles to the nearest standard stage', () => {
    for (const [alias, stage] of Object.entries(STAGE_ALIASES)) {
      expect(canonicalStage(alias.toUpperCase()), alias).toBe(stage);
      expect(STAGE_TITLES).toContain(stage);
    }
    expect(canonicalStage('issues raised')).toBe('Issue Raised');
    expect(canonicalStage('Unit testing')).toBe('In progress');
    expect(canonicalStage('Name')).toBeNull();
  });

  it('treats stage id 0 as To do', () => {
    expect(resolveStage('0', null)).toBe('To do');
    expect(resolveStage(0, 'whatever')).toBe('To do');
    expect(resolveStage('1088', 'Pending for QA')).toBe('Pending for QA');
  });

  it('groups stages', () => {
    expect(stageGroupOf('On Hold')).toBe('hold');
    expect(stageGroupOf('Issue Raised')).toBe('pending');
  });
});
