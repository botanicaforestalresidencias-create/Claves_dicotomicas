// Cambia VERSION cada vez que modifiques HTML, CSS o JS
const VERSION = 'v6';
const CACHE_APP = `claves-app-${VERSION}`;
const CACHE_DATOS = 'claves-datos'; // se conserva entre versiones

// Carpeta donde vive la app (p. ej. /claves/). Todo se calcula a partir de aquí,
// así funciona igual en localhost:3001/claves/ que en el dominio del herbario.
const BASE = new URL('./', self.location).pathname;

const SHELL = [
  './',
  'index.html',
  'clave.html',
  'login.html',
  'css/estilos.css',
  'css/login.css',
  'js/comun.js',
  'js/lista.js',
  'js/clave.js',
  'js/sesion.js',
  'js/login.js',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png'
].map(ruta => new URL(ruta, self.location).href);

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
    // Solo borra cachés viejas de esta app; el herbario comparte el dominio
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
  if (url.origin !== location.origin || !url.pathname.startsWith(BASE)) return;

  const ruta = url.pathname.slice(BASE.length); // p. ej. "api/claves" o "clave.html"

  // El administrador siempre va directo al servidor
  if (ruta.startsWith('api/admin') || ruta === 'admin.html' || ruta === 'js/admin.js') return;

  if (ruta.startsWith('api/')) {
    event.respondWith(redPrimero(url.origin + url.pathname + url.search));
  } else {
    event.respondWith(cachePrimero(event, url.origin + url.pathname));
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
async function cachePrimero(event, clave) {
  const cache = await caches.open(CACHE_APP);
  const guardada = await cache.match(clave);

  const actualizar = pedir(clave)
    .then(r => {
      if (r.ok) cache.put(clave, r.clone());
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
    return (await cache.match(new URL('index.html', self.location).href)) || Response.error();
  }
  return Response.error();
}