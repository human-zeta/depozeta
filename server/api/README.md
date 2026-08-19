# server/api/ — el backend real de depo zeta

Cloudflare Worker + D1. Auth con clave + TOTP obligatorio, tres roles
(ADMIN, DEPOSITO, REPARTIDOR), gestión de usuarios. Ver
[`DZ-SEG-01`](../../docs/tecnico/04-seguridad-dz-seg-01.md) para el diseño
completo.

**Probado de punta a punta con `wrangler dev` (D1 local, sin cuenta de
Cloudflare) — no desplegado a la nube real todavía.** Ver "Qué falta"
más abajo.

## Requiere Node 22+

`wrangler` no corre en Node 20. Si el sistema tiene una versión más vieja
como default (`node --version`), instalar una aparte sin tocar la que ya
hay:

```bash
brew install node@22
# Node 22 queda en /opt/homebrew/opt/node@22/bin, sin pisar el default.
# Para usarlo sólo en esta terminal:
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
```

## Probar en local

```bash
cd server/api
npx wrangler d1 execute depo-zeta --local --file=schema.sql   # una vez
echo 'BOOTSTRAP_TOKEN="elegí-algo-acá"' > .dev.vars             # una vez, no se commitea
npx wrangler dev --port 8787 --local
```

Con eso corriendo, `http://localhost:8787` es la API completa —D1 incluido,
como archivo local, sin ningún dato en la nube.

## El primer ADMIN

```bash
curl -X POST http://localhost:8787/api/bootstrap -H 'Content-Type: application/json' \
  -d '{"token":"el-de-.dev.vars","usuario":"vos","nombre":"Tu Nombre","clave":"una clave de verdad, doce caracteres o más"}'
```

Sólo funciona una vez —si ya hay un usuario, se rechaza— y sólo con el
`BOOTSTRAP_TOKEN` correcto, para que no alcance con adivinar la URL antes
de que el dueño real la use.

## Las rutas

| Ruta | Qué hace |
|---|---|
| `POST /api/bootstrap` | Crea el primer ADMIN. Una sola vez, con token. |
| `POST /api/login` | Usuario + clave → `ENROLAR` (primera vez, trae el secreto y el QR) o `REQUERIDO` (ya enrolado) |
| `POST /api/login/totp` | Ticket del paso anterior + código de 6 dígitos → sesión |
| `POST /api/logout` | Cierra la sesión del token |
| `GET /api/yo` | El perfil de quien está logueado |
| `GET /api/usuarios` | Lista — ADMIN y DEPOSITO |
| `POST /api/usuarios` | Alta — ADMIN crea cualquier rol menor; DEPOSITO sólo REPARTIDOR |
| `POST /api/usuarios/:usuario/desactivar` | Corta la cuenta y sus sesiones ya abiertas, no sólo el próximo login |
| `POST /api/usuarios/:usuario/reiniciar-totp` | Para cuando alguien pierde el teléfono |

Todas menos `bootstrap`/`login`/`login/totp` piden
`Authorization: Bearer <token>`.

## Desplegar de verdad

Esto todavía no se hizo — necesita la cuenta de Cloudflare del dueño del
proyecto, que esta sesión no tiene:

```bash
npx wrangler d1 create depo-zeta          # reemplazar database_id en wrangler.toml
npx wrangler d1 execute depo-zeta --remote --file=schema.sql
npx wrangler secret put BOOTSTRAP_TOKEN
npx wrangler deploy
```

## Qué falta

- **Desplegar a la nube real** — todo lo de arriba, hoy sólo corrido en
  local.
- **Acotar el CORS** (`Access-Control-Allow-Origin: *` en `worker.mjs`) al
  dominio final una vez que exista — hoy está abierto porque el dominio
  todavía no está decidido del todo.
- **El resto del libro** — `clientes`, `productos`, `asientos`, `ventas`,
  `encargues`, `zonas_evitar` ya están en `schema.sql`, pero el Worker
  todavía no expone rutas para ellos. Auth y usuarios quedaron completos
  esta noche; sincronizar el libro operativo es el paso que sigue.
