# app

Web sin build ni dependencias, igual que el panel de Caja Zeta y la app zzz.

| Archivo | Qué es |
|---|---|
| `index.html` | El aplicativo. Login real (clave + TOTP) contra `server/api/`, seis vistas sobre el libro de asientos: Hoy, Carga, Vender, Cierre, Clientes, Precios, más Usuarios. Tres roles, optimizador de ruta |
| `core/` | Motores puros de seguridad, probados en Node y en el navegador con la misma suite (66/66): `totp.js`, `autorizacion.js`, `autenticacion.js`, `usuarios.js`, `auditoria.js`. Ver [`DZ-SEG-01`](../docs/tecnico/04-seguridad-dz-seg-01.md). Los motores del libro (stock, cierre, sugerido) siguen dentro de `index.html`, no extraídos todavía |

## Qué es de verdad y qué es maqueta

**Funciona de verdad:** el libro de asientos, el cálculo de stock por ubicación, la carga
sugerida desde el histórico, el descuento de camioneta, el congelado de precio en el
renglón, la remarcación masiva por rubro, los dos controles del cierre, las invariantes 4
y 6 (no vender lo que no se cargó; no cambiar el precio de una venta cerrada), el
optimizador de ruta con ventanas horarias, las zonas a evitar cargadas por el usuario
(penalizan el optimizador y fuerzan Waze en esa parada), los deep links de Google Maps y
Waze, el alta de productos y clientes (con stock inicial asentado como `compra`, nunca
como campo editado), el lector de código de barras con `BarcodeDetector` nativo (completa
el alta o agrega un renglón directo en una venta), el panel de WhatsApp con links
`wa.me` y el total vendido en vivo, y **Encargue** — la venta sin camioneta que no toca el
libro hasta que se entrega, verificado con las mismas invariantes de una venta normal
(probado: bloquea la entrega si falta stock en la camioneta, exige medio de pago, y un
renglón especial no se puede entregar sin vincularlo antes a un producto real).

**Es simulado:** la captura de GPS (`capturarPunto()` inventa coordenadas sobre la zona; en
el equipo real es `navigator.geolocation`), el histórico de compra por cliente, la última
visita, y el «orden de siempre» de la ruta — que está generado, así que el ahorro del
optimizador se ve mucho mayor de lo que sería sobre una ruta rodada.

**Ya es servidor, no sólo interfaz:** quién ve costos y márgenes lo decide el rol de la
sesión (ADMIN, DEPOSITO o REPARTIDOR), verificado por `server/api/` en cada pedido — un
REPARTIDOR que le pida los datos de un DEPOSITO directamente a la API recibe `403`, no
sólo una pantalla distinta. Ver [`DZ-SEG-01`](../docs/tecnico/04-seguridad-dz-seg-01.md).

**No está:** persistencia ni sincronización del libro operativo (clientes, productos,
ventas, asientos, encargues siguen en memoria del navegador, F0), remito compartible,
envases, lotes.

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

`vEncargue()` — cliente + renglones (de catálogo o especiales) → `guardarEncargue()` sin
tocar el libro. Recién en `confirmarEntregaEncargue()` se generan los asientos, con el
mismo motor `asentar('venta', CAM, 'cliente', ...)` que usa `confirmarVenta()` en Vender.

Probado de punta a punta: fusión de cantidades al agregar el mismo producto dos veces,
bloqueo de entrega sin stock suficiente en la camioneta (invariante 4), vinculación de un
renglón especial a un producto real y su efecto en `encargueListoParaEntregar()`,
cancelación con motivo, y que nada de esto rompe `simular()` ni el resto de la app.

## El lector de código de barras

`escanearCodigo(callback)` es genérico: no apunta a un campo fijo, recibe qué hacer con el
código leído. Lo usan tanto el alta de producto como el agregado de un renglón en Vender.

Comprobado en este entorno de prueba (sin cámara real disponible): el camino sin cámara
—`getUserMedia` rechazado— cae correctamente al formulario manual, y ese fallback completa
el mismo callback que hubiera completado un escaneo real. **El escaneo con cámara en sí no
se pudo probar acá** —hace falta un dispositivo con cámara de verdad— así que esa parte
queda validada por lectura de código, no por prueba en vivo.

No anda en Safari/iPhone (`BarcodeDetector` sin soporte nativo) ni abriendo el archivo con
doble clic (`getUserMedia` exige http/https). Los dos casos caen al mismo formulario
manual, nunca a un error sin salida.

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

Para correr los 66 tests de los motores de seguridad (parado en `app/`):

```bash
node core/test/run.js
```

Para el modo impresión dentro de la app: Cmd+P.
