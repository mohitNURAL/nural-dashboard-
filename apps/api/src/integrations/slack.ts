// Slack bot (SRS 19): direct messages to people (found by their work email) and posts to channels.
// Needs a bot token (SLACK_BOT_TOKEN) with chat:write, users:read.email, im:write and
// channels:read. The token stays in the server's environment and is never logged.

export interface SlackMessage {
  text: string;
  blocks?: unknown[];
}

export interface Slack {
  connected: boolean;
  /** The workspace's name, once checked. */
  team: () => Promise<string | null>;
  toPerson: (email: string, m: SlackMessage) => Promise<void>;
  toChannel: (channel: string, m: SlackMessage) => Promise<void>;
  channels: () => Promise<{ id: string; name: string }[]>;
}

export class SlackError extends Error {}

export function slackBot(token: string | undefined, fetchImpl: typeof fetch = fetch): Slack {
  const connected = !!token;
  const ids = new Map<string, string>();

  async function api<T>(method: string, body: Record<string, unknown>, form = false): Promise<T> {
    if (!connected) throw new SlackError('Slack is not connected.');
    const res = await fetchImpl(`https://slack.com/api/${method}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': form
          ? 'application/x-www-form-urlencoded'
          : 'application/json; charset=utf-8',
      },
      body: form
        ? new URLSearchParams(
            Object.entries(body).map(([k, v]) => [k, String(v)] as [string, string]),
          )
        : JSON.stringify(body),
    });
    const data = (await res
      .json()
      .catch(() => ({ ok: false, error: `http_${res.status}` }))) as T & {
      ok: boolean;
      error?: string;
    };
    if (!data.ok) throw new SlackError(`Slack: ${data.error ?? 'error'}`);
    return data;
  }

  async function userId(email: string) {
    const hit = ids.get(email);
    if (hit) return hit;
    const r = await api<{ user: { id: string } }>('users.lookupByEmail', { email }, true);
    ids.set(email, r.user.id);
    return r.user.id;
  }

  return {
    connected,
    async team() {
      if (!connected) return null;
      return (
        (await api<{ team?: string }>('auth.test', {}).catch(() => ({ team: undefined }))).team ??
        null
      );
    },
    async toPerson(email, m) {
      await api('chat.postMessage', {
        channel: await userId(email),
        text: m.text,
        blocks: m.blocks,
      });
    },
    async toChannel(channel, m) {
      await api('chat.postMessage', {
        channel: channel.replace(/^#/, ''),
        text: m.text,
        blocks: m.blocks,
      });
    },
    async channels() {
      const r = await api<{ channels: { id: string; name: string }[] }>(
        'conversations.list',
        { types: 'public_channel,private_channel', exclude_archived: true, limit: 500 },
        true,
      );
      return r.channels.map((c) => ({ id: c.id, name: c.name }));
    },
  };
}
