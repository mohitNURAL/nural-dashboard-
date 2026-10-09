import { defineConfig } from 'drizzle-kit';

// Only generates SQL from the schema; no database connection is needed.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
});
