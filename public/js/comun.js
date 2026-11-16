// Utilidades compartidas por todas las pantallas
const API_HEADERS = { 'ngrok-skip-browser-warning': '1' };

async function api(ruta) {
  const r = await fetch(ruta, { headers: API_HEADERS });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

// "Hesperocyparis arizonica" → "H. arizonica"
function abreviar(especie) {
  const partes = String(especie || '').trim().split(/\s+/);
  if (partes.length < 2) return especie;
  return partes[0][0] + '. ' + partes.slice(1).join(' ');
}

// Pone en cursiva el nombre del género dentro de un título
function tituloConCursiva(titulo, grupo) {
  const t = esc(titulo);
  if (!grupo) return t;
  const g = esc(grupo);
  return t.split(g).join(`<em>${g}</em>`);
}

function actualizarEstadoRed() {
  document.body.classList.toggle('sin-red', !navigator.onLine);
}
window.addEventListener('online', actualizarEstadoRed);
window.addEventListener('offline', actualizarEstadoRed);
actualizarEstadoRed();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err =>
      console.warn('No se registró el service worker:', err));
  });
}