// Integration › Connections (SRS 19, admins): Microsoft 365 mail, Slack and Infowan, each with
// its status, a test to yourself and how to connect it. Keys live only in the server's settings.
import clsx from 'clsx';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { apiPost } from '../../api/client';
import { Card } from '../../components/Card';
import { SortableGroup } from '../../components/layout/SortableGroup';
import { StatTile } from '../../components/StatTile';
import { IconPlug } from '../../components/ui/icons';
import { PageHead } from '../../components/ui/PageHead';
import { useQueryClient } from '@tanstack/react-query';
import { API_KEY } from '../../api/queries';
import { useDailyChannel } from '../daily/api';
import { useSlackChannels, useStatus } from './api';

function Pill({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-heading text-label font-bold uppercase',
        on ? 'bg-good/15 text-good' : 'bg-border/50 text-text-muted',
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <details className="mt-3 rounded-card border border-border p-3 text-table">
      <summary className="cursor-pointer font-heading text-button text-primary">
        How to connect
      </summary>
      <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-text">
        {items.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
    </details>
  );
}

function TestButton({ channel, disabled }: { channel: 'mail' | 'slack'; disabled: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await apiPost<{ to: string }>('/api/integrations/test', { channel });
          toast.success(`Test sent to ${r.to}`, {
            description: channel === 'mail' ? 'Check your inbox.' : 'Check your Slack messages.',
          });
        } catch (e) {
          toast.error('Test failed', { description: e instanceof Error ? e.message : '' });
        } finally {
          setBusy(false);
        }
      }}
      className="btn btn-card px-3 py-1.5 disabled:opacity-40"
    >
      {busy ? 'Sending…' : 'Send a test to me'}
    </button>
  );
}

/**
 * The daily work update group (SRS 23): where everyone's Daily update plan and wrap-up are posted.
 * A channel from the list (public ones the bot can see) or a pasted channel ID (private ones).
 */
function DailyChannel({ connected }: { connected: boolean }) {
  const { data } = useDailyChannel();
  const { data: list } = useSlackChannels(connected);
  const qc = useQueryClient();
  const [value, setValue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const channels = list?.channels ?? [];
  const saved = data?.channel ?? '';
  const shown = (id: string) => {
    const c = channels.find((x) => x.id === id);
    return c ? `#${c.name}` : id;
  };
  const text = value ?? shown(saved);
  const save = async () => {
    const raw = text.trim();
    // A #name from the list is saved as its ID, so a renamed channel keeps working.
    const id = channels.find((c) => `#${c.name}` === raw || c.name === raw)?.id ?? raw;
    setBusy(true);
    try {
      await apiPost('/api/integrations/daily-channel', { channel: id || null }, 'PUT');
      await qc.invalidateQueries({ queryKey: [API_KEY] });
      setValue(null);
      toast.success(id ? 'Daily update channel saved' : 'Daily update channel cleared', {
        description: id ? 'Invite the Nural Pulse app there: /invite @Nural Pulse' : undefined,
      });
    } catch (e) {
      toast.error('Not saved', { description: e instanceof Error ? e.message : '' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-3 rounded-card border border-border p-3" data-tour="daily-channel">
      <p className="font-heading text-button text-primary-dark">Daily update channel</p>
      <p className="pb-2 text-table text-text-muted">
        Everyone's morning plan and evening wrap-up are posted here (My work › Daily update).
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          value={text}
          onChange={(e) => setValue(e.target.value)}
          list="daily-channels"
          placeholder="#daily-work-update or channel ID"
          aria-label="Daily update channel"
          className="h-8 min-w-[14rem] flex-1 rounded-control border border-border bg-surface px-3 text-table text-text outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
        <datalist id="daily-channels">
          {channels.map((c) => (
            <option key={c.id} value={`#${c.name}`} />
          ))}
        </datalist>
        <button
          type="button"
          disabled={busy || text.trim() === shown(saved)}
          onClick={() => void save()}
          className="btn btn-card px-3 py-1.5 disabled:opacity-40"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
      <p className="pt-1.5 text-[12px] text-text-muted">
        A private channel: paste its ID (in Slack: channel name › About, at the bottom).
      </p>
    </div>
  );
}

const code = (s: string) => (
  <code className="rounded bg-primary-soft-100 px-1 font-mono text-[12px]">{s}</code>
);

export function ConnectionsPage() {
  const { data, isLoading } = useStatus();
  const connected = [data?.mail.connected, data?.slack.connected, data?.infowan.connected].filter(
    Boolean,
  ).length;
  return (
    <div className="space-y-4">
      <PageHead
        title="Connections"
        sub="Mail, Slack and Infowan: where reports go and where leave comes from"
        icon={<IconPlug size={24} />}
      />
      <SortableGroup
        group="connections.tiles"
        noun="tile"
        className="grid grid-cols-2 gap-3 lg:grid-cols-[repeat(var(--cols),minmax(0,1fr))]"
        items={[
          {
            id: 'connected',
            node: (
              <StatTile
                label="Connected"
                info="Services the dashboard can use now."
                value={isLoading ? undefined : `${connected} of 3`}
                sub="Microsoft 365, Slack, Infowan"
              />
            ),
          },
          {
            id: 'scheduling',
            node: (
              <StatTile
                label="Scheduled sending"
                info="Reports are sent on time by the server; local copies never send."
                value={isLoading ? undefined : data?.scheduling ? 'On' : 'Off here'}
                sub={data?.scheduling ? 'This server sends reports' : 'Only the live server sends'}
              />
            ),
          },
        ]}
      />
      <SortableGroup
        group="connections.cards"
        noun="card"
        className="grid grid-cols-1 gap-4 lg:grid-cols-12"
        items={[
          {
            id: 'mail',
            className: 'lg:col-span-6',
            node: (
              <Card
                title="Microsoft 365 mail"
                info="Report mails go out through Microsoft Graph from one Nural mailbox."
                loading={isLoading}
                action={
                  <Pill on={!!data?.mail.connected}>
                    {data?.mail.connected ? 'Connected' : 'Not connected'}
                  </Pill>
                }
              >
                <p className="text-body">
                  {data?.mail.connected ? (
                    <>
                      Sending from <b>{data.mail.from}</b>.
                    </>
                  ) : (
                    'Not connected yet: reports are logged but no mail goes out.'
                  )}
                </p>
                <div className="mt-3">
                  <TestButton channel="mail" disabled={!data?.mail.connected} />
                </div>
                <Steps
                  items={[
                    <>
                      In the Azure portal (Microsoft Entra ID) create an <b>app registration</b> for
                      the dashboard.
                    </>,
                    <>
                      Under API permissions add Microsoft Graph <b>Mail.Send</b> (application) and
                      grant admin consent.
                    </>,
                    <>
                      Limit it to the sender mailbox with an application access policy (Exchange
                      Online), so it can send only as that address.
                    </>,
                    <>
                      Create a client secret, then put {code('MS_TENANT_ID')},{' '}
                      {code('MS_CLIENT_ID')}, {code('MS_CLIENT_SECRET')} and {code('MAIL_FROM')} in
                      the server's {code('.env.prod')} and redeploy.
                    </>,
                  ]}
                />
              </Card>
            ),
          },
          {
            id: 'slack',
            className: 'lg:col-span-6',
            node: (
              <Card
                title="Slack"
                info="Direct messages to each person (found by work email) and posts to channels."
                loading={isLoading}
                action={
                  <Pill on={!!data?.slack.connected}>
                    {data?.slack.connected ? 'Connected' : 'Not connected'}
                  </Pill>
                }
              >
                <p className="text-body">
                  {data?.slack.connected ? (
                    <>
                      Workspace <b>{data.slack.team ?? 'connected'}</b>.
                    </>
                  ) : (
                    'Not connected yet: Slack sends are logged but nothing is posted.'
                  )}
                </p>
                <div className="mt-3">
                  <TestButton channel="slack" disabled={!data?.slack.connected} />
                </div>
                <DailyChannel connected={!!data?.slack.connected} />
                <Steps
                  items={[
                    <>At api.slack.com create an app for your workspace.</>,
                    <>
                      Add the bot scopes {code('chat:write')}, {code('users:read')},{' '}
                      {code('users:read.email')}, {code('im:write')} and {code('channels:read')},
                      and install it.
                    </>,
                    <>Invite the app to every channel that should get reports.</>,
                    <>
                      Put the Bot User OAuth Token in the server's {code('.env')} (
                      {code('.env.prod')} with Docker) as {code('SLACK_BOT_TOKEN')} and restart the
                      API.
                    </>,
                  ]}
                />
              </Card>
            ),
          },
          {
            id: 'infowan',
            className: 'lg:col-span-12',
            node: (
              <Card
                title="Infowan (leave and attendance)"
                info="Planned and urgent leave, late arrivals and early leaving, for Insights and reports."
                loading={isLoading}
                action={
                  <Pill on={!!data?.infowan.connected}>
                    {data?.infowan.connected ? 'Connected' : 'Not connected'}
                  </Pill>
                }
              >
                <p className="text-body">
                  {data?.infowan.connected
                    ? 'Leave and attendance come in every hour. See Integration › CRM (Infowan).'
                    : 'Not connected yet: Insights and reports use Bitrix24 and dashboard data only. Share Infowan’s API documentation and a key to connect it.'}
                </p>
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
}
