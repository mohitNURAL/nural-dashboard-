// pnpm db:migrate: applies the SQL migrations in src/db/migrations.
import { closeDb } from '../db/client';
import { runMigrations } from '../db/migrate';

runMigrations()
  .then(() => console.log('Migrations applied.'))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(closeDb);
