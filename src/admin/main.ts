import { mount } from 'svelte';
import '../app.css';
import Admin from './Admin.svelte';

export default mount(Admin, { target: document.getElementById('admin')! });
