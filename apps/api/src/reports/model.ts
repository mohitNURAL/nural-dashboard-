// A report's definition (SRS 19, Mailing): when it runs, who gets it, what it holds and how it is
// sent. Checked with zod on every save.
import { CONDITION_METRICS, REPORT_TOPICS, type Period } from '@nural/shared';
import { z } from 'zod';

const TOPIC_KEYS = REPORT_TOPICS.map((t) => t.key) as [string, ...string[]];
const METRIC_KEYS = CONDITION_METRICS.map((m) => m.key) as [string, ...string[]];
export const AUDIENCE_ROLES = ['admin', 'pm', 'teamLead', 'productOwner', 'member'] as const;

export const definitionSchema = z
  .object({
    schedule: z.object({
      kind: z.enum(['daily', 'weekly', 'monthly', 'conditional']),
      /** HH:MM in IST. */
      time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'time: HH:MM'),
      /** Weekly: 1 = Monday … 7 = Sunday. */
      weekday: z.number().int().min(1).max(7).default(1),
      /** Monthly: day 1–28. */
      monthDay: z.number().int().min(1).max(28).default(1),
      /** Skip weekends and public holidays (daily and conditional). */
      workingDaysOnly: z.boolean().default(true),
    }),
    condition: z
      .object({
        metric: z.enum(METRIC_KEYS),
        when: z.enum(['poor', 'good']),
        threshold: z.number().min(0).max(1000),
      })
      .nullable()
      .default(null),
    audience: z.object({
      roles: z.array(z.enum(AUDIENCE_ROLES)).default([]),
      users: z.array(z.number().int().positive()).max(500).default([]),
    }),
    topics: z.array(z.enum(TOPIC_KEYS)).min(1, 'Choose at least one topic.'),
    prompts: z.array(z.string().trim().min(3).max(200)).max(10).default([]),
    delivery: z.object({
      mail: z.boolean().default(true),
      slackDm: z.boolean().default(false),
      /** Slack channels (IDs or #names): one copy each, with the company view. */
      slackChannels: z
        .array(
          z
            .string()
            .trim()
            .regex(/^#?[\w.-]{1,80}$/, 'Slack channel: an ID or #name'),
        )
        .max(10)
        .default([]),
      /** CC on every mail. */
      cc: z.array(z.string().trim().email()).max(20).default([]),
    }),
  })
  .superRefine((d, ctx) => {
    if (d.schedule.kind === 'conditional' && !d.condition) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['condition'],
        message: 'A conditional report needs a condition.',
      });
    }
    if (!d.delivery.mail && !d.delivery.slackDm && !d.delivery.slackChannels.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['delivery'],
        message: 'Choose mail, Slack or a channel.',
      });
    }
    if (!d.audience.roles.length && !d.audience.users.length && !d.delivery.slackChannels.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['audience'],
        message: 'Choose who gets it: roles, people or a channel.',
      });
    }
  });

export type Definition = z.infer<typeof definitionSchema>;

export const reportInput = z.object({
  name: z.string().trim().min(2).max(120),
  definition: definitionSchema,
});

export type ReportState = 'preview' | 'live' | 'paused';

export interface Report {
  id: number;
  name: string;
  state: ReportState;
  definition: Definition;
  createdBy: number;
  updatedAt: Date;
}

/** The period a report covers. */
export const periodOf = (d: Definition): Period =>
  d.schedule.kind === 'monthly' ? 'month' : d.schedule.kind === 'weekly' ? 'week' : 'day';

/** Morning reports (before noon) look back at the period before; later ones at the current one. */
export const backOf = (d: Definition) => (Number(d.schedule.time.slice(0, 2)) < 12 ? 1 : 0);

/** BullMQ cron pattern (minute hour day month weekday), in the app's timezone. */
export function cronOf(d: Definition): string {
  const [h, m] = d.schedule.time.split(':').map(Number);
  if (d.schedule.kind === 'weekly') return `${m} ${h} * * ${d.schedule.weekday % 7}`;
  if (d.schedule.kind === 'monthly') return `${m} ${h} ${d.schedule.monthDay} * *`;
  return `${m} ${h} * * *`;
}

const WEEKDAY = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** "Every working day at 18:30", "Mondays at 09:00", … */
export function scheduleText(d: Definition): string {
  const t = d.schedule.time;
  switch (d.schedule.kind) {
    case 'daily':
      return `${d.schedule.workingDaysOnly ? 'Every working day' : 'Every day'} at ${t}`;
    case 'weekly':
      return `${WEEKDAY[d.schedule.weekday]}s at ${t}`;
    case 'monthly':
      return `Day ${d.schedule.monthDay} of each month at ${t}`;
    default: {
      const m = CONDITION_METRICS.find((x) => x.key === d.condition?.metric);
      return `Checked ${d.schedule.workingDaysOnly ? 'every working day' : 'daily'} at ${t}: ${d.condition?.when === 'good' ? 'very good' : 'very poor'} ${m?.label.toLowerCase() ?? ''} (${d.condition?.threshold} %)`;
    }
  }
}
