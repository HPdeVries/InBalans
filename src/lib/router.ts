import { readable } from 'svelte/store';

export interface Route {
  path: string;
  params: URLSearchParams;
}

function parse(): Route {
  const hash = location.hash.replace(/^#/, '') || '/';
  const [path, query = ''] = hash.split('?');
  return { path, params: new URLSearchParams(query) };
}

/** Minimal hash router: works offline and from any static host without server rewrites. */
export const route = readable<Route>(parse(), (set) => {
  const update = () => {
    set(parse());
    window.scrollTo(0, 0);
  };
  window.addEventListener('hashchange', update);
  return () => window.removeEventListener('hashchange', update);
});

export function navigate(path: string): void {
  location.hash = path;
}

export function back(fallback: string): void {
  if (history.length > 1) history.back();
  else navigate(fallback);
}
