import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { requestPersisted, watchInstall } from './lib/platform/platform';
import { account, detectSyncAvailable, startSync } from './lib/sync/session';
import { lockSupported, startAutoLock } from './lib/security/lock';
import { t } from './lib/i18n';

const app = mount(App, { target: document.getElementById('app')! });

// Best effort: protects local data against browser storage eviction (not on shared devices: nothing is on disk).
if (account?.deviceMode !== 'shared') void requestPersisted();
watchInstall();

// Remote support is read-only: a refused save shows a message instead of failing silently.
if (account?.support) {
  window.addEventListener('unhandledrejection', (e) => {
    if (e.reason instanceof Error && e.reason.message === 'read-only') {
      e.preventDefault();
      alert(t('support.readOnly'));
    }
  });
}

startSync().catch((e) => console.error(e));
void detectSyncAvailable();
if (lockSupported) startAutoLock();

export default app;
