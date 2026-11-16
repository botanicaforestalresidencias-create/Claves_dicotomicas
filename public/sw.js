// Cambia VERSION cada vez que modifiques HTML, CSS o JS
const VERSION = 'v5';
const CACHE_APP = `claves-app-${VERSION}`;
const CACHE_DATOS = 'claves-datos'; // se conserva entre versiones

const SHELL = [
  '/',
  '/index.html',
  '/clave.html',
  '/login.html',
  '/css/estilos.css',
  '/css/login.css',
  '/js/comun.js',
  '/js/lista.js',
  '/js/clave.js',
  '/js/sesion.js',
  '/js/login.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

const CABECERAS = { 'ngrok-skip-browser-warning': '1' };

function pedir(url) {
  return fetch(url, { headers: CABECERAS, cache: 'no-store' });
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_APP);
    for (const url of SHELL) {
      try {
        const r = await pedir(url);
        if (r.ok) await cache.put(url, r);
      } catch (e) { /* se reintenta en la siguiente visita */ }
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const nombres = await caches.keys();
    await Promise.all(nombres
      .filter(n => n.startsWith('claves-app-') && n !== CACHE_APP)
      .map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // El administrador siempre va directo al servidor
  if (url.pathname.startsWith('/api/admin') || url.pathname === '/admin.html' || url.pathname === '/js/admin.js') return;

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(redPrimero(url.pathname + url.search));
  } else {
    event.respondWith(cachePrimero(event, url.pathname));
  }
});

// API: primero internet; si falla, lo guardado
async function redPrimero(clave) {
  const cache = await caches.open(CACHE_DATOS);
  try {
    const r = await pedir(clave);
    const esJson = (r.headers.get('content-type') || '').includes('application/json');
    if (r.ok && esJson) {
      await cache.put(clave, r.clone());
      return r;
    }
    return (await cache.match(clave)) || r;
  } catch (e) {
    const guardada = await cache.match(clave);
    return guardada || new Response(JSON.stringify({ error: 'Sin conexión' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Archivos de la app: responde con caché y actualiza en segundo plano.
// Se usa solo la ruta (sin ?id=...) para que clave.html sirva a todas las claves.
async function cachePrimero(event, ruta) {
  const cache = await caches.open(CACHE_APP);
  const guardada = await cache.match(ruta);

  const actualizar = pedir(ruta)
    .then(r => {
      if (r.ok) cache.put(ruta, r.clone());
      return r;
    })
    .catch(() => null);

  if (guardada) {
    event.waitUntil(actualizar);
    return guardada;
  }

  const r = await actualizar;
  if (r) return r;
  if (event.request.mode === 'navigate') {
    return (await cache.match('/index.html')) || Response.error();
  }
  return Response.error();
}