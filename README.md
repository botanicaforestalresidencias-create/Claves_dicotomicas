# Claves dicotómicas · DICIFO

PWA para consultar claves dicotómicas de especies forestales. Node/Express + MySQL.

## Instalación

```bash
npm install
mysql -u root -p < sql/schema.sql     # crea la base y carga la clave de Hesperocyparis
cp .env.example .env                  # en Windows: copy .env.example .env
```

Edita `.env` con tu usuario y contraseña de MySQL.

## Ejecutar

```bash
npm start
# o con PM2
pm2 start ecosystem.config.js
pm2 save
```

Abre http://localhost:3001

## Acceso

La página de inicio (`/login.html`) tiene dos entradas:

- **Alumnos:** botón "Entrar como alumno", sin registro.
- **Administradores:** usuario y contraseña.

Para crear un administrador (o cambiar su contraseña):

```bash
node crear-admin.js usuario contraseña "Nombre completo"
```

En una base que ya existía, crea antes la tabla con `sql/administradores.sql`.

Desde el administrador se crean, editan y eliminan claves. También se pueden importar
desde un CSV con las columnas `dilema, opcion, descripcion, siguiente, especie`
(en Excel: Guardar como → CSV UTF-8). La opción puede escribirse `a`/`b` o `1`/`1'`.

## Estructura

- `sql/schema.sql`: tablas `claves` y `clave_opciones` y datos de prueba
- `server.js`: API (`/api/claves`, `/api/claves/:id`)
- `public/`: PWA (lista, navegación de la clave y service worker)

## Cómo se captura una clave

Cada paso tiene dos opciones: `a` (1) y `b` (1′). Cada opción lleva a otro paso
(`siguiente_paso`) o termina en una especie (`especie`), nunca a las dos.

## Sin internet

Al abrir la lista con internet, todas las claves se descargan y quedan guardadas.
Si cambias HTML, CSS o JS, sube `VERSION` en `public/sw.js`.
