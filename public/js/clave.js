const id = new URLSearchParams(location.search).get('id');
const cont = document.getElementById('contenido');
const tituloEl = document.getElementById('titulo');
const subtituloEl = document.getElementById('subtitulo');

let clave = null;
let pasos = {};        // pasos[n] = { a: opcion, b: opcion }
let primerPaso = null;

// 'a' se muestra como "1" y 'b' como "1′", igual que en la clave impresa
function etiqueta(op) {
  return op.variante === 'a' ? String(op.paso) : op.paso + '′';
}

// La ruta recorrida se guarda en la URL (#ruta=1a,2b,3a)
// así funcionan el botón "atrás" del teléfono y los enlaces directos.
function leerRuta() {
  const m = location.hash.match(/ruta=([0-9ab,]*)/);
  return m && m[1] ? m[1].split(',').filter(Boolean) : [];
}

function escribirRuta(ruta, reemplazar = false) {
  const hash = ruta.length ? '#ruta=' + ruta.join(',') : '#';
  if (reemplazar) {
    history.replaceState(null, '', location.pathname + location.search + hash);
  } else {
    location.hash = hash; // dispara hashchange → render()
  }
}

function rutaDe(elegidas) {
  return elegidas.map(o => o.paso + o.variante);
}

function textoRuta(elegidas) {
  return elegidas.map(etiqueta).join(' → ');
}

function htmlRuta(elegidas) {
  if (!elegidas.length) return '<p class="ruta">Inicio de la clave</p>';
  return `<p class="ruta">Ruta: <strong>${textoRuta(elegidas)}</strong></p>`;
}

function htmlAcciones(elegidas, final = false) {
  const hay = elegidas.length > 0;
  if (final) {
    return `<div class="acciones">
      <button class="boton" data-accion="atras">← Dilema anterior</button>
      <button class="boton" data-accion="imprimir">Imprimir</button>
      <button class="boton primario" data-accion="reiniciar">Identificar otro ejemplar</button>
    </div>`;
  }
  return `<div class="acciones">
    <button class="boton" data-accion="atras" ${hay ? '' : 'disabled'}>← Dilema anterior</button>
    <button class="boton" data-accion="reiniciar" ${hay ? '' : 'disabled'}>Reiniciar</button>
  </div>`;
}

function opcionHTML(op) {
  const destino = op.siguiente_paso != null
    ? `<span class="destino">${op.siguiente_paso}</span>`
    : `<span class="destino final"><em>${esc(abreviar(op.especie))}</em></span>`;
  return `<button class="opcion" data-paso="${op.paso}" data-variante="${op.variante}">
    <span class="num">${etiqueta(op)}.</span>
    <span class="cuerpo">
      <span class="texto">${esc(op.descripcion)}</span>
      ${destino}
    </span>
  </button>`;
}

function mostrarPaso(n, elegidas) {
  const par = pasos[n];
  if (!par || !par.a || !par.b) {
    cont.innerHTML = htmlRuta(elegidas) +
      `<p class="aviso">El dilema ${n} de esta clave está incompleto. Revisa la captura.</p>` +
      htmlAcciones(elegidas);
    return;
  }

  cont.innerHTML = `
    ${htmlRuta(elegidas)}
    <section class="dilema">
      <div class="dilema-enc">
        <h2>Dilema ${n}</h2>
        <span>Elige la opción que corresponde al ejemplar</span>
      </div>
      ${opcionHTML(par.a)}
      ${opcionHTML(par.b)}
    </section>
    ${htmlAcciones(elegidas)}`;
}

function mostrarResultado(op, elegidas) {
  const fecha = new Date().toLocaleDateString('es-MX', {
    day: 'numeric', month: 'long', year: 'numeric'
  });

  cont.innerHTML = `
    <article class="ficha">
      <div class="ficha-enc">Determinación</div>
      <h2>${esc(op.especie)}</h2>
      <dl>
        <dt>Clave</dt><dd>${tituloConCursiva(clave.titulo, clave.grupo)}</dd>
        <dt>Ruta</dt><dd>${textoRuta(elegidas)}</dd>
        <dt>Fecha</dt><dd>${fecha}</dd>
      </dl>
    </article>

    <section class="caracteres">
      <h3>Caracteres diagnósticos observados</h3>
      <ol>
        ${elegidas.map(o =>
          `<li><strong>${etiqueta(o)}.</strong><span>${esc(o.descripcion)}</span></li>`).join('')}
      </ol>
    </section>
    ${htmlAcciones(elegidas, true)}`;
}

function render() {
  const ruta = leerRuta();
  const elegidas = [];
  let paso = primerPaso;

  // Recorre la ruta y se detiene si encuentra algo inválido
  for (const item of ruta) {
    const p = parseInt(item, 10);
    const v = item.slice(-1);
    const op = pasos[p] && pasos[p][v];
    if (p !== paso || !op) break;
    elegidas.push(op);
    if (op.siguiente_paso == null) break;
    paso = op.siguiente_paso;
  }

  if (elegidas.length !== ruta.length) escribirRuta(rutaDe(elegidas), true);

  const ultima = elegidas[elegidas.length - 1];
  if (ultima && ultima.siguiente_paso == null) {
    mostrarResultado(ultima, elegidas);
  } else {
    mostrarPaso(paso, elegidas);
  }
  window.scrollTo(0, 0);
}

// Un solo manejador de clics para opciones y botones
cont.addEventListener('click', e => {
  const opcion = e.target.closest('.opcion');
  if (opcion) {
    escribirRuta([...leerRuta(), opcion.dataset.paso + opcion.dataset.variante]);
    return;
  }
  const boton = e.target.closest('[data-accion]');
  if (!boton) return;
  const accion = boton.dataset.accion;
  if (accion === 'atras') escribirRuta(leerRuta().slice(0, -1));
  if (accion === 'reiniciar') escribirRuta([]);
  if (accion === 'imprimir') window.print();
});

async function cargar() {
  if (!id) {
    tituloEl.textContent = 'Clave';
    cont.innerHTML = '<p class="aviso">No se indicó qué clave abrir.</p>';
    return;
  }

  try {
    const data = await api('/api/claves/' + encodeURIComponent(id));
    clave = data.clave;
    document.title = clave.titulo + ' · DICIFO';
    tituloEl.innerHTML = tituloConCursiva(clave.titulo, clave.grupo);
    subtituloEl.textContent = clave.descripcion || '';

    pasos = {};
    for (const o of data.opciones) {
      (pasos[o.paso] ||= {})[o.variante] = o;
    }

    const numeros = Object.keys(pasos).map(Number);
    if (!numeros.length) {
      cont.innerHTML = '<p class="aviso">Esta clave aún no tiene dilemas capturados.</p>';
      return;
    }
    primerPaso = Math.min(...numeros);

    render();
    window.addEventListener('hashchange', render);
  } catch (err) {
    console.error(err);
    tituloEl.textContent = 'Clave';
    cont.innerHTML = '<p class="aviso">No se pudo cargar la clave. Si estás sin internet, ' +
      'ábrela una vez con conexión para que quede guardada.</p>';
  }
}

cargar();

pintarBarraSesion();
