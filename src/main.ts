import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { requestPersistentStorage } from './lib/db/repo';

const app = mount(App, { target: document.getElementById('app')! });

// Best effort: protects local data against browser storage eviction.
requestPersistentStorage().catch(() => {});

export default app;
