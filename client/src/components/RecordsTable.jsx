import { useMemo, useState } from 'react';
import { fmtLakh } from '../format.js';

const blank = <span className="untagged">—</span>;

/** The client details shown in every drill-down list. */
export const CLIENT_COLUMNS = [
  {
    key: 'company',
    label: 'Company Name',
    cell: (r) => (r.link
      ? <a href={r.link} target="_blank" rel="noreferrer" title={`Open ${r.type} #${r.id} in Bitrix24`}>{r.company ?? `${r.type} #${r.id}`}</a>
      : r.company ?? `${r.type} #${r.id}`),
    className: 'rec-company',
  },
  { key: 'customer', label: 'Customer Name' },
  { key: 'product', label: 'Product' },
  { key: 'source', label: 'Source' },
  { key: 'stage', label: 'Current Stage' },
  { key: 'value', label: 'Value', num: true, cell: (r) => (r.value ? fmtLakh(r.value) : blank) },
  { key: 'ageDays', label: 'Age', num: true, cell: (r) => (r.ageDays == null ? blank : `${r.ageDays}d`) },
  { key: 'owner', label: 'Responsible Person' },
];

function compare(a, b, { column, dir }) {
  const get = column.sortValue ?? ((r) => r[column.key]);
  const x = get(a);
  const y = get(b);
  if (x == null || y == null) return (x == null) - (y == null); // blanks last in either direction
  return dir * (typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'en-IN', { sensitivity: 'base' }));
}

/** Sortable client list; click a header to sort, click again to reverse. */
export default function RecordsTable({ rows, columns = CLIENT_COLUMNS, initialSort = { key: 'value', dir: -1 } }) {
  const [sort, setSort] = useState(initialSort);
  const column = columns.find((c) => c.key === sort.key) ?? columns[0];
  const sorted = useMemo(() => [...rows].sort((a, b) => compare(a, b, { column, dir: sort.dir })), [rows, column, sort.dir]);
  const toggle = (c) => setSort((s) => (s.key === c.key ? { key: c.key, dir: -s.dir } : { key: c.key, dir: c.num ? -1 : 1 }));

  return (
    <div className="table-scroll">
      <table className="mtable records-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.num ? 'num' : ''} aria-sort={sort.key === c.key ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}>
                <button className="th-sort" onClick={() => toggle(c)}>
                  {c.label}
                  <span className="sort-mark" aria-hidden="true">{sort.key === c.key ? (sort.dir > 0 ? '▲' : '▼') : ''}</span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={`${r.type}-${r.id}`}>
              {columns.map((c) => (
                <td key={c.key} className={[c.num ? 'num' : '', c.className ?? ''].join(' ').trim() || undefined}>
                  {c.cell ? c.cell(r) : r[c.key] ?? blank}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
