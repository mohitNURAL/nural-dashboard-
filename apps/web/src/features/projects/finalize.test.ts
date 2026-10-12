import { DEFAULT_WORKFLOW } from '@nural/shared';
import { describe, expect, it } from 'vitest';
import { finalize, type Item } from './finalize';

const items = (): Item[] =>
  DEFAULT_WORKFLOW.stages.map((s, i) => ({
    id: `s${i}`,
    orig: s.title,
    stage: structuredClone(s),
  }));

describe('saving an edited workflow', () => {
  it('a rename follows through arrows, rework and types, and keeps the old name as a column', () => {
    const it = items();
    it.find((x) => x.orig === 'QA Backlog')!.stage.title = 'Ready for QA';
    const wf = finalize(DEFAULT_WORKFLOW, it, DEFAULT_WORKFLOW.rework);
    const qa = wf.stages.find((s) => s.title === 'Ready for QA')!;
    expect(qa.aliases).toContain('QA Backlog');
    expect(wf.stages.find((s) => s.title === 'Pending for QA')!.next).toEqual(['Ready for QA']);
    expect(wf.rework.from).toContain('Ready for QA');
    expect(wf.projectTypes.find((t) => t.key === 'release')!.requires).toContain('Ready for QA');
  });

  it('a removed stage leaves no arrow or rule behind', () => {
    const it = items().filter((x) => x.orig !== 'In QA');
    const wf = finalize(DEFAULT_WORKFLOW, it, DEFAULT_WORKFLOW.rework);
    expect(wf.stages.flatMap((s) => s.next)).not.toContain('In QA');
    expect(wf.rework.from).not.toContain('In QA');
  });
});
