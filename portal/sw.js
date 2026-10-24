// Stili Soft: guarda solo la portada para que abra rápido. Los datos siempre van al servicio de Google.
const VERSION = 'portal-v4';
const ARCHIVOS = ['./', './index.html', './manifest.webmanifest', './icono-192.png', './icono-512.png', './favicon.png', './logo.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('portal-') && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || !url.pathname.includes('/portal/')) return;
  if (url.pathname.includes('/recursos/') && !url.pathname.includes('/recursos/mini/')) return;   // los descargables no se guardan en el teléfono
  if (url.pathname.endsWith('/aprobar.html')) return;   // v2.5 · el enlace de aprobación lleva una firma: nunca se guarda
  e.respondWith(fetch(e.request).then(r => { const copia = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copia)); return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
});
