// Backend configuration from the root .env. The only place Bitrix24 secrets are read.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const rootEnv = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v?.trim() ? v.trim() : undefined));

const schema = z
  .object({
    BITRIX_INBOUND_URL: z.string().url(),
    BITRIX_OUTBOUND_TOKEN: optionalString,
    // Empty = all workgroups; otherwise a comma list of group IDs.
    DEV_GROUP_IDS: z
      .string()
      .optional()
      .transform((v, ctx) => {
        const ids = (v ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .map(Number);
        if (ids.some((n) => !Number.isInteger(n) || n <= 0)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'must be a comma list of IDs' });
        }
        return ids;
      }),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    APP_TIMEZONE: z.string().default('Asia/Kolkata'),
    PUBLIC_BASE_URL: optionalString,
    PORT: z.coerce.number().int().positive().default(4000),
    WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
    // 'off' = this process only receives webhooks and serves the API; another runs the sync.
    SYNC_WORKER: z.enum(['on', 'off']).default('on'),
    // Sign-in (SRS 7): 'off' for local dev; 'bitrix' = Sign in with Bitrix24 (OAuth local app).
    AUTH: z.enum(['off', 'bitrix']).default('off'),
    BITRIX_CLIENT_ID: optionalString,
    BITRIX_CLIENT_SECRET: optionalString,
    SESSION_SECRET: optionalString,
    // Report mails (SRS 19): Microsoft 365 through Graph, sent from one Nural mailbox.
    MS_TENANT_ID: optionalString,
    MS_CLIENT_ID: optionalString,
    MS_CLIENT_SECRET: optionalString,
    MAIL_FROM: optionalString,
    // Slack bot (chat:write, users:read, users:read.email, im:write, channels:read).
    SLACK_BOT_TOKEN: optionalString,
    // NFR-9 working hours for the "no webhook for 2 working hours" alert, in APP_TIMEZONE.
    WORK_DAYS: z.string().default('1,2,3,4,5,6'),
    WORK_HOURS: z
      .string()
      .regex(/^\d{1,2}-\d{1,2}$/)
      .default('10-19'),
  })
  .superRefine((c, ctx) => {
    if (c.AUTH !== 'bitrix') return;
    for (const key of ['BITRIX_CLIENT_ID', 'BITRIX_CLIENT_SECRET'] as const) {
      if (!c[key])
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: 'required when AUTH=bitrix',
        });
    }
    if ((c.SESSION_SECRET ?? '').length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SESSION_SECRET'],
        message: 'at least 32 characters when AUTH=bitrix',
      });
    }
  });

export type Config = z.infer<typeof schema>;

function load(): Config {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // Report key names and reasons only: never echo values, they may be secrets.
    const problems = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment (check the root .env):\n${problems.join('\n')}`);
  }
  return Object.freeze(parsed.data);
}

export const config = load();
