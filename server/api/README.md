# server/api/ — el backend real de depo zeta

Cloudflare Worker + D1. Auth con clave + TOTP obligatorio, tres roles
(ADMIN, DEPOSITO, REPARTIDOR), gestión de usuarios, y el libro operativo
completo — catálogo, cartera, el libro de asientos, ventas, no-ventas,
encargues, zonas a evitar. Ver
[`DZ-SEG-01`](../../docs/tecnico/04-seguridad-dz-seg-01.md) para auth y
[`DZ-MOD-01`](../../docs/tecnico/01-modelo-datos-dz-mod-01.md) para el
modelo del libro.

**Desplegado de verdad desde el 19 de agosto:**
`https://depo-zeta-api.tukyquilme.workers.dev`. Probado de punta a punta
primero con `wrangler dev` (D1 local), y contra esta URL real después.

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

En local, con el `BOOTSTRAP_TOKEN` de `.dev.vars`:

```bash
curl -X POST http://localhost:8787/api/bootstrap -H 'Content-Type: application/json' \
  -d '{"token":"el-de-.dev.vars","usuario":"vos","nombre":"Tu Nombre","clave":"una clave de verdad, doce caracteres o más"}'
```

Contra la API real, con el `BOOTSTRAP_TOKEN` que quedó cargado como secret
(`wrangler secret put BOOTSTRAP_TOKEN` — no está en este repo ni en ningún
archivo, sólo en Cloudflare y en la conversación donde se generó):

```bash
curl -X POST https://depo-zeta-api.tukyquilme.workers.dev/api/bootstrap -H 'Content-Type: application/json' \
  -d '{"token":"EL_TOKEN_REAL","usuario":"tu-usuario","nombre":"Tu Nombre","clave":"tu clave real, doce caracteres o más"}'
```

Sólo funciona una vez —si ya hay un usuario, se rechaza— y sólo con el
`BOOTSTRAP_TOKEN` correcto, para que no alcance con adivinar la URL antes
de que el dueño real la use. Para rotarlo: `wrangler secret put BOOTSTRAP_TOKEN`
de nuevo (sólo tiene efecto mientras no haya usuarios todavía).

## Las rutas

**Auth y usuarios** — diseño en `DZ-SEG-01`:

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

**El libro operativo** — diseño en `DZ-MOD-01`. Todas piden sesión; el costo y el margen
sólo viajan si el rol tiene `VER_COSTOS` (DEPOSITO/ADMIN):

| Ruta | Qué hace |
|---|---|
| `GET /api/productos` | Catálogo. Sin `costo`/`costo_actualizado` para REPARTIDOR |
| `POST /api/productos` | Alta — DEPOSITO/ADMIN. `stockInicial` opcional genera el asiento de compra |
| `POST /api/productos/remarcar` | Remarcación masiva `{pct, rubro}` — DEPOSITO/ADMIN |
| `GET /api/clientes` | Cartera completa |
| `POST /api/clientes` | Alta de cliente |
| `POST /api/clientes/:id/punto` | Actualiza el pin — no hace nada si ya hay uno real (no aproximado) |
| `GET /api/zonas` | Zonas a evitar |
| `POST /api/zonas` | Alta de zona — DEPOSITO/ADMIN |
| `POST /api/zonas/:id/eliminar` | Baja de zona — DEPOSITO/ADMIN |
| `GET /api/asientos` | El libro completo — de acá sale `stock()` en el cliente |
| `POST /api/carga` | Un asiento `carga` por renglón, depósito → camioneta del repartidor indicado — DEPOSITO/ADMIN |
| `GET /api/ventas` | Todas las ventas |
| `POST /api/ventas` | Confirma una venta — REPARTIDOR/ADMIN. El precio se resuelve acá contra el catálogo y la lista del cliente, nunca se confía en el que mande el body |
| `GET /api/no-ventas` | Todas las no-ventas |
| `POST /api/no-ventas` | Registra un «no compró», con motivo |
| `GET /api/encargues` | Todos los encargues |
| `POST /api/encargues` | Toma un encargue — REPARTIDOR/ADMIN |
| `POST /api/encargues/:id/preparar` | El depósito lo separó — DEPOSITO/ADMIN |
| `POST /api/encargues/:id/vincular` | Vincula un renglón especial a un producto real `{indice, productoId}` — DEPOSITO/ADMIN |
| `POST /api/encargues/:id/entregar` | Genera la venta real — REPARTIDOR/ADMIN. Bloquea si queda algún especial sin vincular |
| `POST /api/encargues/:id/cancelar` | Con motivo — REPARTIDOR, DEPOSITO o ADMIN |

En `ventas`, `carga` y `entregar`, el repartidor que queda registrado es siempre quien está
logueado (`sujeto.usuario`) — nunca lo que mande el body, para que nadie pueda vender "como"
otra cuenta con el mismo permiso.

Todas menos `bootstrap`/`login`/`login/totp` piden
`Authorization: Bearer <token>`.

## Ya desplegado — cómo se hizo

```bash
npx wrangler login                        # OAuth contra la cuenta real de Cloudflare
npx wrangler d1 create depo-zeta          # id real → wrangler.toml (87cfd408-9ba0-4b96-9089-edae778c8829)
npx wrangler d1 execute depo-zeta --remote --file=schema.sql
npx wrangler secret put BOOTSTRAP_TOKEN
npx wrangler deploy
```

Cuenta: `tukyquilme@gmail.com`. Worker: `depo-zeta-api`, en la URL de
`workers.dev` de arriba — todavía no tiene un dominio propio (`depozeta-api.hg-vl.com`
o similar), ver «Qué falta».

## CORS

Ya no es `*` — `encabezadosCors()` en `worker.mjs` refleja el `Origin` sólo si está en
`ORIGENES_PERMITIDOS` (hoy `depozeta.hg-vl.com` y `human-zeta.github.io`) o es
`localhost` en cualquier puerto, para seguir desarrollando local. Si el front termina
viviendo en otro origen, agregarlo a esa lista.

## Qué falta

- **Dominio propio para la API** — hoy es la URL de `workers.dev`, funciona igual pero
  no es lo que se planeó (`depozeta.hg-vl.com` para el front). Un dominio tipo
  `depozeta-api.hg-vl.com` es un `route` más en `wrangler.toml`, no un cambio de código.
- **Trabajar sin conexión.** Cada operación es una llamada HTTP en el
  momento — no hay cola local ni sincronización al recuperar señal. Ver
  la sección «Sincronización» de `DZ-MOD-01` para el porqué y qué cambiaría.
- **Reporte consolidado de varios repartidores a la vez** — hoy cada
  vista muestra a quien tiene la sesión abierta, no un tablero de todos
  juntos.
- **Actualizar el costo de un producto ya existente** — hoy sólo se fija
  al dar de alta.
- **El primer ADMIN real todavía no se creó** — hace falta correr
  `/api/bootstrap` contra la URL real, con el token que quedó como
  secret. Ver «El primer ADMIN» arriba.
