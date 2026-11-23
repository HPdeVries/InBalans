import { describe, expect, it, vi } from 'vitest';
import { loginCodeMail, mailer } from './mail';
import type { Env } from './env';

const env = (vars: Partial<Env>) => ({ MAIL_PROVIDER: 'resend', MAIL_FROM: 'InBalans <noreply@inbalans.app>', ...vars }) as Env;

describe('Resend mailer', () => {
  it('posts the message to the Resend API', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ id: 'x' }), { status: 200 }));
    const m = mailer(env({ RESEND_API_KEY: 're_test' }), fetcher as unknown as typeof fetch);
    expect(m.configured).toBe(true);
    await m.send(loginCodeMail('a@b.nl', '123456', 'https://mijn.inbalans.app'));
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_test');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ from: 'InBalans <noreply@inbalans.app>', to: ['a@b.nl'] });
    expect(body.subject).toContain('123456');
    expect(body.text).toContain('123456');
  });

  it('is not configured without an API key and fails on provider errors', async () => {
    expect(mailer(env({})).configured).toBe(false);
    const fetcher = vi.fn(async () => new Response('{"name":"validation_error"}', { status: 422 }));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const m = mailer(env({ RESEND_API_KEY: 're_test' }), fetcher as unknown as typeof fetch);
    await expect(m.send({ to: 'a@b.nl', subject: 's', text: 't' })).rejects.toThrow('mail-failed');
    expect(String(err.mock.calls[0])).not.toContain('a@b.nl');
  });
});
