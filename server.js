require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const pool = require('./db');
const { validarClave } = require('./public/js/validar');
const { hashPassword, verificarPassword } = require('./auth');

const app = express();
const PORT = process.env.PORT || 3001;

// Toda la app vive bajo /claves para poder compartir dominio con el herbario
const BASE = '/claves';
const ruta = express.Router();

// ngrok y otros proxies locales envían la IP real del visitante
app.set('trust proxy', 'loopback');
ruta.use(express.json({ limit: '1mb' }));
ruta.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, filePath) {
    // El service worker nunca debe quedar en caché del navegador
    if (filePath.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-cache');
  }
}));

/* ================= Consulta pública ================= */

// Lista de claves con sus especies (para buscar por especie sin conexión)
ruta.get('/api/claves', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT c.id, c.titulo, c.grupo, c.descripcion,
             GROUP_CONCAT(DISTINCT o.especie ORDER BY o.especie SEPARATOR '|') AS especies
      FROM claves c
      LEFT JOIN clave_opciones o ON o.clave_id = c.id AND o.especie IS NOT NULL
      GROUP BY c.id
      ORDER BY c.grupo, c.titulo`);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al consultar las claves' });
  }
});

// Una clave completa (se navega en el navegador, así funciona sin internet)
ruta.get('/api/claves/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Id inválido' });
  try {
    const [[clave]] = await pool.query(
      'SELECT id, titulo, grupo, descripcion FROM claves WHERE id = ?', [id]);
    if (!clave) return res.status(404).json({ error: 'Clave no encontrada' });

    const [opciones] = await pool.query(`
      SELECT paso, variante, descripcion, siguiente_paso, especie, especie_id
      FROM clave_opciones
      WHERE clave_id = ?
      ORDER BY paso, variante`, [id]);

    res.json({ clave, opciones });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al consultar la clave' });
  }
});

ruta.get('/api/salud', (req, res) => res.json({ ok: true }));

/* ================= Administrador ================= */

const sesiones = new Map(); // token → { vence, id, nombre }
const DURACION_SESION = 8 * 60 * 60 * 1000; // 8 horas
const intentos = new Map(); // ip → { n, hasta }
const MAX_INTENTOS = 5;
const BLOQUEO = 5 * 60 * 1000; // 5 minutos

// Se compara contra un hash falso cuando el usuario no existe,
// así la respuesta tarda lo mismo y no revela qué usuarios hay.
let hashFalso = '';
hashPassword(crypto.randomBytes(16).toString('hex')).then(h => { hashFalso = h; });

function requiereAdmin(req, res, next) {
  const token = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const sesion = sesiones.get(token);
  if (!token || !sesion || sesion.vence < Date.now()) {
    sesiones.delete(token);
    return res.status(401).json({ error: 'Sesión no válida' });
  }
  sesion.vence = Date.now() + DURACION_SESION; // renueva al usarla
  req.token = token;
  req.admin = sesion;
  next();
}

ruta.post('/api/admin/login', async (req, res) => {
  const ip = req.ip;
  const registro = intentos.get(ip);
  if (registro && registro.hasta > Date.now()) {
    return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos.' });
  }

  const usuario = String((req.body && req.body.usuario) || '').trim().toLowerCase();
  const password = String((req.body && req.body.password) || '');
  if (!usuario || !password) {
    return res.status(400).json({ error: 'Escribe tu usuario y contraseña' });
  }

  try {
    const [[admin]] = await pool.query(
      'SELECT id, nombre, password_hash FROM administradores WHERE usuario = ? AND activo = 1',
      [usuario]);

    const valida = await verificarPassword(password, admin ? admin.password_hash : hashFalso);

    if (!admin || !valida) {
      const n = (registro && registro.hasta <= Date.now() ? 0 : (registro ? registro.n : 0)) + 1;
      intentos.set(ip, n >= MAX_INTENTOS ? { n: 0, hasta: Date.now() + BLOQUEO } : { n, hasta: 0 });
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    intentos.delete(ip);
    await pool.query('UPDATE administradores SET ultimo_acceso = NOW() WHERE id = ?', [admin.id]);

    const token = crypto.randomBytes(32).toString('hex');
    sesiones.set(token, { vence: Date.now() + DURACION_SESION, id: admin.id, nombre: admin.nombre });
    res.json({ token, nombre: admin.nombre });
  } catch (err) {
    console.error(err);
    const mensaje = err.code === 'ER_NO_SUCH_TABLE'
      ? 'Falta crear la tabla de administradores (sql/administradores.sql)'
      : 'No se pudo iniciar sesión';
    res.status(500).json({ error: mensaje });
  }
});

ruta.post('/api/admin/logout', requiereAdmin, (req, res) => {
  sesiones.delete(req.token);
  res.json({ ok: true });
});

ruta.get('/api/admin/sesion', requiereAdmin, (req, res) => {
  res.json({ nombre: req.admin.nombre });
});

function texto(valor, max) {
  const t = String(valor ?? '').trim();
  return t ? t.slice(0, max) : null;
}

function limpiarClave(body) {
  const opciones = Array.isArray(body.opciones) ? body.opciones : [];
  return {
    titulo: texto(body.titulo, 200),
    grupo: texto(body.grupo, 100),
    descripcion: texto(body.descripcion, 2000),
    opciones: opciones.map(o => ({
      paso: Number(o.paso),
      variante: o.variante,
      descripcion: texto(o.descripcion, 2000),
      siguiente_paso: o.siguiente_paso == null || o.siguiente_paso === '' ? null : Number(o.siguiente_paso),
      especie: texto(o.especie, 150)
    }))
  };
}

function revisar(datos) {
  const { errores } = validarClave(datos.opciones);
  if (!datos.titulo) errores.unshift('Falta el título de la clave.');
  return errores;
}

async function insertarOpciones(conn, claveId, opciones) {
  const filas = opciones.map(o =>
    [claveId, o.paso, o.variante, o.descripcion, o.siguiente_paso, o.especie]);
  await conn.query(
    `INSERT INTO clave_opciones
       (clave_id, paso, variante, descripcion, siguiente_paso, especie)
     VALUES ?`, [filas]);
}

ruta.post('/api/admin/claves', requiereAdmin, async (req, res) => {
  const datos = limpiarClave(req.body || {});
  const errores = revisar(datos);
  if (errores.length) return res.status(400).json({ error: 'La clave tiene errores', errores });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.query(
      'INSERT INTO claves (titulo, grupo, descripcion) VALUES (?, ?, ?)',
      [datos.titulo, datos.grupo, datos.descripcion]);
    await insertarOpciones(conn, r.insertId, datos.opciones);
    await conn.commit();
    res.status(201).json({ id: r.insertId });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'No se pudo guardar la clave' });
  } finally {
    conn.release();
  }
});

ruta.put('/api/admin/claves/:id', requiereAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Id inválido' });

  const datos = limpiarClave(req.body || {});
  const errores = revisar(datos);
  if (errores.length) return res.status(400).json({ error: 'La clave tiene errores', errores });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.query(
      'UPDATE claves SET titulo = ?, grupo = ?, descripcion = ? WHERE id = ?',
      [datos.titulo, datos.grupo, datos.descripcion, id]);
    if (!r.affectedRows) {
      await conn.rollback();
      return res.status(404).json({ error: 'Clave no encontrada' });
    }
    await conn.query('DELETE FROM clave_opciones WHERE clave_id = ?', [id]);
    await insertarOpciones(conn, id, datos.opciones);
    await conn.commit();
    res.json({ id });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'No se pudo guardar la clave' });
  } finally {
    conn.release();
  }
});

ruta.delete('/api/admin/claves/:id', requiereAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Id inválido' });
  try {
    const [r] = await pool.query('DELETE FROM claves WHERE id = ?', [id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Clave no encontrada' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo eliminar la clave' });
  }
});

// /claves (sin diagonal) → /claves/ para que las rutas relativas funcionen
app.use((req, res, next) => {
  if (req.path === BASE) {
    const query = req.originalUrl.slice(req.path.length);
    return res.redirect(301, BASE + '/' + query);
  }
  next();
});
app.get('/', (req, res) => res.redirect(BASE + '/'));
app.use(BASE, ruta);

app.listen(PORT, () => {
  console.log(`Claves dicotómicas en http://localhost:${PORT}${BASE}/`);
});