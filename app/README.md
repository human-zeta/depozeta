# app

Web sin build ni dependencias, igual que el panel de Caja Zeta y la app zzz.

| Archivo | Qué es |
|---|---|
| `index.html` | El aplicativo. Login real (clave + TOTP) contra `server/api/`, seis vistas sobre el libro de asientos real: Hoy, Carga, Vender, Cierre, Clientes, Precios, más Usuarios. Tres roles, optimizador de ruta local |
| `core/` | Motores puros, probados en Node y en el navegador con la misma suite (130/130). Seguridad: `totp.js`, `autorizacion.js`, `autenticacion.js`, `usuarios.js`, `auditoria.js` — ver [`DZ-SEG-01`](../docs/tecnico/04-seguridad-dz-seg-01.md). Libro operativo: `libro.js` (asientos y stock), `ventas.js`, `catalogo.js`, `clientes.js`, `zonas.js`, `encargues.js` — ver [`DZ-MOD-01`](../docs/tecnico/01-modelo-datos-dz-mod-01.md). El optimizador de ruta (`km`, `agenda`, `optimizar`) sigue dentro de `index.html`: corre 100% en el dispositivo, no necesita servidor |

## Qué es de verdad y qué es maqueta

**Funciona de verdad, sincronizado contra `server/api/`:** el libro de asientos, el cálculo
de stock por ubicación, la carga (depósito → camioneta del repartidor logueado), el
congelado de precio en el renglón (invariante 6 — el servidor lo resuelve contra el
catálogo real al vender, nunca confía en lo que mande el body), la remarcación masiva por
rubro, las invariantes 2 a 5 (cantidad positiva, motivo obligatorio en merma/ajuste, no
vender lo que no se cargó, medio de pago obligatorio), el alta de productos y clientes (con
stock inicial asentado como `compra`, nunca como campo editado), y **Encargue** — la venta
sin camioneta que no toca el libro hasta que se entrega, con las mismas invariantes de una
venta normal (bloquea la entrega si falta stock en la camioneta, exige medio de pago, y un
renglón especial no se puede entregar sin vincularlo antes a un producto real — las tres
cosas revalidadas por el servidor, no sólo por el formulario).

Local al dispositivo, sin servidor porque no lo necesita: el optimizador de ruta con
ventanas horarias, las zonas a evitar cargadas por el usuario (penalizan el optimizador y
fuerzan Waze en esa parada), los deep links de Google Maps y Waze, el lector de código de
barras con `BarcodeDetector` nativo (completa el alta o agrega un renglón directo en una
venta), el panel de WhatsApp con links `wa.me` y el total vendido en vivo.

**Es simulado:** la captura de GPS (`puntoSimulado()` inventa coordenadas sobre la zona; en
el equipo real sería `navigator.geolocation` — lo que el servidor hace con ese punto sí es
real: lo guarda si el cliente no tenía uno propio todavía, ver `puedeActualizarPunto()` en
`core/clientes.js`), el histórico de compra por cliente (`sugerido()` devuelve 0: la fuente
real necesita acumular ventas primero), la última visita, y el «orden de siempre» de la
ruta hasta que se aprende de entregas reales.

**Ya es servidor, no sólo interfaz:** quién ve costos y márgenes lo decide el rol de la
sesión (ADMIN, DEPOSITO o REPARTIDOR), verificado por `server/api/` en cada pedido — un
REPARTIDOR que le pida los datos de un DEPOSITO directamente a la API recibe `403`, y el
campo `costo` directamente no está en la respuesta de `GET /api/productos`, no sólo una
pantalla distinta. Ver [`DZ-SEG-01`](../docs/tecnico/04-seguridad-dz-seg-01.md).

**No está:** trabajar sin conexión (toda operación es HTTP en el momento, ver
«Sincronización» en `DZ-MOD-01`), reporte consolidado de varios repartidores a la vez,
remito compartible, envases, lotes.

## Login y roles

La app abre con una pantalla de login, no directo al libro. Primer paso: la URL de
`server/api/` (una sola vez, queda en `localStorage` del dispositivo, nunca en este
repo — mismo patrón que la clave de Google Maps más abajo). Con eso configurado:

1. **Usuario + clave** contra `POST /api/login`. Si es la primera vez, el servidor
   responde `ENROLAR` y la app muestra el QR (vía `api.qrserver.com` — única dependencia
   externa de todo el prototipo, con el secreto siempre visible como texto por si el QR no
   carga) para sumar la cuenta a cualquier app TOTP (Google Authenticator, Authy, etc.).
2. **Código de 6 dígitos** contra `POST /api/login/totp`. Ahí se abre la sesión de verdad.

El chip del encabezado ya no es un selector de perfil — muestra la sesión real (usuario y
rol) con un botón **Salir**. La pestaña **Usuarios** (🔐) lista las cuentas y permite altas
y bajas: DEPOSITO sólo puede crear REPARTIDOR, ADMIN cualquier rol menor al suyo — nadie
crea un par ni un superior, aplicado por el servidor, no por lo que el `<select>` deje
elegir en pantalla. Backend, rutas y cómo correrlo en local:
[`server/api/README.md`](../server/api/README.md).

## Encargue

`vEncargue()` — cliente + renglones (de catálogo o especiales) → `guardarEncargue()`
manda `POST /api/encargues`, sin tocar el libro. Recién en `confirmarEntregaEncargue()` —
`POST /api/encargues/:id/entregar` — el servidor arma la venta real y sus asientos, con el
mismo motor (`app/core/ventas.js`) que usa la venta directa: mismo precio resuelto contra
el catálogo en ese momento, misma invariante 4 contra la camioneta.

Probado de punta a punta, en Node (`core/test/encargues.test.js`) y en vivo contra el
servidor real: fusión de cantidades al agregar el mismo producto dos veces, bloqueo de
entrega sin stock suficiente en la camioneta, bloqueo de entrega con un renglón especial
sin vincular (`ENCARGUE_INCOMPLETO`, 409), vinculación de un renglón especial a un
producto real y su efecto en `encargueListoParaEntregar()`, cancelación con motivo, y que
un encargue ya entregado o cancelado no admite otra transición (`TRANSICION_INVALIDA`).

## El lector de código de barras

`escanearCodigo(callback)` es genérico: no apunta a un campo fijo, recibe qué hacer con el
código leído. Lo usan tanto el alta de producto como el agregado de un renglón en Vender.

Comprobado en este entorno de prueba (sin cámara real disponible): el camino sin cámara
—`getUserMedia` rechazado— cae correctamente al formulario manual, y ese fallback completa
el mismo callback que hubiera completado un escaneo real. **El escaneo con cámara en sí no
se pudo probar acá** —hace falta un dispositivo con cámara de verdad— así que esa parte
queda validada por lectura de código, no por prueba en vivo.

La cámara del navegador no sirve en iPhone (`BarcodeDetector` no existe en WebKit y Apple
no lo anunció) ni abriendo el archivo con doble clic (`getUserMedia` exige http/https).
Los dos casos caen al mismo formulario manual, nunca a un error sin salida.

**En iOS el camino que sí funciona es «Escanear texto» del teclado del sistema** (Live
Text): lee los dígitos impresos debajo de las barras y los escribe en el campo, sin
instalar nada ni sumar librerías. `esIOS()` detecta el dispositivo y `panelFallbackEscaneo()`
—más el bloque de alta de producto— lo explican ahí mismo, con el input listo y enfocado.
Verificado simulando el user-agent de iPhone y quitando `BarcodeDetector`: aparece la ayuda
correcta y el camino manual completa el mismo callback que un escaneo real.

## El panel de WhatsApp

Desplegable fijo a la derecha, no modal — se puede seguir usando el resto de la app con el
panel abierto. Dos contenidos, ambos en vivo: links `wa.me` por cliente de la ruta (con
teléfono normalizado con una heurística para Argentina que puede fallar en formatos poco
comunes) y el total vendido en el día.

**No hay chat en vivo adentro del panel.** Meta no permite embeber WhatsApp Web en un
iframe de otro sitio. Un inbox de verdad es un proyecto aparte, con dos caminos posibles
—una librería no oficial con riesgo real de baneo, o la Cloud API oficial con verificación
de Meta Business y costo por conversación— detallados en `DZ-APP-01`. No se avanzó en
ninguno sin que el dueño del proyecto lo decida.

## El mapa, que es opcional

«Ver en el mapa» y «Comparar con Google» piden una clave de Google Maps la primera vez.
**La clave se guarda en `localStorage` de ese dispositivo y nunca entra a este repositorio.**
No la escribas en el HTML: una clave en el código termina publicada.

- En la **demo publicada** el mapa no anda y es lo esperado: ese sandbox bloquea todo script
  externo. Andá con el archivo local.
- Maps JavaScript (dibujar el mapa) y Directions/Routes (calcular recorridos) **son APIs
  distintas, se habilitan aparte y se facturan aparte**.
- Sin cuenta de facturación en el proyecto, el mapa sale con marca de agua y el resto
  devuelve `REQUEST_DENIED`.

## Correr

Doble clic en `index.html` para la interfaz — pero pasar de la pantalla de login necesita
`server/api/` corriendo (`wrangler dev`, ver su README) y al menos el ADMIN creado con
`/api/bootstrap`. Sin eso, se puede mirar la pantalla de login pero no entrar.

Para correr los 130 tests de todos los motores (parado en `app/`):

```bash
node core/test/run.js
```

Para el modo impresión dentro de la app: Cmd+P.
