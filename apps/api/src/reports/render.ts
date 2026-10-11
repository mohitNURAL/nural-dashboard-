// A report as an email (HTML that renders in Outlook: tables and inline styles) and as a Slack
// message (Block Kit with a plain-text fallback). Task lines link to the task on the dashboard.
import type { ReportData, ReportSection } from '@nural/shared';

export interface RenderMeta {
  recipientName: string;
  scopeLabel: string;
  /** Preview copy: who it would go to when live. */
  preview?: { intended: string[] };
  test?: boolean;
  dashboardUrl: string;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const NAVY = '#18244e';
const BLUE = '#32499f';
const TEAL = '#13b5c1';
const RED = '#d62f2f';
const GREEN = '#0f9d58';
const MUTED = '#6b6567';

export function subjectOf(data: ReportData, meta: RenderMeta) {
  const tag = meta.test ? '[TEST] ' : meta.preview ? '[PREVIEW] ' : '';
  return `${tag}${data.title} · ${data.periodLabel}`;
}

const taskUrl = (meta: RenderMeta, id: number) =>
  `${meta.dashboardUrl.replace(/\/$/, '')}/?tab=dev&task=${id}`;

function sectionHtml(s: ReportSection, meta: RenderMeta) {
  const stats = s.stats?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:6px 0 10px"><tr>${s.stats
        .map(
          (
            x,
          ) => `<td style="padding:8px 10px;background:#f3f5fb;border-radius:8px;text-align:left;width:${Math.floor(100 / s.stats!.length)}%">
<div style="font:600 11px Arial,sans-serif;color:${MUTED};text-transform:uppercase;letter-spacing:.04em">${esc(x.label)}</div>
<div style="font:700 20px Arial,sans-serif;color:${x.tone === 'bad' ? RED : x.tone === 'good' ? GREEN : NAVY}">${esc(x.value)}</div></td>`,
        )
        .join('<td style="width:6px"></td>')}</tr></table>`
    : '';
  const items = s.items?.length
    ? `<ul style="margin:0;padding:0 0 0 18px">${s.items
        .map(
          (i) =>
            `<li style="margin:4px 0;font:14px Arial,sans-serif;color:${i.tone === 'bad' ? RED : i.tone === 'good' ? GREEN : '#231f20'}">${
              i.taskId
                ? `<a href="${esc(taskUrl(meta, i.taskId))}" style="color:${BLUE};text-decoration:none">${esc(i.text)}</a>`
                : esc(i.text)
            }${i.meta ? `<div style="font:12px Arial,sans-serif;color:${MUTED}">${esc(i.meta)}</div>` : ''}</li>`,
        )
        .join(
          '',
        )}</ul>${s.more ? `<p style="font:12px Arial,sans-serif;color:${MUTED};margin:4px 0 0">and ${s.more} more on the dashboard</p>` : ''}`
    : !s.stats?.length && s.empty
      ? `<p style="font:14px Arial,sans-serif;color:${MUTED};margin:0">${esc(s.empty)}</p>`
      : '';
  return `<tr><td style="padding:16px 24px;border-top:1px solid #e3e1e6">
<h2 style="margin:0 0 6px;font:700 16px Arial,sans-serif;color:${NAVY}">${esc(s.title)}</h2>${stats}${items}</td></tr>`;
}

export function renderEmail(data: ReportData, meta: RenderMeta): { subject: string; html: string } {
  const note = meta.test
    ? `This is a test sent to you from the report designer.`
    : meta.preview
      ? `PREVIEW: this report is in preview, so it goes to admins only. When live it goes to: ${esc(meta.preview.intended.slice(0, 20).join(', '))}${meta.preview.intended.length > 20 ? ` and ${meta.preview.intended.length - 20} more` : ''}.`
      : '';
  const html = `<!doctype html><html><body style="margin:0;background:#eef1f8;padding:24px 0">
<table role="presentation" align="center" cellpadding="0" cellspacing="0" style="width:640px;max-width:100%;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td style="background:${NAVY};padding:20px 24px">
<div style="font:800 20px Arial,sans-serif;color:#ffffff">Nural <span style="color:#05cfd3">Pulse</span></div>
<div style="height:3px;background:linear-gradient(90deg,${BLUE},${TEAL});margin-top:12px;border-radius:3px"></div>
<div style="font:700 18px Arial,sans-serif;color:#ffffff;margin-top:12px">${esc(data.title)}</div>
<div style="font:13px Arial,sans-serif;color:#b9c3ec;margin-top:2px">${esc(data.periodLabel)} · ${esc(meta.scopeLabel)} · for ${esc(meta.recipientName)}</div>
</td></tr>
${note ? `<tr><td style="padding:12px 24px;background:#fff8e6;font:13px Arial,sans-serif;color:#7a5a00">${note}</td></tr>` : ''}
${data.sections.map((s) => sectionHtml(s, meta)).join('\n')}
<tr><td style="padding:18px 24px;border-top:1px solid #e3e1e6;font:12px Arial,sans-serif;color:${MUTED}">
<a href="${esc(meta.dashboardUrl)}" style="display:inline-block;background:${BLUE};color:#ffffff;text-decoration:none;padding:9px 16px;border-radius:8px;font-weight:700">Open the dashboard</a>
<p style="margin:12px 0 0">Sent by Nural Pulse. Your admins choose what these reports contain and when they arrive. Powered by Bitrix24 and Nural.</p>
</td></tr></table></body></html>`;
  return { subject: subjectOf(data, meta), html };
}

const slackEsc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function renderSlack(
  data: ReportData,
  meta: RenderMeta,
): { text: string; blocks: unknown[] } {
  const blocks: unknown[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${meta.test ? 'TEST · ' : meta.preview ? 'PREVIEW · ' : ''}${data.title}`.slice(
          0,
          150,
        ),
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `${slackEsc(data.periodLabel)} · ${slackEsc(meta.scopeLabel)} · for ${slackEsc(meta.recipientName)}`,
        },
      ],
    },
  ];
  if (meta.preview) {
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `:warning: Preview: admins only. When live: ${slackEsc(meta.preview.intended.slice(0, 15).join(', '))}${meta.preview.intended.length > 15 ? ' …' : ''}`,
        },
      ],
    });
  }
  for (const s of data.sections) {
    const lines: string[] = [];
    if (s.stats?.length)
      lines.push(s.stats.map((x) => `*${slackEsc(x.label)}:* ${slackEsc(x.value)}`).join('   '));
    for (const i of s.items ?? []) {
      const text = i.taskId ? `<${taskUrl(meta, i.taskId)}|${slackEsc(i.text)}>` : slackEsc(i.text);
      lines.push(`• ${text}${i.meta ? `  _${slackEsc(i.meta)}_` : ''}`);
    }
    if (s.more) lines.push(`_and ${s.more} more on the dashboard_`);
    if (!lines.length && s.empty) lines.push(`_${slackEsc(s.empty)}_`);
    blocks.push(
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${slackEsc(s.title)}*\n${lines.join('\n')}`.slice(0, 2900),
        },
      },
    );
  }
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Open the dashboard' },
        url: meta.dashboardUrl,
      },
    ],
  });
  return { text: `${data.title} · ${data.periodLabel}`, blocks: blocks.slice(0, 50) };
}
