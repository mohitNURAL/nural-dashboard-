// Checks the Bitrix24 inbound webhook. Run: node --env-file=.env scripts/test-webhook.mjs
const base = process.env.BITRIX_INBOUND_URL;
if (!base) {
  console.error('BITRIX_INBOUND_URL is missing from .env');
  process.exit(1);
}

async function call(method, params = {}) {
  const res = await fetch(new URL(`${method}.json`, base), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const body = await res.json();
  if (body.error) throw new Error(`${method}: ${body.error} ${body.error_description ?? ''}`);
  return body;
}

const profile = await call('profile');
console.log(
  `Webhook user: ${profile.result.NAME} ${profile.result.LAST_NAME} (id ${profile.result.ID})`,
);

const depts = await call('department.get');
console.log(`Departments: ${depts.result.length}`);
for (const d of depts.result) console.log(`  ${d.ID}  ${d.NAME}`);

const users = await call('user.get', { FILTER: { ACTIVE: true } });
console.log(`Active users: ${users.total}`);
for (const u of users.result)
  console.log(
    `  ${u.ID}  ${u.NAME} ${u.LAST_NAME ?? ''} | ${u.WORK_POSITION || '-'} | dept ${u.UF_DEPARTMENT}`,
  );

const groups = await call('sonet_group.get', { ORDER: { NAME: 'ASC' } });
console.log(`Workgroups: ${groups.total}`);
for (const g of groups.result) {
  const stages = await call('task.stages.get', { entityId: Number(g.ID) });
  console.log(`  ${g.ID}  ${g.NAME}  (${Object.keys(stages.result).length} stages)`);
}
console.log('Inbound webhook OK.');
