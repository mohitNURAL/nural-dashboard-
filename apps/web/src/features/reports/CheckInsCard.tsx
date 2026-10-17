// Check-ins to the directors (2026-10-17, SRS 24), for admins: whether the 11:30 and 19:00 Slack
// direct messages are on (config/daily-checkins.json), who gets them, what today's would say, and
// a test sent only to yourself.
import { useState } from 'react';
import { toast } from 'sonner';
import { apiPost } from '../../api/client';
import { useApi } from '../../api/queries';
import { Card, ViewToggle } from '../../components/Card';

interface CheckIn {
  enabled: boolean;
  recipients: number[];
  times: { plan: string; wrap: string };
  message: { text: string; blocks: { type: string; text?: { text: string } }[] };
}

export function CheckInsCard() {
  const [kind, setKind] = useState<'plan' | 'wrap'>('plan');
  const { data, isLoading } = useApi<CheckIn>('/api/report/daily/checkin', { kind });
  const [busy, setBusy] = useState(false);
  const test = async () => {
    setBusy(true);
    try {
      const r = await apiPost<{ to: string }>('/api/report/daily/checkin/test', { kind });
      toast.success(`Test sent to you on Slack (${r.to})`);
    } catch (e) {
      toast.error('Not sent', { description: e instanceof Error ? e.message : '' });
    } finally {
      setBusy(false);
    }
  };
  const lines = (data?.message.blocks ?? [])
    .map((b) => b.text?.text)
    .filter((t): t is string => !!t);
  return (
    <Card
      title="Check-ins to the directors"
      info="A Slack direct message to each recipient at 11:30 (who has and has not planned their day) and 19:00 (who has and has not wrapped up), working days only. Admins only."
      loading={isLoading}
      action={
        <ViewToggle<'plan' | 'wrap'>
          value={kind}
          onChange={setKind}
          options={[
            { value: 'plan', label: data ? `Plans · ${data.times.plan}` : 'Plans' },
            { value: 'wrap', label: data ? `Wrap-ups · ${data.times.wrap}` : 'Wrap-ups' },
          ]}
        />
      }
    >
      {data && (
        <div className="space-y-3 text-table">
          <p className={data.enabled ? 'font-bold text-good' : 'font-bold text-warn'}>
            {data.enabled
              ? `On: sent to ${data.recipients.length} people on working days.`
              : 'Off: nothing is sent yet. It is switched on in config/daily-checkins.json once the test looks right.'}
          </p>
          <div className="whitespace-pre-line rounded-xl border border-border bg-bg/60 p-3 text-text">
            {lines
              .join('\n\n')
              .replace(/\*/g, '')
              .replace(/<[^|>]+\|([^>]+)>/g, '$1')}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void test()}
            className="h-9 rounded-control bg-primary px-3 font-heading text-button text-white hover:brightness-110 disabled:opacity-50"
          >
            {busy ? 'Sending…' : 'Send me a test'}
          </button>
        </div>
      )}
    </Card>
  );
}
