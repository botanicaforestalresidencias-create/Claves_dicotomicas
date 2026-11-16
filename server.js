require('dotenv').config();
const express = require('express');
const path = require('path');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, filePath) {
    // El service worker nunca debe quedar en caché del navegador
    if (filePath.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-cache');
  }
}));

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

app.listen(PORT, () => {
  console.log(`Claves dicotómicas en http://localhost:${PORT}`);
});
