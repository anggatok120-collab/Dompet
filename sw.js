// ============================================
// Dompet PWA — Service Worker
// Versi cache: update angka ini setiap deploy baru
// ============================================
const CACHE_NAME = 'dompet-v1';

// File yang di-cache untuk offline
const OFFLINE_FILES = [
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap'
];

// ===== INSTALL: cache semua file penting =====
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Caching offline files...');
      // Cache satu per satu agar tidak gagal semua kalau satu error
      return Promise.allSettled(
        OFFLINE_FILES.map(url => cache.add(url).catch(e => console.warn('[SW] Skip:', url, e)))
      );
    }).then(() => self.skipWaiting())
  );
});

// ===== ACTIVATE: hapus cache lama =====
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ===== FETCH: strategi Cache First untuk file lokal, Network First untuk API =====
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Google Sheets API — selalu network, fallback offline message
  if (url.hostname === 'script.google.com') {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({
          status: 'offline',
          message: 'Tidak ada koneksi internet. Data akan disinkronkan saat online.',
          data: []
        }), { headers: { 'Content-Type': 'application/json' } })
      )
    );
    return;
  }

  // Google Fonts — cache first
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(event.request).then(cached => cached ||
        fetch(event.request).then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return res;
        })
      )
    );
    return;
  }

  // File app sendiri — cache first, lalu network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        if (res && res.status === 200 && res.type !== 'opaque') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});

// ===== BACKGROUND SYNC: sync pending transactions saat online lagi =====
self.addEventListener('sync', event => {
  if (event.tag === 'sync-transactions') {
    event.waitUntil(syncPendingData());
  }
});

async function syncPendingData() {
  // Kirim pesan ke app untuk trigger sync
  const clients = await self.clients.matchAll();
  clients.forEach(client => client.postMessage({ type: 'SYNC_NOW' }));
}
