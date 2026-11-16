const parametros = new URLSearchParams(location.search);
const pideAdmin = parametros.has('admin');
const $ = id => document.getElementById(id);
const reducirMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ================= Sesión actual ================= */

(function revisarSesionActual() {
  const s = leerSesion();
  if (!s) return;
  if (s.tipo === 'admin') location.replace('/admin.html');
  else if (!pideAdmin) location.replace('/');
})();

if (parametros.has('expirada')) {
  const aviso = $('aviso-login');
  aviso.textContent = 'Tu sesión de administrador expiró. Vuelve a iniciar sesión.';
  aviso.classList.remove('oculto');
}

/* ================= Pestañas ================= */

const selector = document.querySelector('.selector');
const pestanas = { alumno: $('pest-alumno'), admin: $('pest-admin') };
const paneles = { alumno: $('tab-alumno'), admin: $('tab-admin') };

function activarPestana(nombre, enfocar = false) {
  const anterior = selector.dataset.activa || 'alumno';
  selector.dataset.activa = nombre;

  for (const clave of ['alumno', 'admin']) {
    const activa = clave === nombre;
    pestanas[clave].setAttribute('aria-selected', activa);
    pestanas[clave].tabIndex = activa ? 0 : -1;
    paneles[clave].hidden = !activa;
    paneles[clave].classList.toggle('activa', activa);
  }
  // La animación entra desde el lado de la pestaña elegida
  paneles[nombre].style.setProperty('--desde', nombre === 'admin' ? '14px' : '-14px');
  if (anterior !== nombre) {
    paneles[nombre].classList.remove('activa');
    void paneles[nombre].offsetWidth;
    paneles[nombre].classList.add('activa');
  }

  if (enfocar) pestanas[nombre].focus();
  if (nombre === 'admin') setTimeout(() => $('usuario').focus({ preventScroll: true }), 50);
}

selector.addEventListener('click', e => {
  const boton = e.target.closest('[data-tab]');
  if (boton) activarPestana(boton.dataset.tab);
});

// Flechas izquierda/derecha entre pestañas (accesibilidad)
selector.addEventListener('keydown', e => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  e.preventDefault();
  activarPestana(selector.dataset.activa === 'admin' ? 'alumno' : 'admin', true);
});

activarPestana(pideAdmin ? 'admin' : 'alumno');

/* ================= Efectos ================= */

function onda(boton, e) {
  if (reducirMovimiento) return;
  const r = boton.getBoundingClientRect();
  const tam = Math.max(r.width, r.height);
  const span = document.createElement('span');
  span.className = 'onda';
  span.style.width = span.style.height = tam + 'px';
  const x = (e && e.clientX ? e.clientX : r.left + r.width / 2) - r.left - tam / 2;
  const y = (e && e.clientY ? e.clientY : r.top + r.height / 2) - r.top - tam / 2;
  span.style.left = x + 'px';
  span.style.top = y + 'px';
  boton.appendChild(span);
  setTimeout(() => span.remove(), 650);
}

function salirHacia(url) {
  $('login-card').classList.add('saliendo');
  setTimeout(() => location.replace(url), reducirMovimiento ? 0 : 380);
}

function agitar(elemento) {
  elemento.classList.remove('agitar');
  void elemento.offsetWidth;
  elemento.classList.add('agitar');
}

/* ================= Alumno ================= */

$('btn-alumno').addEventListener('click', e => {
  onda(e.currentTarget, e);
  guardarSesion({ tipo: 'alumno' });
  salirHacia('/');
});

/* ================= Administrador ================= */

$('ver-password').addEventListener('click', () => {
  const campo = $('password');
  const mostrar = campo.type === 'password';
  campo.type = mostrar ? 'text' : 'password';
  $('ver-password').setAttribute('aria-pressed', mostrar);
  $('ver-password').setAttribute('aria-label', mostrar ? 'Ocultar contraseña' : 'Mostrar contraseña');
  campo.focus();
});

function revisarMayus(e) {
  if (typeof e.getModifierState === 'function') {
    $('aviso-mayus').hidden = !e.getModifierState('CapsLock');
  }
}
$('password').addEventListener('keydown', revisarMayus);
$('password').addEventListener('keyup', revisarMayus);
$('password').addEventListener('blur', () => { $('aviso-mayus').hidden = true; });

['usuario', 'password'].forEach(id => {
  $(id).addEventListener('input', () => {
    $(id).parentElement.classList.remove('invalido');
    $('login-error').textContent = '';
  });
});

$('form-admin').addEventListener('submit', async e => {
  e.preventDefault();
  const error = $('login-error');
  const boton = $('btn-admin');
  const texto = boton.querySelector('.texto-boton');
  const usuario = $('usuario').value.trim();
  const password = $('password').value;
  error.textContent = '';

  if (!usuario || !password) {
    if (!usuario) $('usuario').parentElement.classList.add('invalido');
    if (!password) $('password').parentElement.classList.add('invalido');
    error.textContent = 'Escribe tu usuario y contraseña.';
    agitar($('form-admin'));
    return;
  }
  if (!navigator.onLine) {
    error.textContent = 'Necesitas internet para entrar como administrador.';
    return;
  }

  onda(boton);
  boton.disabled = true;
  boton.classList.add('cargando');
  texto.textContent = 'Verificando';

  try {
    const r = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { ...API_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, password })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'No se pudo iniciar sesión');

    guardarSesion({ tipo: 'admin', token: data.token, nombre: data.nombre });
    boton.classList.remove('cargando');
    boton.classList.add('exito');
    texto.textContent = `✓ Bienvenida(o), ${data.nombre.split(' ')[0]}`;
    setTimeout(() => salirHacia('/admin.html'), reducirMovimiento ? 0 : 450);
  } catch (err) {
    error.textContent = err.message === 'Failed to fetch'
      ? 'No se pudo conectar con el servidor.'
      : err.message;
    $('password').value = '';
    $('password').parentElement.classList.add('invalido');
    agitar($('form-admin'));
    $('password').focus();
    boton.disabled = false;
    boton.classList.remove('cargando');
    texto.textContent = 'Iniciar sesión';
  }
});

/* ================= Árbol dicotómico animado ================= */

const SVG = 'http://www.w3.org/2000/svg';
const arbol = $('arbol');

// Árbol binario de 3 niveles: 7 dilemas y 8 especies
const RAIZ_Y = 292;
const NIVELES_Y = [248, 186, 124];
const HOJAS_Y = 92;

function construirArbol() {
  let contador = 0;
  function nodo(nivel, xMin, xMax) {
    const x = (xMin + xMax) / 2;
    if (nivel === 3) return { hoja: true, x, y: HOJAS_Y, nivel };
    const n = { numero: ++contador, x, y: NIVELES_Y[nivel], nivel };
    n.izq = nodo(nivel + 1, xMin, x);
    n.der = nodo(nivel + 1, x, xMax);
    return n;
  }
  return nodo(0, 0, 360);
}

const raiz = construirArbol();

function crear(tag, attrs, padre) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (padre) padre.appendChild(el);
  return el;
}

const hojas = [];

function dibujar() {
  const gRamas = crear('g', {}, arbol);
  const gNodos = crear('g', {}, arbol);
  const gHojas = crear('g', {}, arbol);
  crear('g', { id: 'capa-ruta' }, arbol);

  const paso = 0.32; // segundos entre niveles
  crear('path', {
    d: `M${raiz.x} ${RAIZ_Y} V${raiz.y}`,
    class: 'rama', pathLength: 1, style: '--d:0s'
  }, gRamas);

  (function recorrer(n) {
    const d = 0.25 + n.nivel * paso;
    if (n.hoja) {
      const h = crear('path', {
        d: `M${n.x} ${n.y} c 7 -7 7 -18 0 -26 c -7 8 -7 19 0 26 z M${n.x} ${n.y} v -20`,
        class: 'hoja', style: `--d:${(d + 0.15).toFixed(2)}s`
      }, gHojas);
      hojas.push({ nodo: n, el: h });
      return;
    }
    for (const hijo of [n.izq, n.der]) {
      crear('path', {
        d: `M${n.x} ${n.y} H${hijo.x} V${hijo.y}`,
        class: 'rama', pathLength: 1, style: `--d:${d.toFixed(2)}s`
      }, gRamas);
      recorrer(hijo);
    }
    crear('circle', { cx: n.x, cy: n.y, r: 9, class: 'nodo', style: `--d:${(d - 0.1).toFixed(2)}s` }, gNodos);
    const t = crear('text', { x: n.x, y: n.y + 0.5, class: 'nodo-num', style: `--d:${(d - 0.1).toFixed(2)}s` }, gNodos);
    t.textContent = n.numero;
  })(raiz);
}

// Recorre una ruta al azar, como lo haría un alumno al usar la clave
function rutaAlAzar() {
  const puntos = [`M${raiz.x} ${RAIZ_Y} V${raiz.y}`];
  const etiquetas = [];
  let n = raiz;
  while (!n.hoja) {
    const derecha = Math.random() < 0.5;
    etiquetas.push(derecha ? n.numero + '′' : String(n.numero));
    const hijo = derecha ? n.der : n.izq;
    puntos.push(`H${hijo.x} V${hijo.y}`);
    n = hijo;
  }
  return { d: puntos.join(' '), etiquetas, hoja: n };
}

function animarRuta() {
  const capa = $('capa-ruta');
  const caption = $('arbol-ruta');
  const { d, etiquetas, hoja } = rutaAlAzar();

  capa.innerHTML = '';
  hojas.forEach(h => h.el.classList.remove('elegida'));
  const linea = crear('path', { d, class: 'ruta-activa', pathLength: 1 }, capa);

  caption.style.opacity = 0;
  setTimeout(() => {
    caption.innerHTML = `Ruta <strong>${etiquetas.join(' → ')}</strong> · determinación de una especie`;
    caption.style.opacity = 1;
  }, 300);

  setTimeout(() => {
    const h = hojas.find(x => x.nodo === hoja);
    if (h) h.el.classList.add('elegida');
  }, 1500);

  setTimeout(() => linea.classList.add('desvanecer'), 3600);
}

dibujar();
if (reducirMovimiento) {
  $('arbol-ruta').innerHTML = 'Cada dilema separa dos opciones hasta llegar a la especie';
} else {
  setTimeout(() => {
    animarRuta();
    setInterval(animarRuta, 4400);
  }, 1900);
}

/* ================= Cifras del catálogo ================= */

function contar(el, hasta) {
  if (reducirMovimiento || hasta === 0) { el.textContent = hasta; return; }
  const inicio = performance.now();
  const dur = 1100;
  (function cuadro(t) {
    const p = Math.min(1, (t - inicio) / dur);
    el.textContent = Math.round(hasta * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(cuadro);
  })(inicio);
}

(async function cargarCifras() {
  try {
    const claves = await api('/api/claves');
    const especies = new Set();
    claves.forEach(c => (c.especies ? c.especies.split('|') : []).forEach(e => especies.add(e)));
    setTimeout(() => {
      contar($('cifra-claves'), claves.length);
      contar($('cifra-especies'), especies.size);
    }, 900);
  } catch (e) {
    document.querySelector('.hero-cifras').hidden = true;
  }
})();