// pnpm bitrix:ping: prints the Kanban stages of each group in DEV_GROUP_IDS (empty = all).
import { canonicalStage } from '@nural/shared';
import { config } from '../config';
import { batch, closeBitrix, getBitrix, listAll, type Command } from '../bitrix';

interface Group {
  ID: string;
  NAME: string;
}

interface Stage {
  ID: string;
  TITLE: string;
  SORT: string | number;
  COLOR?: string;
}

async function main() {
  const bitrix = getBitrix();
  const started = Date.now();

  const profile = await bitrix.call<{ ID: string; NAME: string; LAST_NAME?: string }>('profile');
  const me = profile.result;
  console.log(
    `Webhook user: ${me.NAME} ${me.LAST_NAME ?? ''} (id ${me.ID})`.replace(/\s+\(/, ' ('),
  );

  const allGroups = await listAll<Group>(bitrix.call, 'sonet_group.get', {
    ORDER: { NAME: 'ASC' },
  });
  const wanted = config.DEV_GROUP_IDS;
  const groups = wanted.length
    ? wanted.map(
        (id) => allGroups.find((g) => Number(g.ID) === id) ?? { ID: String(id), NAME: '?' },
      )
    : allGroups;
  console.log(
    wanted.length
      ? `Groups from DEV_GROUP_IDS: ${wanted.join(', ')}`
      : `DEV_GROUP_IDS is empty, so all ${groups.length} visible groups`,
  );

  const commands: Record<string, Command> = {};
  for (const g of groups)
    commands[`g${g.ID}`] = { method: 'task.stages.get', params: { entityId: Number(g.ID) } };
  const stages = await batch<Record<string, Stage> | Stage[]>(bitrix.call, commands, {
    allowErrors: true,
  });

  let unknownTitles = 0;
  for (const g of groups) {
    const key = `g${g.ID}`;
    const err = stages.errors[key];
    if (err) {
      console.log(`\n${g.ID}  ${g.NAME}: error ${err.error} ${err.error_description ?? ''}`);
      continue;
    }
    const raw = stages.result[key];
    const list = (raw ? Object.values(raw) : []).sort((a, b) => Number(a.SORT) - Number(b.SORT));
    console.log(`\n${g.ID}  ${g.NAME}: ${list.length} stages`);
    for (const s of list) {
      const known = canonicalStage(s.TITLE) !== null;
      if (!known) unknownTitles++;
      console.log(
        `  ${known ? '✓' : '✗'} ${s.TITLE.padEnd(24)} id ${s.ID}${s.COLOR ? `  #${s.COLOR}` : ''}`,
      );
    }
  }

  const secs = (Date.now() - started) / 1000;
  console.log(
    `\n${bitrix.callCount} Bitrix24 calls in ${secs.toFixed(1)} s` +
      ` (${(bitrix.callCount / secs).toFixed(2)} calls/s, limit 2).` +
      (unknownTitles ? ` ${unknownTitles} stage title(s) not in the shared stage map (✗).` : ''),
  );
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(closeBitrix);
