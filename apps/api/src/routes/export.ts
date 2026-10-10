// Export to Excel for the task lists (accordions on both tabs): every detail the dashboard holds
// for each task, one row per task, with a link to Bitrix24. Descriptions are not included (they
// are read live from Bitrix24 per task, not stored).
import { dayKey } from '@nural/shared';
import ExcelJS from 'exceljs';
import type { taskRow } from './context';

type Row = ReturnType<typeof taskRow>;

const STATUS_LABEL = { pending: 'Pending', completed: 'Completed' } as const;

/** A calendar date in the app time zone, as an Excel date (no time part). */
const asDate = (d: Date | string | null, tz: string) => {
  if (!d) return null;
  const key = dayKey(new Date(d), tz);
  return new Date(`${key}T00:00:00Z`);
};

export async function tasksWorkbook(rows: Row[], title: string, tz: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Nural Dev & QA Dashboard';
  const ws = wb.addWorksheet('Tasks', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'Task ID', key: 'id', width: 10 },
    { header: 'Title', key: 'title', width: 60 },
    { header: 'Type', key: 'type', width: 10 },
    { header: 'Project ID', key: 'projectId', width: 10 },
    { header: 'Project', key: 'project', width: 26 },
    { header: 'Stage', key: 'stage', width: 20 },
    { header: 'Bitrix24 stage', key: 'stageTitle', width: 20 },
    { header: 'Status', key: 'group', width: 12 },
    { header: 'Assignee ID', key: 'assigneeId', width: 10 },
    { header: 'Assignee', key: 'assignee', width: 20 },
    { header: 'Assignee department', key: 'dept', width: 16 },
    { header: 'Creator ID', key: 'creatorId', width: 10 },
    { header: 'Creator', key: 'creator', width: 20 },
    { header: 'Priority', key: 'priority', width: 9 },
    { header: 'Tags', key: 'tags', width: 30 },
    { header: 'Created', key: 'created', width: 12 },
    { header: 'Deadline', key: 'deadline', width: 12 },
    { header: 'Closed', key: 'closed', width: 12 },
    { header: 'Days past deadline', key: 'ageing', width: 10 },
    { header: 'Overdue', key: 'overdue', width: 9 },
    { header: 'Issue age (days)', key: 'age', width: 10 },
    { header: 'Rework', key: 'rework', width: 8 },
    { header: 'Linked task', key: 'linked', width: 11 },
    { header: 'Open in Bitrix24', key: 'url', width: 18 },
  ];

  for (const r of rows) {
    const row = ws.addRow({
      id: r.id,
      title: r.title,
      type: r.issueType ? (r.issueType === 'bug' ? 'Bug' : 'Feedback') : 'Task',
      projectId: r.project?.id ?? null,
      project: r.project?.name ?? '',
      stage: r.stage ?? '',
      stageTitle: r.stageTitle ?? '',
      group: STATUS_LABEL[r.status],
      assigneeId: r.assignee.id,
      assignee: r.assignee.name,
      dept: r.assignee.deptGroup,
      creatorId: r.creator.id,
      creator: r.creator.name,
      priority: r.priority[0]!.toUpperCase() + r.priority.slice(1),
      tags: r.tags.join(', '),
      created: asDate(r.createdAt, tz),
      deadline: asDate(r.deadline, tz),
      closed: asDate(r.closedAt, tz),
      ageing: r.ageingDays,
      overdue: r.overdue ? 'Yes' : '',
      age: r.ageDays ?? null,
      rework: r.isIssue ? (r.rework ?? 0) : null,
      linked: r.linkedTaskId ?? null,
      url: { text: 'Open', hyperlink: r.url },
    });
    row.getCell('id').value = { text: String(r.id), hyperlink: r.url };
  }

  // Look: Arial, blue header, dates as dates, links blue, filters on every column.
  const header = ws.getRow(1);
  header.height = 30;
  header.eachCell((c) => {
    c.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF32499F' } };
    c.alignment = { vertical: 'middle', wrapText: true };
  });
  ws.eachRow((row, n) => {
    if (n === 1) return;
    row.eachCell({ includeEmpty: true }, (c) => {
      c.font = { name: 'Arial', size: 10 };
      c.alignment = { vertical: 'top', wrapText: Number(c.col) === 2 };
    });
    for (const key of ['id', 'url']) {
      row.getCell(key).font = {
        name: 'Arial',
        size: 10,
        color: { argb: 'FF32499F' },
        underline: true,
      };
    }
    if (row.getCell('overdue').value === 'Yes') {
      row.getCell('overdue').font = {
        name: 'Arial',
        size: 10,
        bold: true,
        color: { argb: 'FFE63639' },
      };
    }
  });
  for (const key of ['created', 'deadline', 'closed']) ws.getColumn(key).numFmt = 'dd mmm yyyy';
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };

  // What the file is: the list title, the row count, and how it was made.
  ws.headerFooter.oddHeader = `&L${title}&R${rows.length} tasks`;
  const about = wb.addWorksheet('About');
  about.addRows([
    ['List', title],
    ['Tasks', rows.length],
    ['Exported', `${dayKey(new Date(), tz)} (Asia/Kolkata)`],
    [
      'Source',
      'Nural Dev & QA Dashboard: the list as shown, with its filters, search and order (all pages).',
    ],
    [
      'Not included',
      'Task descriptions (read live from Bitrix24 per task); open the task in Bitrix24 for them.',
    ],
  ]);
  about.getColumn(1).width = 14;
  about.getColumn(2).width = 90;
  about.eachRow((row) =>
    row.eachCell((c) => (c.font = { name: 'Arial', size: 10, bold: Number(c.col) === 1 })),
  );

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** A download header that keeps non-ASCII names (e.g. "·") intact. */
export const contentDisposition = (filename: string) => {
  const safe = filename.replace(/[\\/:*?"<>|]+/g, '-');
  const ascii = safe.replace(/[^\x20-\x7e]/g, '-');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
};
