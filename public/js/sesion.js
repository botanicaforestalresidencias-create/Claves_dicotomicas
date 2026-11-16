// Manejo de sesión en el navegador.
// Alumno: { tipo: 'alumno' }  ·  Administrador: { tipo: 'admin', token, nombre }
const CLAVE_SESION = 'claves_sesion';

function leerSesion() {
  try { return JSON.parse(localStorage.getItem(CLAVE_SESION)); }
  catch (e) { return null; }
}

function guardarSesion(sesion) {
  try {
    if (sesion) localStorage.setItem(CLAVE_SESION, JSON.stringify(sesion));
    else localStorage.removeItem(CLAVE_SESION);
  } catch (e) { /* sin almacenamiento disponible */ }
}

function irALogin(parametros = '') {
  location.replace('/login.html' + parametros);
}

// requiere: 'cualquiera' (alumno o admin) o 'admin'
function exigirSesion(requiere) {
  const s = leerSesion();
  if (!s) { irALogin(requiere === 'admin' ? '?admin=1' : ''); return null; }
  if (requiere === 'admin' && s.tipo !== 'admin') { irALogin('?admin=1'); return null; }
  return s;
}

async function cerrarSesion() {
  const s = leerSesion();
  if (s && s.tipo === 'admin' && s.token) {
    try {
      await fetch('/api/admin/logout', {
        method: 'POST',
        headers: { 'ngrok-skip-browser-warning': '1', 'Authorization': 'Bearer ' + s.token }
      });
    } catch (e) { /* sin conexión: igual se cierra en este dispositivo */ }
  }
  guardarSesion(null);
  irALogin();
}

// Pinta "Alumno · Cerrar sesión" (o el nombre del administrador) en el encabezado
function pintarBarraSesion(opciones = {}) {
  const cont = document.getElementById('barra-sesion');
  const s = leerSesion();
  if (!cont || !s) return;

  const escapar = t => String(t ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  const partes = [`<span class="sesion-quien">${
    s.tipo === 'admin' ? escapar(s.nombre || 'Administrador') : 'Alumno'
  }</span>`];

  if (s.tipo === 'admin' && opciones.enlaceAdmin !== false) {
    partes.push('<a href="/admin.html">Administrar</a>');
  }
  if (opciones.enlaceCatalogo) {
    partes.push('<a href="/">Ver catálogo</a>');
  }
  partes.push('<button type="button" class="enlace-sesion" id="btn-cerrar-sesion">Cerrar sesión</button>');

  cont.innerHTML = partes.join('<span class="sep">·</span>');
  document.getElementById('btn-cerrar-sesion').addEventListener('click', () => {
    if (typeof opciones.antesDeSalir === 'function' && !opciones.antesDeSalir()) return;
    cerrarSesion();
  });
}

// Revisión inmediata, antes de que se pinte la página:
// <script src="/js/sesion.js" data-requiere="cualquiera"></script>
(function () {
  const script = document.currentScript;
  const requiere = script && script.dataset.requiere;
  if (requiere) exigirSesion(requiere);
})();
