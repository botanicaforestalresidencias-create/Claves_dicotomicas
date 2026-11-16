// Crea un administrador o cambia su contraseña si ya existe.
// Uso: node crear-admin.js <usuario> <contraseña> "Nombre completo"
require('dotenv').config();
const pool = require('./db');
const { hashPassword } = require('./auth');

(async () => {
  const [usuarioArg, password, ...nombrePartes] = process.argv.slice(2);

  if (!usuarioArg || !password) {
    console.log('Uso: node crear-admin.js <usuario> <contraseña> "Nombre completo"');
    process.exit(1);
  }
  if (password.length < 8) {
    console.log('La contraseña debe tener al menos 8 caracteres.');
    process.exit(1);
  }

  const usuario = usuarioArg.trim().toLowerCase();
  const nombre = nombrePartes.join(' ').trim() || usuario;
  const hash = await hashPassword(password);

  const [r] = await pool.query(
    `INSERT INTO administradores (usuario, nombre, password_hash)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE nombre = VALUES(nombre),
                             password_hash = VALUES(password_hash),
                             activo = 1`,
    [usuario, nombre, hash]);

  console.log(r.affectedRows === 1
    ? `Administrador "${usuario}" creado.`
    : `Se actualizaron los datos de "${usuario}".`);

  await pool.end();
})().catch(async err => {
  if (err.code === 'ER_NO_SUCH_TABLE') {
    console.error('Falta la tabla administradores. Ejecuta primero sql/administradores.sql');
  } else {
    console.error(err.message);
  }
  process.exit(1);
});
