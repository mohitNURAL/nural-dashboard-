// Query parameters shared by every metrics endpoint (DEV-00 filter bar).
import { DEV_SCOPES, GROUP_BY, type Filters } from '@nural/shared';
import { z } from 'zod';

/** Accepts `a=1,2`, `a=1&a=2` or nothing. */
export const list = <T extends z.ZodTypeAny>(item: T) =>
  z.preprocess((v) => {
    if (v === undefined || v === null || v === '') return undefined;
    const parts = (Array.isArray(v) ? v : [v])
      .flatMap((s) => String(s).split(','))
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.length ? parts : undefined;
  }, z.array(item).optional());

const id = z.coerce.number().int().positive();
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
  .optional();

export const filtersSchema = z.object({
  project: list(id),
  assignee: list(id),
  tag: list(z.string().min(1)),
  type: z.enum(['bug', 'feedback']).optional(),
  dateField: z.enum(['created', 'deadline']).optional(),
  from: date,
  to: date,
});

export type FilterQuery = z.infer<typeof filtersSchema>;

export function toFilters(q: FilterQuery): Filters {
  return {
    projectIds: q.project,
    assigneeIds: q.assignee,
    tags: q.tag,
    issueType: q.type,
    dateField: q.dateField,
    from: q.from,
    to: q.to,
  };
}

/** Parses the shared filters plus endpoint-specific params; ZodError becomes a 400. */
export function parseQuery<E extends z.ZodRawShape>(query: unknown, extra?: E) {
  const schema = extra ? filtersSchema.extend(extra) : filtersSchema;
  const parsed = schema.parse(query ?? {}) as FilterQuery & z.infer<z.ZodObject<E>>;
  return { query: parsed, filters: toFilters(parsed) };
}

/** Assignee / Project switch on the breakdown cards (DEV-02, 03, 05; QA-02, 04, 05). */
export const groupByParam = { groupBy: z.enum(GROUP_BY).default('assignee') };

/** Development tab switch: All, Dev or Issues (default dev keeps older links working). */
export const scopeParam = { scope: z.enum(DEV_SCOPES).default('dev') };
