require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const pool = require('./db');
const { validarClave } = require('./public/js/validar');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, filePath) {
    // El service worker nunca debe quedar en caché del navegador
    if (filePath.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-cache');
  }
}));

/* ================= Consulta pública ================= */

// Lista de claves con sus especies (para buscar por especie sin conexión)
app.get('/api/claves', async (req, res) => {
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
app.get('/api/claves/:id', async (req, res) => {
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

app.get('/api/salud', (req, res) => res.json({ ok: true }));

/* ================= Administrador ================= */

const sesiones = new Map(); // token → fecha de vencimiento
const DURACION_SESION = 8 * 60 * 60 * 1000; // 8 horas

function passwordValida(password) {
  const real = process.env.ADMIN_PASSWORD || '';
  const a = crypto.createHash('sha256').update(String(password || '')).digest();
  const b = crypto.createHash('sha256').update(real).digest();
  return real.length > 0 && crypto.timingSafeEqual(a, b);
}

function requiereAdmin(req, res, next) {
  const token = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const vence = sesiones.get(token);
  if (!token || !vence || vence < Date.now()) {
    sesiones.delete(token);
    return res.status(401).json({ error: 'Sesión no válida' });
  }
  sesiones.set(token, Date.now() + DURACION_SESION); // renueva al usarla
  req.token = token;
  next();
}

app.post('/api/admin/login', async (req, res) => {
  if (!process.env.ADMIN_PASSWORD) {
    return res.status(503).json({ error: 'Falta configurar ADMIN_PASSWORD en el archivo .env' });
  }
  if (!passwordValida(req.body && req.body.password)) {
    await new Promise(r => setTimeout(r, 600)); // frena intentos repetidos
    return res.status(401).json({ error: 'Contraseña incorrecta' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  sesiones.set(token, Date.now() + DURACION_SESION);
  res.json({ token });
});

app.post('/api/admin/logout', requiereAdmin, (req, res) => {
  sesiones.delete(req.token);
  res.json({ ok: true });
});

app.get('/api/admin/sesion', requiereAdmin, (req, res) => res.json({ ok: true }));

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

app.post('/api/admin/claves', requiereAdmin, async (req, res) => {
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

app.put('/api/admin/claves/:id', requiereAdmin, async (req, res) => {
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

app.delete('/api/admin/claves/:id', requiereAdmin, async (req, res) => {
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

app.listen(PORT, () => {
  console.log(`Claves dicotómicas en http://localhost:${PORT}`);
  console.log(`Administrador en http://localhost:${PORT}/admin.html`);
});
