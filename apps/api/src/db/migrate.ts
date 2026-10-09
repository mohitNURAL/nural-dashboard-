import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import { db } from './client';

export const MIGRATIONS_DIR = fileURLToPath(new URL('./migrations', import.meta.url));

export async function runMigrations(): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}
