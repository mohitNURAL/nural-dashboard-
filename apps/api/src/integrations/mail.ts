// Report mails through Microsoft 365 (SRS 19): Microsoft Graph sendMail from one Nural mailbox
// (MAIL_FROM), with an app registration (client credentials, Mail.Send). The secret stays in the
// server's environment; nothing here logs it or a token.

export interface MailConfig {
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
  from?: string;
}

export interface Mail {
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
}

export interface Mailer {
  connected: boolean;
  from: string | null;
  send: (m: Mail) => Promise<void>;
}

export class MailError extends Error {}

export function graphMailer(cfg: MailConfig, fetchImpl: typeof fetch = fetch): Mailer {
  const connected = !!(cfg.tenantId && cfg.clientId && cfg.clientSecret && cfg.from);
  let token: { value: string; exp: number } | null = null;

  async function accessToken() {
    if (token && token.exp > Date.now() + 60_000) return token.value;
    const res = await fetchImpl(
      `https://login.microsoftonline.com/${encodeURIComponent(cfg.tenantId!)}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: cfg.clientId!,
          client_secret: cfg.clientSecret!,
          scope: 'https://graph.microsoft.com/.default',
          grant_type: 'client_credentials',
        }),
      },
    );
    const body = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      error_description?: string;
    };
    if (!res.ok || !body.access_token) {
      throw new MailError(
        `Microsoft 365 sign-in failed: ${body.error_description?.split('\n')[0] ?? res.status}`,
      );
    }
    token = { value: body.access_token, exp: Date.now() + (body.expires_in ?? 3600) * 1000 };
    return token.value;
  }

  return {
    connected,
    from: cfg.from ?? null,
    async send(m) {
      if (!connected) throw new MailError('Microsoft 365 is not connected.');
      const address = (a: string) => ({ emailAddress: { address: a } });
      const res = await fetchImpl(
        `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(cfg.from!)}/sendMail`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${await accessToken()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              subject: m.subject,
              body: { contentType: 'HTML', content: m.html },
              toRecipients: m.to.map(address),
              ccRecipients: (m.cc ?? []).map(address),
            },
            saveToSentItems: false,
          }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new MailError(`Microsoft 365 refused the mail: ${body.error?.message ?? res.status}`);
      }
    },
  };
}
