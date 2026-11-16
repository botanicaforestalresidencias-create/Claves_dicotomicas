-- Base de datos para la PWA de claves dicotómicas (DICIFO)
CREATE DATABASE IF NOT EXISTS claves_dicotomicas
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE claves_dicotomicas;

-- Una fila por clave (p. ej. "Clave para las especies de Hesperocyparis")
CREATE TABLE IF NOT EXISTS claves (
  id INT AUTO_INCREMENT PRIMARY KEY,
  titulo VARCHAR(200) NOT NULL,
  grupo VARCHAR(100) NULL,            -- género o familia
  descripcion TEXT NULL,
  creada_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Cada paso tiene dos opciones: 'a' (1) y 'b' (1′).
-- Cada opción lleva a otro paso (siguiente_paso) o termina en una especie.
CREATE TABLE IF NOT EXISTS clave_opciones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  clave_id INT NOT NULL,
  paso INT NOT NULL,
  variante ENUM('a','b') NOT NULL,
  descripcion TEXT NOT NULL,
  siguiente_paso INT NULL,
  especie VARCHAR(150) NULL,
  especie_id INT NULL,                -- enlace opcional a un catálogo externo
  UNIQUE KEY uq_paso (clave_id, paso, variante),
  CONSTRAINT fk_opcion_clave FOREIGN KEY (clave_id)
    REFERENCES claves(id) ON DELETE CASCADE,
  CONSTRAINT chk_destino CHECK (
    (siguiente_paso IS NOT NULL AND especie IS NULL) OR
    (siguiente_paso IS NULL AND especie IS NOT NULL)
  )
) ENGINE=InnoDB;

-- Usuarios administradores (se crean con: node crear-admin.js)
CREATE TABLE IF NOT EXISTS administradores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario VARCHAR(50) NOT NULL UNIQUE,
  nombre VARCHAR(120) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  ultimo_acceso DATETIME NULL,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ===== Datos de prueba: clave de Hesperocyparis =====
INSERT INTO claves (titulo, grupo, descripcion) VALUES
('Clave para las especies de Hesperocyparis (Cupressus)', 'Hesperocyparis',
 'Clave dicotómica basada en glándula foliar, ramillas, follaje y gálbulas.');

SET @c := LAST_INSERT_ID();

INSERT INTO clave_opciones (clave_id, paso, variante, descripcion, siguiente_paso, especie) VALUES
(@c, 1, 'a', 'Glándula conspicua en el dorso de la hoja', 2, NULL),
(@c, 1, 'b', 'Glándula inconspicua en el dorso de la hoja', 4, NULL),
(@c, 2, 'a', 'Ramillas dísticas y simétricas; follaje verde claro; gálbula de 10-15 mm de diámetro y 6 escamas', NULL, 'Hesperocyparis benthamii'),
(@c, 2, 'b', 'Ramillas orientadas en todas direcciones', 3, NULL),
(@c, 3, 'a', 'Follaje verde-oscuro; glándula reventando con frecuencia; gálbula de 15-20 mm de diámetro y con 8-12 escamas', NULL, 'Hesperocyparis montana'),
(@c, 3, 'b', 'Follaje gris-azulado; glándula sin reventar; gálbula de 20-25 mm de diámetro y 6-8 escamas', NULL, 'Hesperocyparis stephensonii'),
(@c, 4, 'a', 'Conos de 25-35 mm de diámetro', 5, NULL),
(@c, 4, 'b', 'Conos menores a 25 mm de diámetro', 6, NULL),
(@c, 5, 'a', 'Conos de color café-rojizo, 8 escamas; follaje verde-pálido; árboles de hasta 15 m de alto', NULL, 'Hesperocyparis guadalupensis'),
(@c, 5, 'b', 'Conos de color gris-pálido, 10-14 escamas; follaje verde amarillento; árboles de 5 a 6 (-10) m de alto', NULL, 'Hesperocyparis forbesii'),
(@c, 6, 'a', 'Conos de 12-15 mm de diámetro; follaje verde oscuro; ramillas primarias delgadas, color café-rojizo', NULL, 'Hesperocyparis lusitanica'),
(@c, 6, 'b', 'Conos de 18-25 mm de diámetro; follaje verde azulado a pálido; ramillas primarias robustas, color gris blanquecino', NULL, 'Hesperocyparis arizonica');
