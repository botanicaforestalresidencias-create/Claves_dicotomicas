// Cifrado de contraseñas con scrypt (incluido en Node, no requiere paquetes)
const crypto = require('crypto');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);

async function hashPassword(password) {
  const sal = crypto.randomBytes(16);
  const hash = await scrypt(String(password), sal, 64);
  return `scrypt:${sal.toString('hex')}:${hash.toString('hex')}`;
}

async function verificarPassword(password, guardado) {
  const [alg, salHex, hashHex] = String(guardado || '').split(':');
  if (alg !== 'scrypt' || !salHex || !hashHex) return false;
  const hash = await scrypt(String(password || ''), Buffer.from(salHex, 'hex'), 64);
  const esperado = Buffer.from(hashHex, 'hex');
  return esperado.length === hash.length && crypto.timingSafeEqual(hash, esperado);
}

module.exports = { hashPassword, verificarPassword };
