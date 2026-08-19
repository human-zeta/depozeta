# server/api/ — el backend real de depo zeta

Cloudflare Worker + D1. Auth con clave + TOTP obligatorio, tres roles
(ADMIN, DEPOSITO, REPARTIDOR), gestión de usuarios, y el libro operativo
completo — catálogo, cartera, el libro de asientos, ventas, no-ventas,
encargues, zonas a evitar. Ver
[`DZ-SEG-01`](../../docs/tecnico/04-seguridad-dz-seg-01.md) para auth y
[`DZ-MOD-01`](../../docs/tecnico/01-modelo-datos-dz-mod-01.md) para el
modelo del libro.

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
- **Trabajar sin conexión.** Cada operación es una llamada HTTP en el
  momento — no hay cola local ni sincronización al recuperar señal. Ver
  la sección «Sincronización» de `DZ-MOD-01` para el porqué y qué cambiaría.
- **Reporte consolidado de varios repartidores a la vez** — hoy cada
  vista muestra a quien tiene la sesión abierta, no un tablero de todos
  juntos.
- **Actualizar el costo de un producto ya existente** — hoy sólo se fija
  al dar de alta.
