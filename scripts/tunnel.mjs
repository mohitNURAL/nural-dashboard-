// pnpm tunnel: a public HTTPS URL for the local API, so Bitrix24 can deliver outbound
// webhooks during development. Point the webhook handler at <printed URL>/hooks/bitrix.
// The quick-tunnel URL changes every time this starts.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const port = process.env.PORT ?? '4000';
// winget installs here; a new terminal also has it on PATH.
const installed = [
  'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
  'C:\\Program Files\\cloudflared\\cloudflared.exe',
];
const bin = installed.find((p) => existsSync(p)) ?? 'cloudflared';

const child = spawn(bin, ['tunnel', '--no-autoupdate', '--url', `http://localhost:${port}`], {
  stdio: ['ignore', 'inherit', 'pipe'],
});
child.stderr.setEncoding('utf8');
child.stderr.on('data', (chunk) => {
  const url = chunk.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];
  if (url) console.log(`\nTunnel ready. Outbound webhook handler URL:\n  ${url}/hooks/bitrix\n`);
  if (/ERR|error/i.test(chunk)) process.stderr.write(chunk);
});
child.on('error', () => {
  console.error('cloudflared not found. Install it: winget install Cloudflare.cloudflared');
  process.exit(1);
});
child.on('exit', (code) => process.exit(code ?? 0));
