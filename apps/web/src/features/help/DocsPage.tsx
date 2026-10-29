// Help › Documents (SRS 20): the PDF guides for the reader's level of access (components/shell
// guideSet.ts): the whole dashboard (User guide, Module guide) and one guide per page they can
// open (built by docs/guides/src, names in screenshots replaced).
import { useEffect, useState } from 'react';
import { useMe } from '../../api/me';
import { Card } from '../../components/Card';
import { SortableGroup } from '../../components/layout/SortableGroup';
import { GUIDE_SET_LABEL, guideSet } from '../../components/shell/guideSet';
import { navFor } from '../../components/shell/nav';
import { IconBook, IconDownload, IconPdf } from '../../components/ui/icons';
import { PageHead } from '../../components/ui/PageHead';

const WHOLE = [
  {
    file: 'Nural Pulse - User guide.pdf',
    title: 'User guide',
    hint: 'The whole dashboard: signing in, finding your way, reading the numbers, changing tasks, making it yours',
  },
  {
    file: 'Nural Pulse - Module guide.pdf',
    title: 'Module guide',
    hint: 'Every page you can open, module by module, with what each tile, card and list shows',
  },
];

/** A module-wise guide's file name: "Development guide.pdf". */
export const moduleGuideFile = (label: string) => `${label} guide.pdf`;

export function DocsPage() {
  const { data: me } = useMe();
  const set = guideSet(me);
  const pages = navFor(me).flatMap((g) => g.items.map((i) => ({ ...i, module: g.label })));
  const url = (file: string) => `/guides/${set}/${encodeURIComponent(file)}`;
  const modUrl = (label: string) =>
    `/guides/${set}/modules/${encodeURIComponent(moduleGuideFile(label))}`;
  // Show only the module guides that exist for this set.
  const [ready, setReady] = useState<Set<string> | null>(null);
  const key = pages.map((p) => p.id).join(',');
  useEffect(() => {
    let live = true;
    void Promise.all(
      pages.map(async (p) => {
        const r = await fetch(modUrl(p.label), { method: 'HEAD' }).catch(() => null);
        return r?.ok && r.headers.get('content-type')?.includes('pdf') ? p.id : null;
      }),
    ).then((ids) => live && setReady(new Set(ids.filter((x): x is NonNullable<typeof x> => !!x))));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, set]);

  const link = (href: string, title: string, hint: string, big?: boolean) => (
    <a
      key={href}
      href={href}
      target="_blank"
      rel="noreferrer"
      className="group flex items-start gap-3 rounded-card border border-border bg-surface p-3 transition hover:-translate-y-0.5 hover:border-primary hover:shadow-pop"
    >
      <span
        className={`grid shrink-0 place-items-center text-primary ${big ? 'h-12 w-12' : 'h-10 w-10'}`}
      >
        {big ? <IconBook size={22} /> : <IconPdf size={18} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-heading text-button text-primary-dark">{title}</span>
        <span className="block text-table text-text-muted">{hint}</span>
      </span>
      <IconDownload size={16} className="mt-1 text-text-muted group-hover:text-primary" />
    </a>
  );

  return (
    <div className="space-y-4">
      <PageHead
        title="Documents"
        sub={`PDF guides for ${GUIDE_SET_LABEL[set]}: only the pages you can open`}
        icon={<IconBook size={24} />}
      />
      <SortableGroup
        group="docs.cards"
        noun="card"
        className="grid grid-cols-1 gap-4 xl:grid-cols-12"
        items={[
          {
            id: 'whole',
            className: 'xl:col-span-12',
            node: (
              <Card title="The whole dashboard" info="Two guides covering everything you can open.">
                <div className="grid gap-3 md:grid-cols-2">
                  {WHOLE.map((g) => link(url(g.file), g.title, g.hint, true))}
                </div>
              </Card>
            ),
          },
          {
            id: 'modules',
            className: 'xl:col-span-12',
            node: (
              <Card
                title="Module by module"
                info="One short guide per page: what it shows and how to use it."
                loading={!ready}
                empty={!!ready && !ready.size}
                emptyText="The page guides are being prepared; the whole-dashboard guides above cover every page."
              >
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {pages
                    .filter((p) => ready?.has(p.id))
                    .map((p) =>
                      link(
                        modUrl(p.label),
                        `${p.label} guide`,
                        `${p.module} › ${p.label}: ${p.hint}`,
                      ),
                    )}
                </div>
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
}
