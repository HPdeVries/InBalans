/**
 * Entry point. A link from the admin environment (#/support?code=…) is exchanged for a read-only support
 * session first; the app itself is loaded afterwards, so its database opens for the right account.
 */
const SUPPORT_LINK = /^#\/support\?code=([\w-]+)$/;

async function redeemSupportLink(): Promise<boolean> {
  const match = location.hash.match(SUPPORT_LINK);
  if (!match) return false;
  history.replaceState(null, '', location.pathname); // never keep the code in the address bar or history
  const { startSupportSession } = await import('./lib/sync/supportLink');
  await startSupportSession(match[1]);
  return true;
}

if (!(await redeemSupportLink())) await import('./boot');
