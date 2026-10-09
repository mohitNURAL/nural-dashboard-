import { describe, expect, it } from 'vitest';
import {
  PENDING_STAGES,
  SENT_TO_QA_STAGES,
  STAGE_COLORS,
  STAGE_TITLES,
  canonicalStage,
  resolveStage,
  stageGroupOf,
} from './stages';

describe('stages', () => {
  it('has the 11 board stages, each in exactly one group', () => {
    expect(STAGE_TITLES).toHaveLength(11);
    for (const s of STAGE_TITLES) {
      const inPending = PENDING_STAGES.includes(s);
      const inQa = SENT_TO_QA_STAGES.includes(s);
      expect(inPending !== inQa, s).toBe(true);
      expect(STAGE_COLORS[s]).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it('matches titles case- and whitespace-insensitively', () => {
    expect(canonicalStage('  in   qa ')).toBe('In QA');
    expect(canonicalStage('live')).toBe('LIVE');
    expect(canonicalStage('Backlog')).toBeNull();
  });

  it('treats stage id 0 as To do', () => {
    expect(resolveStage('0', null)).toBe('To do');
    expect(resolveStage(0, 'whatever')).toBe('To do');
    expect(resolveStage('1088', 'Pending for QA')).toBe('Pending for QA');
  });

  it('groups stages', () => {
    expect(stageGroupOf('On Hold')).toBe('pending');
    expect(stageGroupOf('Issue Raised')).toBe('sentToQa');
  });
});
