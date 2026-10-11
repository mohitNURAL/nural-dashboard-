import { describe, expect, it } from 'vitest';
import { POINT_LABELS } from './labels';
import { TAB_STEPS } from './steps';
import { pointSteps } from './usePointTour';

describe('tour of one data point', () => {
  it('uses the written step when there is one', () => {
    const [s] = pointSteps('qa.cards', 'retest');
    expect(s?.title).toBe('Waiting for retest');
  });

  it('falls back to the data point’s name, with list help for sections', () => {
    const [s] = pointSteps('dev.sections', 'alerts');
    expect(s).toMatchObject({ title: 'Alert details' });
    expect(s?.text).toMatch(/Click the header to open the list/);
  });

  it('every written step on a drag group points at a named data point', () => {
    const slot = /\[data-group="([\w.]+)"\] \[data-slot="(\w+)"\]/;
    for (const steps of Object.values(TAB_STEPS)) {
      for (const s of steps) {
        const m = s.target?.match(slot);
        if (m) expect(POINT_LABELS[m[1]!]?.[m[2]!], s.target).toBeTruthy();
      }
    }
  });
});
