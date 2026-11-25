import type { Env } from './env';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  readonly configured: boolean;
  send(mail: Mail): Promise<void>;
}

const RESEND_URL = 'https://api.resend.com/emails';

/**
 * E-mail provider (docs/SYNC_DESIGN.md §5 E-mail). The rest of the Worker only uses `Mailer`.
 *
 * - "resend": Resend API (domain inbalans.app, EU region). Needs the secret RESEND_API_KEY.
 * - "console": logs the message (development, `wrangler dev`). Never use in production.
 * - anything else: not configured; login codes cannot be sent.
 */
export function mailer(env: Env, fetcher: typeof fetch = fetch): Mailer {
  switch (env.MAIL_PROVIDER) {
    case 'resend': {
      const key = env.RESEND_API_KEY;
      const from = env.MAIL_FROM || 'InBalans <noreply@inbalans.app>';
      return {
        configured: !!key,
        async send(mail) {
          if (!key) throw new Error('mail-not-configured');
          const res = await fetcher(RESEND_URL, {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text }),
          });
          if (!res.ok) {
            // Never log the address or content; status and provider error name are enough.
            const detail = await res.text().catch(() => '');
            console.error(`[mail] resend failed: ${res.status} ${detail.slice(0, 200)}`);
            throw new Error('mail-failed');
          }
        },
      };
    }
    case 'console':
      return {
        configured: true,
        async send(mail) {
          console.log(`[mail] to=${mail.to} subject=${mail.subject}\n${mail.text}`);
        },
      };
    default:
      return {
        configured: false,
        async send() {
          throw new Error('mail-not-configured');
        },
      };
  }
}

export function loginCodeMail(to: string, code: string, origin: string): Mail {
  return {
    to,
    subject: `${code} is je inlogcode voor InBalans`,
    text: [
      'Hallo,',
      '',
      `Je inlogcode voor InBalans is: ${code}`,
      '',
      'Vul deze code in op het scherm waar je inlogt. De code is 10 minuten geldig.',
      'Heb je niet geprobeerd in te loggen? Dan kun je deze e-mail negeren.',
      '',
      origin,
    ].join('\n'),
  };
}

export function newLoginMail(to: string, device: string, at: string, signOutUrl: string): Mail {
  const when = new Date(at).toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam', dateStyle: 'long', timeStyle: 'short' });
  return {
    to,
    subject: `Nieuwe aanmelding op ${device}`,
    text: [
      'Hallo,',
      '',
      `Er is op ${when} ingelogd op je InBalans-account vanaf ${device}.`,
      '',
      'Was jij dit niet, of ben je vergeten uit te loggen op een ander apparaat? Meld dat apparaat dan hier af:',
      signOutUrl,
    ].join('\n'),
  };
}

export function supportViewMail(to: string, tenantName: string, at: string, settingsUrl: string): Mail {
  const when = new Date(at).toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam', dateStyle: 'long', timeStyle: 'short' });
  return {
    to,
    subject: 'InBalans ondersteuning kijkt mee in je administratie',
    text: [
      'Hallo,',
      '',
      `Op ${when} is de ondersteuning van InBalans begonnen met meekijken in je administratie "${tenantName}".`,
      'Dat kan omdat je hiervoor toestemming hebt gegeven. Meekijken is alleen-lezen: er wordt niets gewijzigd.',
      '',
      'Wil je de toegang intrekken? Open InBalans en ga naar Instellingen → Ondersteuning op afstand:',
      settingsUrl,
    ].join('\n'),
  };
}
