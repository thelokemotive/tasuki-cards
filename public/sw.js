// Tasuki Cards service worker (the website only; the offline single file has none).
// - Makes the site installable and quick to open, even with no signal on the hill: the page and its scripts
//   are kept on the phone. Squad data is not cached here: Firestore keeps its own offline copy.
// - Never touches sign-in or the database: other sites (Microsoft, Google) and Firebase's own /__/ paths
//   pass straight through, except the public web config, which is kept so the app can open offline.
// - Shows trail reminders (web push) and opens the app on the right page when one is tapped.
const SHELL = 'tasuki-shell-v1';
const ASSETS = 'tasuki-assets';
const PRECACHE = ['./', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/badge-96.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(req, key) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch(req);
    if (res.ok) await cache.put(key, res.clone());
    return res;
  } catch {
    const hit = await cache.match(key);
    if (hit) return hit;
    throw new Error('offline');
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    await cache.put(req, res.clone());
    // Built files have hashed names, so old ones pile up across releases: keep the newest 60.
    const keys = await cache.keys();
    await Promise.all(keys.slice(0, Math.max(0, keys.length - 60)).map((k) => cache.delete(k)));
  }
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/__/firebase/init.json') return e.respondWith(networkFirst(req, req));
  if (url.pathname.startsWith('/__/')) return;
  if (req.mode === 'navigate') return e.respondWith(networkFirst(req, './'));
  if (url.pathname.includes('/assets/')) return e.respondWith(cacheFirst(req));
  if (url.pathname.includes('/icons/') || url.pathname.endsWith('.webmanifest')) return e.respondWith(networkFirst(req, req));
});

self.addEventListener('push', (e) => {
  let data = {};
  try {
    data = e.data ? e.data.json() : {};
  } catch {
    data = { body: e.data ? e.data.text() : '' };
  }
  const shown = self.registration.showNotification(data.title || 'Tasuki', {
    body: data.body || '',
    tag: data.tag || 'tasuki',
    icon: './icons/icon-192.png',
    badge: './icons/badge-96.png',
    data: { url: data.url || './#/' },
  });
  const dot = data.badge && self.navigator.setAppBadge ? self.navigator.setAppBadge(1).catch(() => undefined) : undefined;
  e.waitUntil(Promise.all([shown, dot]));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || './#/', self.registration.scope).href;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.registration.scope) && 'focus' in c) {
          if ('navigate' in c) c.navigate(target).catch(() => undefined);
          return c.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
