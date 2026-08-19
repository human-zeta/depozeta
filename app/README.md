# app

Web sin build ni dependencias, igual que el panel de Caja Zeta y la app zzz.

| Archivo | Qué es |
|---|---|
| `index.html` | Prototipo F0. Seis vistas sobre el libro de asientos real: Hoy, Carga, Vender, Cierre, Clientes, Precios. Dos perfiles y optimizador de ruta |
| `core/` | **Vacío.** Los motores se extraen del prototipo en F1, para probarlos con la misma suite en Node y en el navegador |

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

**Es interfaz, no seguridad:** el perfil `repartidor` esconde costos y márgenes, pero el
estado vive en el dispositivo. La separación real es del servidor de F1.

**No está:** persistencia, sincronización, remito compartible, envases, lotes.

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

Doble clic. Para el modo impresión, Cmd+P.
