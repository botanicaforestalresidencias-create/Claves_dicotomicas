const $ = id => document.getElementById(id);
const CLAVE_TOKEN = 'claves_admin_token';

let token = null;
try { token = sessionStorage.getItem(CLAVE_TOKEN); } catch (e) { /* sin almacenamiento */ }

let editor = null; // { id, dilemas: [{ paso, a, b }], sucio }

/* ================= Utilidades ================= */

function mostrarVista(nombre) {
  ['login', 'lista', 'editor'].forEach(v =>
    $('vista-' + v).classList.toggle('oculto', v !== nombre));
  $('btn-salir').classList.toggle('oculto', nombre === 'login');
  window.scrollTo(0, 0);
}

function avisar(mensaje, tipo = 'ok') {
  const t = $('toast');
  t.textContent = mensaje;
  t.className = 'toast visible ' + tipo;
  clearTimeout(avisar.tiempo);
  avisar.tiempo = setTimeout(() => { t.className = 'toast'; }, 3500);
}

function guardarToken(valor) {
  token = valor;
  try {
    if (valor) sessionStorage.setItem(CLAVE_TOKEN, valor);
    else sessionStorage.removeItem(CLAVE_TOKEN);
  } catch (e) { /* sin almacenamiento */ }
}

async function apiAdmin(metodo, ruta, cuerpo) {
  const r = await fetch(ruta, {
    method: metodo,
    headers: {
      ...API_HEADERS,
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) {
    cerrarSesion('La sesión expiró. Vuelve a entrar.');
    throw new Error('401');
  }
  if (!r.ok) {
    const e = new Error(data.error || 'Error ' + r.status);
    e.errores = data.errores;
    throw e;
  }
  return data;
}

/* ================= Sesión ================= */

$('form-login').addEventListener('submit', async e => {
  e.preventDefault();
  $('login-error').textContent = '';
  try {
    const r = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { ...API_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: $('password').value })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'No se pudo iniciar sesión');
    guardarToken(data.token);
    $('password').value = '';
    cargarLista();
  } catch (err) {
    $('login-error').textContent = err.message;
  }
});

function cerrarSesion(mensaje) {
  if (token) {
    fetch('/api/admin/logout', {
      method: 'POST',
      headers: { ...API_HEADERS, 'Authorization': 'Bearer ' + token }
    }).catch(() => {});
  }
  guardarToken(null);
  editor = null;
  $('login-error').textContent = mensaje || '';
  mostrarVista('login');
  $('password').focus();
}

$('btn-salir').addEventListener('click', () => {
  if (editor && editor.sucio && !confirm('Hay cambios sin guardar. ¿Cerrar sesión de todos modos?')) return;
  cerrarSesion();
});

/* ================= Lista ================= */

async function cargarLista() {
  editor = null;
  mostrarVista('lista');
  const ul = $('admin-lista');
  ul.innerHTML = '<li class="vacio">Cargando…</li>';
  try {
    const claves = await api('/api/claves');
    if (!claves.length) {
      ul.innerHTML = '<li class="vacio">Aún no hay claves. Crea la primera con “Nueva clave”.</li>';
      return;
    }
    ul.innerHTML = claves.map(c => {
      const n = c.especies ? c.especies.split('|').length : 0;
      return `<li class="admin-fila">
        <div class="admin-fila-texto">
          ${c.grupo ? `<span class="entrada-grupo">${esc(c.grupo)}</span>` : ''}
          <h3>${tituloConCursiva(c.titulo, c.grupo)}</h3>
          <span class="meta">${n} ${n === 1 ? 'especie' : 'especies'}</span>
        </div>
        <div class="grupo-botones">
          <a class="boton" href="/clave.html?id=${c.id}" target="_blank" rel="noopener">Ver</a>
          <button class="boton" type="button" data-editar="${c.id}">Editar</button>
          <button class="boton peligro" type="button" data-eliminar="${c.id}"
                  data-titulo="${esc(c.titulo)}">Eliminar</button>
        </div>
      </li>`;
    }).join('');
  } catch (err) {
    ul.innerHTML = `<li class="vacio">No se pudo cargar la lista (${esc(err.message)}).</li>`;
  }
}

$('admin-lista').addEventListener('click', async e => {
  const editar = e.target.closest('[data-editar]');
  const eliminar = e.target.closest('[data-eliminar]');

  if (editar) {
    try {
      const data = await api('/api/claves/' + editar.dataset.editar);
      abrirEditor(data);
    } catch (err) {
      avisar('No se pudo abrir la clave', 'error');
    }
  }

  if (eliminar) {
    const titulo = eliminar.dataset.titulo;
    if (!confirm(`¿Eliminar “${titulo}”?\nEsta acción no se puede deshacer.`)) return;
    try {
      await apiAdmin('DELETE', '/api/admin/claves/' + eliminar.dataset.eliminar);
      avisar('Clave eliminada');
      cargarLista();
    } catch (err) {
      if (err.message !== '401') avisar(err.message, 'error');
    }
  }
});

$('btn-nueva').addEventListener('click', () => abrirEditor(null));

/* ================= Editor ================= */

function nuevaOpcion() {
  return { descripcion: '', tipo: 'dilema', siguiente: '', especie: '' };
}

function etiquetaOp(paso, v) {
  const n = paso === '' || paso == null || Number.isNaN(paso) ? '?' : paso;
  return v === 'a' ? `${n}` : `${n}′`;
}

function abrirEditor(data) {
  editor = { id: data ? data.clave.id : null, dilemas: [], sucio: false };

  $('f-titulo').value = data ? data.clave.titulo || '' : '';
  $('f-grupo').value = data ? data.clave.grupo || '' : '';
  $('f-descripcion').value = data ? data.clave.descripcion || '' : '';

  if (data) {
    const mapa = new Map();
    for (const o of data.opciones) {
      if (!mapa.has(o.paso)) mapa.set(o.paso, { paso: o.paso, a: nuevaOpcion(), b: nuevaOpcion() });
      mapa.get(o.paso)[o.variante] = {
        descripcion: o.descripcion || '',
        tipo: o.siguiente_paso != null ? 'dilema' : 'especie',
        siguiente: o.siguiente_paso != null ? String(o.siguiente_paso) : '',
        especie: o.especie || ''
      };
    }
    editor.dilemas = [...mapa.values()].sort((x, y) => x.paso - y.paso);
  } else {
    editor.dilemas = [{ paso: 1, a: nuevaOpcion(), b: nuevaOpcion() }];
  }

  actualizarCabeceraEditor();
  pintarDilemas();
  validar();
  mostrarVista('editor');
}

function actualizarCabeceraEditor() {
  $('editor-titulo').textContent = editor.id ? 'Editar clave' : 'Nueva clave';
  const ver = $('btn-ver');
  ver.classList.toggle('oculto', !editor.id);
  if (editor.id) ver.href = '/clave.html?id=' + editor.id;
}

function filaOpcion(d, v) {
  const o = d[v];
  return `<div class="ed-opcion" data-v="${v}">
    <span class="ed-num">${etiquetaOp(d.paso, v)}</span>
    <div class="ed-campos">
      <textarea data-campo="descripcion" rows="2"
                placeholder="Carácter que describe esta opción">${esc(o.descripcion)}</textarea>
      <div class="ed-destino">
        <select data-campo="tipo">
          <option value="dilema" ${o.tipo === 'dilema' ? 'selected' : ''}>Lleva al dilema</option>
          <option value="especie" ${o.tipo === 'especie' ? 'selected' : ''}>Termina en la especie</option>
        </select>
        <input data-campo="siguiente" type="number" min="1" placeholder="N.º"
               value="${esc(o.siguiente)}" class="ed-siguiente ${o.tipo === 'dilema' ? '' : 'oculto'}">
        <input data-campo="especie" type="text" placeholder="Género especie"
               value="${esc(o.especie)}" class="ed-especie ${o.tipo === 'especie' ? '' : 'oculto'}">
      </div>
    </div>
  </div>`;
}

function pintarDilemas() {
  if (!editor.dilemas.length) {
    $('dilemas').innerHTML = '<p class="vacio">No hay dilemas. Agrega el primero.</p>';
    return;
  }
  $('dilemas').innerHTML = editor.dilemas.map((d, i) => `
    <div class="ed-dilema" data-i="${i}">
      <div class="ed-dilema-enc">
        <label>Dilema
          <input class="ed-paso" type="number" min="1" data-campo="paso" value="${esc(d.paso)}">
        </label>
        <button type="button" class="boton-texto peligro" data-accion="quitar">Eliminar dilema</button>
      </div>
      ${filaOpcion(d, 'a')}
      ${filaOpcion(d, 'b')}
    </div>`).join('');
}

function marcarSucio() {
  if (editor) editor.sucio = true;
  clearTimeout(marcarSucio.tiempo);
  marcarSucio.tiempo = setTimeout(validar, 250);
}

['f-titulo', 'f-grupo', 'f-descripcion'].forEach(id =>
  $(id).addEventListener('input', marcarSucio));

$('dilemas').addEventListener('input', e => {
  const campo = e.target.dataset.campo;
  if (!campo) return;
  const tarjeta = e.target.closest('.ed-dilema');
  const d = editor.dilemas[tarjeta.dataset.i];

  if (campo === 'paso') {
    d.paso = e.target.value === '' ? '' : Number(e.target.value);
    tarjeta.querySelectorAll('.ed-opcion').forEach(f => {
      f.querySelector('.ed-num').textContent = etiquetaOp(d.paso, f.dataset.v);
    });
  } else {
    const fila = e.target.closest('.ed-opcion');
    d[fila.dataset.v][campo] = e.target.value;
    if (campo === 'tipo') {
      fila.querySelector('.ed-siguiente').classList.toggle('oculto', e.target.value !== 'dilema');
      fila.querySelector('.ed-especie').classList.toggle('oculto', e.target.value !== 'especie');
    }
  }
  marcarSucio();
});

$('dilemas').addEventListener('click', e => {
  const boton = e.target.closest('[data-accion="quitar"]');
  if (!boton) return;
  const i = Number(boton.closest('.ed-dilema').dataset.i);
  const d = editor.dilemas[i];
  const tieneTexto = d.a.descripcion || d.b.descripcion;
  if (tieneTexto && !confirm(`¿Eliminar el dilema ${d.paso}?`)) return;
  editor.dilemas.splice(i, 1);
  pintarDilemas();
  marcarSucio();
});

$('btn-agregar').addEventListener('click', () => {
  const numeros = editor.dilemas.map(d => Number(d.paso)).filter(Number.isInteger);
  const paso = numeros.length ? Math.max(...numeros) + 1 : 1;
  editor.dilemas.push({ paso, a: nuevaOpcion(), b: nuevaOpcion() });
  pintarDilemas();
  marcarSucio();
  const ultima = $('dilemas').lastElementChild;
  ultima.scrollIntoView({ behavior: 'smooth', block: 'center' });
  ultima.querySelector('textarea').focus({ preventScroll: true });
});

$('btn-volver').addEventListener('click', () => {
  if (editor && editor.sucio && !confirm('Hay cambios sin guardar. ¿Salir de todos modos?')) return;
  cargarLista();
});

/* ================= Validación y guardado ================= */

function aOpciones() {
  const opciones = [];
  for (const d of editor.dilemas) {
    for (const v of ['a', 'b']) {
      const o = d[v];
      const siguiente = String(o.siguiente).trim();
      const especie = o.especie.trim();
      opciones.push({
        paso: d.paso === '' ? NaN : Number(d.paso),
        variante: v,
        descripcion: o.descripcion.trim(),
        siguiente_paso: o.tipo === 'dilema' && siguiente !== '' ? Number(siguiente) : null,
        especie: o.tipo === 'especie' && especie ? especie : null
      });
    }
  }
  return opciones;
}

function pintarValidacion(errores, avisos, resumen) {
  let html = '';
  if (errores.length) {
    html += `<div class="val-error"><strong>Hay que corregir antes de guardar:</strong>
      <ul>${errores.map(e => `<li>${esc(e)}</li>`).join('')}</ul></div>`;
  } else {
    html += `<div class="val-ok">✓ La clave está completa · ${resumen}</div>`;
  }
  if (avisos.length) {
    html += `<div class="val-aviso"><ul>${avisos.map(a => `<li>${esc(a)}</li>`).join('')}</ul></div>`;
  }
  $('validacion').innerHTML = html;
}

function validar() {
  if (!editor) return false;
  const opciones = aOpciones();
  const { errores, avisos } = validarClave(opciones);
  if (!$('f-titulo').value.trim()) errores.unshift('Falta el título de la clave.');

  const especies = new Set(opciones.filter(o => o.especie).map(o => o.especie));
  const nd = editor.dilemas.length;
  const resumen = `${nd} ${nd === 1 ? 'dilema' : 'dilemas'}, ` +
    `${especies.size} ${especies.size === 1 ? 'especie' : 'especies'}`;

  pintarValidacion(errores, avisos, resumen);
  return errores.length === 0;
}

$('btn-guardar').addEventListener('click', async () => {
  if (!validar()) {
    $('validacion').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  const cuerpo = {
    titulo: $('f-titulo').value.trim(),
    grupo: $('f-grupo').value.trim(),
    descripcion: $('f-descripcion').value.trim(),
    opciones: aOpciones()
  };

  const boton = $('btn-guardar');
  boton.disabled = true;
  boton.textContent = 'Guardando…';
  try {
    if (editor.id) {
      await apiAdmin('PUT', '/api/admin/claves/' + editor.id, cuerpo);
    } else {
      const r = await apiAdmin('POST', '/api/admin/claves', cuerpo);
      editor.id = r.id;
    }
    editor.sucio = false;
    actualizarCabeceraEditor();
    avisar('Clave guardada');
  } catch (err) {
    if (err.message === '401') return;
    avisar(err.message, 'error');
    if (err.errores) pintarValidacion(err.errores, [], '');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Guardar clave';
  }
});

/* ================= CSV ================= */

function parsearCSV(texto) {
  texto = texto.replace(/^﻿/, '');
  const primera = texto.split(/\r?\n/)[0];
  let sep = ',';
  if (primera.includes('\t')) sep = '\t';
  else if ((primera.match(/;/g) || []).length > (primera.match(/,/g) || []).length) sep = ';';

  const filas = [];
  let fila = [], campo = '', comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; }
        else comillas = false;
      } else {
        campo += c;
      }
    } else if (c === '"') {
      comillas = true;
    } else if (c === sep) {
      fila.push(campo); campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo); filas.push(fila);
      fila = []; campo = '';
    } else {
      campo += c;
    }
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.filter(f => f.some(x => x.trim()));
}

function csvADilemas(texto) {
  const filas = parsearCSV(texto);
  if (filas.length < 2) throw new Error('El archivo no tiene datos.');

  const enc = filas[0].map(h => normalizar(h).trim());
  const columna = (...nombres) => enc.findIndex(h => nombres.includes(h));
  const iPaso = columna('dilema', 'paso');
  const iOp = columna('opcion', 'variante');
  const iDesc = columna('descripcion', 'caracter', 'caracteres');
  const iSig = columna('siguiente', 'lleva a', 'lleva_a', 'siguiente_dilema');
  const iEsp = columna('especie', 'resultado');

  if (iPaso < 0 || iOp < 0 || iDesc < 0 || (iSig < 0 && iEsp < 0)) {
    throw new Error('Faltan columnas. Usa: dilema, opcion, descripcion, siguiente, especie.');
  }

  const mapa = new Map();
  filas.slice(1).forEach((f, k) => {
    const paso = parseInt(f[iPaso], 10);
    if (!Number.isInteger(paso)) throw new Error(`Fila ${k + 2}: el número de dilema no es válido.`);

    // Acepta a/b o el estilo impreso 1 / 1'
    const opcion = String(f[iOp] || '').trim().toLowerCase();
    const v = /['′’b]/.test(opcion) ? 'b' : 'a';

    const siguiente = iSig >= 0 ? String(f[iSig] || '').trim() : '';
    const especie = iEsp >= 0 ? String(f[iEsp] || '').trim() : '';

    if (!mapa.has(paso)) mapa.set(paso, { paso, a: nuevaOpcion(), b: nuevaOpcion() });
    mapa.get(paso)[v] = {
      descripcion: String(f[iDesc] || '').trim(),
      tipo: especie && !siguiente ? 'especie' : 'dilema',
      siguiente,
      especie
    };
  });
  return [...mapa.values()].sort((x, y) => x.paso - y.paso);
}

function leerArchivo(archivo, codificacion) {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => resolver(lector.result);
    lector.onerror = () => rechazar(lector.error);
    lector.readAsText(archivo, codificacion);
  });
}

function celdaCSV(valor) {
  const s = String(valor ?? '');
  return /[",;\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function descargarCSV(nombre, filas) {
  const contenido = filas.map(f => f.map(celdaCSV).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + contenido], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const ENCABEZADO_CSV = ['dilema', 'opcion', 'descripcion', 'siguiente', 'especie'];

$('btn-importar').addEventListener('click', () => $('archivo-csv').click());

$('archivo-csv').addEventListener('change', async e => {
  const archivo = e.target.files[0];
  e.target.value = '';
  if (!archivo) return;

  try {
    let texto = await leerArchivo(archivo, 'utf-8');
    // Excel en Windows a veces guarda en ANSI; se reintenta para no perder acentos
    if (texto.includes('�')) texto = await leerArchivo(archivo, 'windows-1252');

    const dilemas = csvADilemas(texto);
    const hayDatos = editor.dilemas.some(d => d.a.descripcion || d.b.descripcion);
    if (hayDatos && !confirm(`Se reemplazarán los dilemas actuales por los ${dilemas.length} del archivo. ¿Continuar?`)) {
      return;
    }
    editor.dilemas = dilemas;
    pintarDilemas();
    marcarSucio();
    validar();
    avisar(`Se importaron ${dilemas.length} dilemas. Revisa y guarda.`);
  } catch (err) {
    avisar(err.message, 'error');
  }
});

$('btn-exportar').addEventListener('click', () => {
  const filas = [ENCABEZADO_CSV];
  for (const d of editor.dilemas) {
    for (const v of ['a', 'b']) {
      const o = d[v];
      filas.push([
        d.paso, v, o.descripcion,
        o.tipo === 'dilema' ? o.siguiente : '',
        o.tipo === 'especie' ? o.especie : ''
      ]);
    }
  }
  const base = normalizar($('f-grupo').value || $('f-titulo').value || 'clave')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'clave';
  descargarCSV(`clave-${base}.csv`, filas);
});

$('btn-plantilla').addEventListener('click', () => {
  descargarCSV('plantilla-clave.csv', [
    ENCABEZADO_CSV,
    [1, 'a', 'Glándula conspicua en el dorso de la hoja', 2, ''],
    [1, 'b', 'Glándula inconspicua en el dorso de la hoja', 3, ''],
    [2, 'a', 'Follaje verde claro', '', 'Género especie1'],
    [2, 'b', 'Follaje gris-azulado', '', 'Género especie2'],
    [3, 'a', 'Conos mayores a 25 mm', '', 'Género especie3'],
    [3, 'b', 'Conos menores a 25 mm', '', 'Género especie4']
  ]);
});

/* ================= Inicio ================= */

window.addEventListener('beforeunload', e => {
  if (editor && editor.sucio) { e.preventDefault(); e.returnValue = ''; }
});

(async function iniciar() {
  if (!token) return cerrarSesion();
  try {
    await apiAdmin('GET', '/api/admin/sesion');
    cargarLista();
  } catch (err) {
    if (err.message !== '401') cerrarSesion('No se pudo conectar con el servidor.');
  }
})();
