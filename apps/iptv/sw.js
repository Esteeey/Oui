// Met en cache l'interface (pas les flux) pour un démarrage instantané.
const C = 'ouitv-v2', A = ['./', 'index.html', 'style.css', 'app.js', 'icon.svg', 'manifest.webmanifest'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(C).then((c) => c.addAll(A))));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || u.pathname === '/proxy' || u.pathname === '/config.js') return;
  e.respondWith(fetch(e.request).then((r) => { caches.open(C).then((c) => c.put(e.request, r.clone())); return r; }).catch(() => caches.match(e.request)));
});
