/** Turn a one-time support code into a read-only support session in this tab (see worker/src/support.ts). */
import { saveSupportAccount } from './account';
import type { SupportSessionInfo } from './protocol';

export async function startSupportSession(code: string): Promise<void> {
  try {
    const res = await fetch('/api/support/redeem', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-InBalans': '1' },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'error');
    const info = (await res.json()) as SupportSessionInfo;
    saveSupportAccount(info);
    location.reload();
  } catch (e) {
    document.body.innerHTML =
      '<div style="font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem">' +
      '<h1>Meekijken niet gestart</h1><p>De link is verlopen, al gebruikt, of de eigenaar heeft de toestemming ingetrokken. ' +
      'Start meekijken opnieuw vanuit het beheer.</p></div>';
    console.error(e);
  }
}
