// Prints every set of guides to PDF with a Chrome started with --remote-debugging-port=9333, and
// copies them where the dashboard serves them (apps/web/public/guides/<set>/).
//   node docs/guides/src/print.mjs   -> docs/guides/<set>/user-guide.pdf, module-guide.pdf
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = fileURLToPath(new URL('..', import.meta.url));
const pub = fileURLToPath(new URL('../../../apps/web/public/guides/', import.meta.url));
const SETS = ['member', 'support', 'owner', 'manager', 'admin'];
const FILE = { 'user-guide': 'Nural Dashboard - User guide.pdf', 'module-guide': 'Nural Dashboard - Module guide.pdf' };

// The two whole guides of each set, then its one-page guides (src/<set>/modules/<Page> guide.html,
// printed to <set>/modules/ and served from public/guides/<set>/modules/).
const JOBS = SETS.flatMap((set) => [
  ...['user-guide', 'module-guide'].map((name) => ({ set, name, src: `${set}/${name}.html`, dest: `${set}/${name}.pdf`, pub: `${set}/${FILE[name]}` })),
  ...(existsSync(`${here}${set}/modules`) ? readdirSync(`${here}${set}/modules`) : [])
    .filter((f) => f.endsWith('.html'))
    .map((f) => {
      const pdf = f.replace(/\.html$/, '.pdf');
      return { set, name: pdf, src: `${set}/modules/${f}`, dest: `${set}/modules/${pdf}`, pub: `${set}/modules/${pdf}` };
    }),
]);

for (const { set, name, src, dest, pub: pubPath } of JOBS) {
  const target = await fetch('http://127.0.0.1:9333/json/new?about:blank', { method: 'PUT' }).then((r) => r.json());
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  };
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const i = ++id;
      pending.set(i, (msg) => (msg.error ? rej(new Error(msg.error.message)) : res(msg.result)));
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  await send('Page.enable');
  await send('Page.navigate', { url: pathToFileURL(`${here}${src}`).href });
  await sleep(4000); // fonts and images
  const { data } = await send('Page.printToPDF', {
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate:
      '<div style="width:100%;font-size:8px;color:#8a8589;font-family:sans-serif;padding:0 15mm;display:flex;justify-content:space-between"><span>Nural Dev and QA Dashboard</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
  });
  mkdirSync(`${out}${set}/modules`, { recursive: true });
  mkdirSync(`${pub}${set}/modules`, { recursive: true });
  writeFileSync(`${out}${dest}`, Buffer.from(data, 'base64'));
  copyFileSync(`${out}${dest}`, `${pub}${pubPath}`);
  console.log('printed', set, name);
  ws.close();
  await fetch(`http://127.0.0.1:9333/json/close/${target.id}`).catch(() => {});
}
