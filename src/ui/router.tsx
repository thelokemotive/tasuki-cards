// Minimal hash router: works when the single-file build is opened straight from disk (file://).
import { useEffect, useState, type AnchorHTMLAttributes, type ReactNode } from 'react';

export interface Route {
  /** First path segment, e.g. 'athlete' for '#/athlete/abc' */
  page: string;
  /** Remaining segments */
  params: string[];
  /** Parsed ?query */
  query: URLSearchParams;
  path: string;
}

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '') || '/';
  const [pathPart, queryPart = ''] = raw.split('?');
  const segs = pathPart.split('/').filter(Boolean).map(decodeURIComponent);
  return { page: segs[0] ?? 'home', params: segs.slice(1), query: new URLSearchParams(queryPart), path: pathPart || '/' };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

/** navigate('/athlete/abc') */
export function navigate(path: string): void {
  window.location.hash = path.startsWith('#') ? path : `#${path.startsWith('/') ? path : `/${path}`}`;
}

export function href(path: string): string {
  return `#${path.startsWith('/') ? path : `/${path}`}`;
}

export function Link({ to, children, ...rest }: { to: string; children: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a href={href(to)} {...rest}>
      {children}
    </a>
  );
}
