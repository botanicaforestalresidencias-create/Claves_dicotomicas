// Valida que una clave esté bien armada.
// Se usa en el navegador (admin) y en el servidor (antes de guardar).
(function (raiz) {
  function etiqueta(paso, variante) {
    return variante === 'a' ? String(paso) : paso + '′';
  }

  function validarClave(opciones) {
    const errores = [];
    const avisos = [];

    if (!Array.isArray(opciones) || !opciones.length) {
      errores.push('La clave no tiene dilemas.');
      return { errores, avisos };
    }

    const pasos = new Map();

    opciones.forEach((o, i) => {
      const n = Number.isInteger(o.paso) && o.paso > 0 ? o.paso : null;
      if (!n) {
        errores.push(`Hay un dilema sin número válido (fila ${i + 1}).`);
        return;
      }
      if (o.variante !== 'a' && o.variante !== 'b') {
        errores.push(`Dilema ${n}: la opción debe ser "a" o "b".`);
        return;
      }

      const et = etiqueta(n, o.variante);
      if (!o.descripcion) errores.push(`${et}: falta la descripción.`);

      const tieneSiguiente = o.siguiente_paso != null;
      const tieneEspecie = !!o.especie;
      if (tieneSiguiente === tieneEspecie) {
        errores.push(`${et}: indica a qué dilema lleva o en qué especie termina.`);
      } else if (tieneSiguiente && (!Number.isInteger(o.siguiente_paso) || o.siguiente_paso < 1)) {
        errores.push(`${et}: el dilema al que lleva no es un número válido.`);
      }

      if (!pasos.has(n)) pasos.set(n, {});
      const par = pasos.get(n);
      if (par[o.variante]) errores.push(`El dilema ${n} está repetido.`);
      else par[o.variante] = o;
    });

    for (const [n, par] of pasos) {
      if (!par.a) errores.push(`Al dilema ${n} le falta la opción ${n}.`);
      if (!par.b) errores.push(`Al dilema ${n} le falta la opción ${n}′.`);
      for (const o of [par.a, par.b]) {
        if (!o || !Number.isInteger(o.siguiente_paso)) continue;
        if (o.siguiente_paso === n) {
          errores.push(`${etiqueta(n, o.variante)}: no puede llevar a su mismo dilema.`);
        } else if (!pasos.has(o.siguiente_paso)) {
          errores.push(`${etiqueta(n, o.variante)}: lleva al dilema ${o.siguiente_paso}, que no existe.`);
        }
      }
    }

    if (errores.length) return { errores, avisos };

    // Busca ciclos y dilemas a los que nunca se llega
    const inicio = Math.min(...pasos.keys());
    const estado = new Map(); // 1 = en recorrido, 2 = terminado
    let ciclo = null;

    function recorrer(n) {
      estado.set(n, 1);
      for (const v of ['a', 'b']) {
        const s = pasos.get(n)[v].siguiente_paso;
        if (s == null) continue;
        if (estado.get(s) === 1) {
          ciclo = ciclo || `${etiqueta(n, v)} regresa al dilema ${s}: la clave nunca terminaría.`;
        } else if (!estado.has(s)) {
          recorrer(s);
        }
      }
      estado.set(n, 2);
    }
    recorrer(inicio);

    if (ciclo) errores.push(ciclo);

    const sueltos = [...pasos.keys()].filter(n => !estado.has(n)).sort((a, b) => a - b);
    if (sueltos.length) {
      avisos.push(`Ninguna opción lleva ${sueltos.length === 1 ? 'al dilema' : 'a los dilemas'} ` +
        `${sueltos.join(', ')}; nunca se van a mostrar.`);
    }

    return { errores, avisos };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { validarClave };
  } else {
    raiz.validarClave = validarClave;
  }
})(typeof window !== 'undefined' ? window : globalThis);
