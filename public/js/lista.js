const listaEl = document.getElementById('lista');
const buscador = document.getElementById('buscador');
const avisoEl = document.getElementById('aviso');
const conteoEl = document.getElementById('conteo');

let claves = [];

function pintar() {
  const q = normalizar(buscador.value.trim());

  const filtradas = claves.filter(c =>
    !q || normalizar([c.titulo, c.grupo, c.especies].join(' ')).includes(q));

  conteoEl.textContent = claves.length
    ? `${filtradas.length} ${filtradas.length === 1 ? 'clave' : 'claves'}`
    : '';

  if (!filtradas.length) {
    listaEl.innerHTML = `<li class="vacio">${
      claves.length ? 'No hay claves que coincidan con la búsqueda.' : 'Aún no hay claves registradas.'
    }</li>`;
    return;
  }

  listaEl.innerHTML = filtradas.map(c => {
    const especies = c.especies ? c.especies.split('|') : [];
    const total = `${especies.length} ${especies.length === 1 ? 'especie' : 'especies'}`;
    const nombres = especies.map(e => `<em>${esc(abreviar(e))}</em>`).join(', ');

    return `<li>
      <a class="entrada" href="/clave.html?id=${c.id}">
        ${c.grupo ? `<span class="entrada-grupo">${esc(c.grupo)}</span>` : ''}
        <h3>${tituloConCursiva(c.titulo, c.grupo)}</h3>
        <span class="entrada-meta">${total} →</span>
        ${nombres ? `<p class="entrada-especies">${nombres}</p>` : ''}
      </a>
    </li>`;
  }).join('');
}

// Descarga cada clave en segundo plano para que quede guardada sin internet
function precargarClaves() {
  if (!navigator.onLine) return;
  claves.forEach(c => {
    fetch('/api/claves/' + c.id, { headers: API_HEADERS }).catch(() => {});
  });
}

async function cargar() {
  try {
    claves = await api('/api/claves');
    pintar();
    precargarClaves();
  } catch (err) {
    console.error(err);
    listaEl.innerHTML = '';
    avisoEl.innerHTML = '<p class="aviso">No se pudo cargar el catálogo de claves. ' +
      'Abre la aplicación una vez con internet para guardarlo en el dispositivo.</p>';
  }
}

let espera;
buscador.addEventListener('input', () => {
  clearTimeout(espera);
  espera = setTimeout(pintar, 150);
});

cargar();
