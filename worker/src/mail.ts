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

/**
 * E-mail is sent through a provider that is still to be chosen (docs/SYNC_DESIGN.md §14).
 * Add the provider here; the rest of the Worker only uses `Mailer`.
 *
 * - "console": logs the message (development, `wrangler dev`). Never use in production.
 * - anything else: not configured; login codes cannot be sent.
 */
export function mailer(env: Env): Mailer {
  switch (env.MAIL_PROVIDER) {
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
