import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { requestPersistentStorage } from './lib/db/repo';
import { account, startSync } from './lib/sync/session';

const app = mount(App, { target: document.getElementById('app')! });

// Best effort: protects local data against browser storage eviction (not on shared devices: nothing is on disk).
if (account?.deviceMode !== 'shared') requestPersistentStorage().catch(() => {});

startSync().catch((e) => console.error(e));

export default app;
