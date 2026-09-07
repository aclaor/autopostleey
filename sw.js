/* Autopostleey service worker
   ---------------------------------------------------------------
   Deliberately NETWORK-FIRST for pages.

   The obvious way to write this is cache-first, because it makes the app
   open instantly. It is also how you ship a bug that cannot be fixed: the
   phone keeps serving yesterday's dashboard.html no matter how many times
   you deploy, and nothing you change reaches anyone.

   So: always try the network, fall back to the cache only when the phone is
   actually offline. Slightly slower to open, always the newest build.
*/
const VERSION = 'ap-2026-09-07-1';
const SHELL = 'shell-' + VERSION;
const OFFLINE_URL = '/offline.html';

const PRECACHE = ['/offline.html', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(SHELL)
      .then(function (c) { return c.addAll(PRECACHE); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== SHELL) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never touch anything that isn't ours: the worker API, Supabase, R2,
  // fonts, CDNs. Caching those would serve stale data and break uploads.
  if (url.origin !== self.location.origin) return;

  // Pages: network first, cache as a backup, offline page as last resort.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        const copy = res.clone();
        caches.open(SHELL).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || caches.match(OFFLINE_URL);
        });
      })
    );
    return;
  }

  // Our own images and icons: cache first, they rarely change.
  if (req.destination === 'image') {
    e.respondWith(
      caches.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) {
          const copy = res.clone();
          caches.open(SHELL).then(function (c) { c.put(req, copy); });
          return res;
        }).catch(function () { return hit; });
      })
    );
  }
});

// Lets the page tell a waiting worker to take over immediately.
self.addEventListener('message', function (e) {
  if (e.data === 'skip-waiting') self.skipWaiting();
});
