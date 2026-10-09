import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { config } from '../config';
import * as schema from './schema';

export const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 5 });
export const db = drizzle(pool, { schema });
export type Db = typeof db;

export { schema };

export async function closeDb(): Promise<void> {
  await pool.end();
}
