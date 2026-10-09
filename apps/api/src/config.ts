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

const schema = z.object({
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
