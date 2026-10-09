// pnpm hooks:simulate <taskId> [ONTASKUPDATE|ONTASKADD|ONTASKDELETE|ONTASKCOMMENTADD]
// Posts a correctly signed outbound-webhook call to the local API, as Bitrix24 would.
import { config } from '../config';

const [taskId, event = 'ONTASKUPDATE'] = process.argv.slice(2);
if (!taskId || !/^\d+$/.test(taskId)) {
  console.error('Usage: pnpm hooks:simulate <taskId> [event]');
  process.exit(1);
}
if (!config.BITRIX_OUTBOUND_TOKEN) {
  console.error('BITRIX_OUTBOUND_TOKEN is empty; the receiver refuses every call until it is set.');
  process.exit(1);
}

const idKey = event === 'ONTASKDELETE' ? 'data[FIELDS_BEFORE][ID]' : 'data[FIELDS_AFTER][ID]';
const body = new URLSearchParams({
  event,
  [idKey]: taskId,
  ts: String(Math.floor(Date.now() / 1000)),
  'auth[application_token]': config.BITRIX_OUTBOUND_TOKEN,
});

const started = Date.now();
const res = await fetch(`http://127.0.0.1:${config.PORT}/hooks/bitrix`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: body.toString(),
});
console.log(
  `${event} for task ${taskId}: HTTP ${res.status} in ${Date.now() - started} ms`,
  await res.text(),
);
