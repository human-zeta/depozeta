# depo zeta — concepto · DZ-APP-01

Documento interno. **No enviar al cliente.**
Prototipo navegable: https://claude.ai/code/artifact/68184935-c60f-4a8d-ae02-33256d0683df

---

## Qué es

**El libro de la mercadería.** Un sistema de reparto que trata cada bulto que sale del
depósito con el mismo rigor con el que Caja Zeta trata cada peso que entra a la caja.

La familia queda así:

| Producto | Qué concilia | Contra qué |
|---|---|---|
| **Caja Zeta** | La plata | Las cuentas de pago vs. el libro contable |
| **zzz** | La exposición | La matriz de madurez vs. la evidencia |
| **depo zeta** | La mercadería y su plata | La carga de la camioneta vs. lo vendido |

---

## El principio que ordena todo el diseño

> **Carga − ventas − devoluciones = 0.**
> Si no da cero, hay faltante. Y el faltante se ve el mismo día, no a fin de mes.

Ese es el producto. Todo lo demás —clientes, precios, rutas— existe para alimentar esa
resta. Un sistema de reparto que carga ventas pero no cierra la camioneta es una planilla
con pretensiones.

**La consecuencia estructural:** el stock no es un número que se edita, es un **saldo que
se calcula**. Cada movimiento (carga, venta, devolución, ajuste, rotura) es un asiento que
no se borra. Corregir un error es un contra-asiento con motivo, nunca una edición. Igual
que el libro de Caja Zeta.

**Por qué esto y no aquello:** un stock editable siempre cuadra, porque el que se equivoca
lo acomoda. Un stock calculado no cuadra hasta que alguien explica la diferencia — y esa
explicación es exactamente el dato que hoy no existe.

---

## Alcance decidido

Cuatro definiciones tomadas el 18 de agosto de 2026. Cada una borró trabajo del proyecto.

| Decisión | Qué implica | Qué borró |
|---|---|---|
| **Rubro mixto, varias líneas** | Vencimiento y envase retornable son atributos **opcionales por producto**, no supuestos del modelo | Nada — es el modelo general |
| **Vos + 1 a 3 repartidores, con depósito** | Cada uno en su celular, más un puesto en el depósito. Necesita sincronización | Descartó el local-first puro de zzz |
| **Todo contado en el momento** | No hay cuenta corriente. El cierre es por medio de pago | **Borró el módulo más pesado del rubro:** saldos, antigüedad de deuda, límite de crédito, gestión de cobranza |
| **Remito interno, nada fiscal** | Comprobante propio, compartible por WhatsApp o PDF | Descartó la integración ARCA/WSFE: certificados, homologación, CAE |

**La regla que dejó:** el sistema no factura y no fía. Entrega, cobra en el momento y
rinde. Es un producto más chico y mucho más terminable que el ERP de reparto genérico.

---

## El día, que es la unidad de trabajo

Todo el sistema está organizado alrededor de una jornada de reparto, no alrededor de un
menú de módulos.

1. **Carga.** El depósito arma lo que sube a la camioneta. La app sugiere cantidades según
   la ruta del día y el histórico de cada cliente. Queda firmada: quién cargó, qué y cuánto.
2. **Ruta.** La lista de clientes que toca hoy según su frecuencia, en el orden en que se
   recorren. Cada parada abre en Google Maps con un toque.
3. **Parada.** Venta (productos, precio de su lista, medio de pago) o **no-venta con
   motivo**. Se captura el punto GPS de la entrega.
4. **Rendición.** De vuelta en el depósito: lo que sobra se descarga, la resta tiene que
   dar cero, y la caja tiene que coincidir con las ventas por medio de pago.

**Lo que esto define:** la pantalla principal no es un tablero, es **hoy**.

---

## Módulos

| Módulo | Qué hace | Estado |
|---|---|---|
| **Hoy** | Hoja de ruta del día con estado por parada, hora estimada de llegada, avance y caja acumulada | F0 |
| **Recorrido** | Optimizador local con ventanas horarias, comparación contra el orden de siempre, y navegación por Maps o Waze | F0 |
| **Perfiles** | Repartidor y depósito, con vistas y datos distintos | F0 |
| **Carga y rendición** | Movimiento depósito ↔ camioneta, con la resta que tiene que dar cero | F0 |
| **Venta** | Cliente → productos → lista de precios → medio de pago → remito | F0 |
| **Clientes** | Cartera con contacto, domicilio, **pin GPS real**, frecuencia de visita, historial y motivo de última no-venta | F0 |
| **Productos** | Stock de depósito y de camioneta, costo de reposición, listas de precios, remarcación masiva por porcentaje | F0 |
| **Cierre de caja** | Efectivo + transferencia + QR contra ventas del día por medio de pago | F0 |
| **Encargue** | Venta tomada sin camioneta, contra el catálogo o algo especial a conseguir | F0 |
| **Remito** | Comprobante de entrega compartible por WhatsApp o PDF | F1 |
| **Sincronización** | Apilado de asientos entre celulares y depósito | F1 |
| **Informes** | Ranking de clientes, productos que no rotan, faltantes acumulados por repartidor | F1 |
| **Envases retornables** | Saldo de cascos y bidones por cliente, para las líneas que lo usan | F2 |
| **Vencimientos** | FIFO por lote y alerta de próximo a vencer, para las líneas que lo usan | F2 |

---

## Las seis ideas propias

Lo que separa esto de una planilla de Excel con más pantallas.

**1. El pin GPS vale más que la dirección.** Media cartera vive en «la casa de rejas verdes
al lado del kiosco». La app captura las coordenadas **donde efectivamente se entregó**;
desde la segunda visita el punto es exacto. No necesita geocodificar direcciones —que se
paga por request y falla justo en las direcciones difíciles— porque el repartidor ya estuvo
ahí.

**2. El optimizador de ruta corre en el celular y sabe algo que Google no.** Vecino más
cercano y después 2-opt sobre distancia en línea recta con factor de calle. Con veinte
paradas resuelve en milisegundos, **sin API, sin key, sin costo por request y sin señal**.

Lo que lo separa de un ruteador comercial no es el algoritmo, es la función de costo. Los
horarios en que cada cliente recibe están en las notas del repartidor, no en el mapa, y son
lo que decide si hay venta:

| Situación | Qué cuesta de verdad | Cómo lo pondera |
|---|---|---|
| Llegás antes de que abra | Esperar. Molesto, no fatal | 10 km equivalentes por hora parado |
| Llegás después de que cerró | **La venta entera** | 25 km equivalentes |

Por eso el optimizador acepta hacer más kilómetros si con eso llega a horario, y lo dice en
el botón: *«3,4 km más, pero llegás a horario»*. Un ruteador que solo minimiza distancia
resuelve el problema equivocado — **llegar cuando está cerrado es perder la venta con menos
nafta**.

**La honestidad que va con esto:** sobre una ruta rodada hace años, el ahorro en kilómetros
va a ser chico, porque el orden bueno ya lo sabe el repartidor. Lo que sí aparece siempre es
lo otro: el cliente que cambió el horario y al que la ruta de siempre le llega tarde.

**Sus límites, declarados:** no sabe de calles de una mano, de las vías del tren ni del
tráfico del momento. Para veinte paradas en tres barrios eso importa poco; para logística de
larga distancia haría falta otra cosa.

**3. El «no compró» es dato, no ausencia de dato.** La visita sin venta se registra con
motivo: cerrado, no estaba, tenía stock, se fue al precio de otro. Tres motivos «precio» en
un mes en la misma zona es un competidor entrando, y hoy eso no se ve hasta que se perdió
el cliente.

**4. Costo de reposición, no costo histórico.** Con inflación, el margen calculado sobre lo
que se pagó hace cuarenta días es ficción. Cada producto lleva su costo de reposición y la
app avisa cuando un precio de lista quedó abajo. La remarcación es masiva por porcentaje,
por lista o por rubro.

**5. Carga sugerida.** Ruta del día + histórico de compra de cada cliente = cuántos bultos
subir. Ataca los dos errores caros del reparto: volver cargado (plata inmovilizada y
mercadería castigada) y quedarse corto en la tercera parada (venta perdida con el cliente
adelante).

**6. El faltante tiene dueño.** La rendición es por repartidor y por día. El faltante
acumulado por persona no es una acusación, es un número — y la mayoría de las veces
aparece un error de carga, no un robo. Pero sin el número no aparece ninguno de los dos.

---

## Alta de productos y clientes, y el lector de códigos

Dos formularios nuevos, uno por vista: **Agregar producto** en Precios (depósito) y
**Agregar cliente** en Clientes (los dos perfiles). Un producto nuevo entra con stock cero
salvo que se declare un stock inicial —que se asienta como `compra` con motivo «alta de
producto», nunca como un campo editado—; un cliente nuevo entra **sin pin**, igual que
cualquier cliente real: se completa solo en la primera entrega.

**El lector de código de barras** usa la `BarcodeDetector` nativa del navegador —cámara
trasera, sin librería, sin dependencia—, con un callback genérico que sirve tanto para
completar el código al dar de alta un producto como para agregar un renglón directo
durante una venta (un escaneo = una línea, como un lector de POS real).

Dos límites reales, no cosméticos:

- **La cámara del navegador no sirve en iPhone.** `BarcodeDetector` nunca se implementó en
  WebKit —o sea, en ningún navegador de iOS, ni siquiera Chrome, que ahí también es
  WebKit— y Apple no anunció que lo vaya a hacer (verificado en agosto de 2026). **Pero
  eso no deja al iPhone afuera:** iOS trae **«Escanear texto»** en su propio teclado
  (Live Text, iOS 15+), que lee los dígitos impresos debajo de las barras y los escribe
  en el campo. Es nativo del sistema, no hace falta instalar ni sumar nada. La app detecta
  iOS y explica exactamente eso en el lugar donde se usa, en vez de mandar a tipear trece
  dígitos a mano. Si algún día hiciera falta escaneo con cámara de verdad en iOS, la única
  vía es una librería WebAssembly (tipo ZXing) — **rompe el principio de cero
  dependencias del proyecto, así que es una decisión del dueño, no un default.**
- **No anda abriendo el archivo con doble clic.** `getUserMedia` exige `http`/`https`; un
  `file://` lo bloquea. Cae al mismo fallback manual. Ya no es un problema en el uso real:
  la app se sirve desde su dominio.

## Encargue — la venta que se toma sin camioneta

El repartidor no siempre vende desde la ruta con la camioneta al lado. También pasa
**de a pie**: un cliente nuevo, alguien que pide algo puntual, una vuelta de prospección.
Eso necesitaba su propia sección — no encajaba en **Vender**, que exige stock ya cargado
y cliente de hoy.

**La distinción que ordena el diseño:** un encargue no es una venta. Es una intención. No
mueve un solo asiento hasta que se entrega, y recién ahí se convierte en una venta de
verdad — con el precio de ese momento, no el del día en que se tomó el pedido, y sujeta a
las mismas invariantes que cualquier otra venta (no se entrega lo que no está en la
camioneta, no hay entrega sin medio de pago). Un encargue que nunca se resuelve no ensucia
el libro: no generó ningún asiento para empezar.

**Dos tipos de renglón, según lo que pidió el cliente:**

1. **Del catálogo** — un producto que ya existe. Se muestra el stock del **depósito** como
   referencia (no el de la camioneta: todavía no salió a repartir), así el vendedor sabe si
   es viable en el momento o si hay que esperar reposición.
2. **Especial** — algo que no está en el catálogo. Se anota en texto libre. No se puede
   entregar así nomás: alguien del depósito tiene que darlo de alta como producto real
   (reusa el mismo formulario de **Precios → Agregar producto**) y después **vincularlo**
   al renglón especial. Sin ese paso, la app no deja avanzar — no por burocracia, sino
   porque no hay forma honesta de generar un asiento de venta para un producto que no
   existe.

**Estados:** pendiente → preparado (el depósito avisa que ya lo separó — informativo, no
toca el libro) → entregado (ahí sí, asiento de verdad). O cancelado, con motivo, igual que
una no-venta o un ajuste.

**Lo que avisa, y lo que no hace todavía:** la vista de **Carga** muestra los encargues
pendientes de clientes que tocan hoy, para que el depósito los sume a lo que ya iba a
cargar. **No los suma solo** — el cálculo de «sugerido» sigue siendo el histórico de
siempre, sin este dato todavía. Es un aviso, no una automatización.

## Perfiles y roles

Tres roles, no dos — desde la noche del 19 de agosto, con login real detrás
(**`DZ-SEG-01`**, clave + TOTP obligatorio, servidor propio). **ADMIN** se
sumó pensando en si el producto algún día sirve a más de una empresa,
aunque hoy sea de una sola; **DEPOSITO** puede crear cuentas de
**REPARTIDOR** —el pedido literal del dueño del proyecto—, y nadie crea a
un par ni a un superior.

| | Repartidor | Depósito | Admin |
|---|---|---|---|
| **Hoy** | Su ruta, con horarios y navegación | Estado de las camionetas | Igual que depósito |
| **Carga** | — | Arma y firma la carga | ✓ |
| **Vender** | Vende en la calle | — | — |
| **Cierre** | Rinde lo suyo | Control por repartidor y faltante | ✓ |
| **Clientes** | Cartera completa, la necesita para vender | Igual | Igual |
| **Precios** | — | Costo de reposición, margen, remarcación | ✓ |
| **Usuarios** | — | Crea y desactiva REPARTIDOR | Crea y desactiva DEPOSITO y REPARTIDOR |

**Lo que realmente se separa es el margen.** El repartidor necesita el precio de venta y no
necesita el costo. Que el costo de reposición y el margen por producto no salgan de la
camioneta no es desconfianza: es que ese número, contado en el mostrador de un cliente,
vuelve como una negociación de precio.

**Esto ya no es un límite de interfaz — es un límite de servidor, verificado.** Hasta la
noche del 19 de agosto, esconder el costo era una decisión de interfaz nomás: quien tenía
el celular podía abrir las herramientas del navegador y verlo igual, y así quedó
documentado durante todo F0. Dejó de ser así con `DZ-SEG-01`: el rol viene de una sesión
autenticada contra un servidor real (Cloudflare Worker + D1), y un REPARTIDOR que le pida
directamente a la API los datos de un DEPOSITO recibe `403 NO_AUTORIZADO` — probado en
vivo, no sólo escrito. Esa misma noche el resto del libro —ventas, clientes, productos,
asientos, encargues, zonas— seguía en memoria del navegador, con datos de ejemplo; quedó
conectado al servidor la noche siguiente (19 de agosto, sesión posterior), con el mismo
principio: el servidor revalida todo de nuevo, nunca confía en lo que mande el cliente. Ver
`DZ-MOD-01` para el modelo del libro y `DZ-SEG-01` para el detalle de auth.

## El panel de WhatsApp

Pedido del usuario: un desplegable de un costado, sobre la ventana, para ver WhatsApp y
las ventas del día sin tapar el resto del aplicativo. Está construido así —un panel fijo
a la derecha con `transform`, no un modal— y **no bloquea nada**: se puede seguir
remarcando o cargando un cliente con el panel abierto, probado.

**Lo que hace hoy (V1, sin riesgo):** por cada cliente de la ruta con teléfono, un botón
que abre `wa.me` —el WhatsApp de siempre del repartidor, con el número ya cargado— y un
resumen en vivo de lo vendido en el día. Cero backend, cero costo, cero riesgo de cuenta.

**Lo que NO hace, y por qué no es un recorte sino un límite real:** no hay chat en vivo
adentro del panel. Meta bloquea explícitamente embeber WhatsApp Web en un iframe de otro
sitio —no es que falte tiempo, es que la plataforma no lo permite—. Un inbox de verdad
adentro de la app tiene dos caminos, y ninguno es «gratis y sin costo»:

| Camino | Qué es | El costo real |
|---|---|---|
| Librería no oficial (whatsapp-web.js, **Baileys**) | Automatiza el WhatsApp personal vía QR, igual que WhatsApp Web | Viola los términos de Meta — **el número puede quedar baneado sin aviso y de forma permanente**, entre 2 y 8 semanas según lo reportado en 2026. Documentado con scaffold en [`DZ-BAI-01`](../tecnico/03-baileys-alternativa-dz-bai-01.md), no como reemplazo de lo elegido |
| **WhatsApp Business Platform (Cloud API)** — **elegido** | Oficial de Meta | Pide cuenta de Meta Business verificada, número (nuevo o el mismo con coexistencia), plantillas aprobadas. El nivel gratuito de 1.000 conversaciones ya no existe; el modelo de precios cambia otra vez el 1° de octubre de 2026 |

**Decisión tomada por el dueño del proyecto el 19 de agosto de 2026: Cloud API oficial.**
No la librería no oficial — no vale la pena el riesgo de banear el número real de la
operación. El checklist completo, el criterio para elegir número nuevo o coexistencia, y
el modelo de precios vigente con sus fechas están en
[`DZ-WSP-01`](../tecnico/02-whatsapp-cloud-api-dz-wsp-01.md). El scaffold del webhook ya
está escrito en `server/whatsapp-webhook.mjs`, sin probar todavía contra una app real de
Meta — falta que el dueño del proyecto complete la verificación de su cuenta, que es un
trámite que nadie puede hacer por él.

## Zonas a evitar

**El pedido original era «que Waze sugiera el recorrido».** No se puede: Waze no tiene API
de ruteo (ver más abajo) y ninguna de las dos plataformas —ni Waze ni Google— vende «evitar
zona peligrosa» como parámetro de ruta. No es una limitación de este proyecto, es que ese
producto no existe en el mercado.

Lo que sí se puede construir, y es lo que se hizo: **una lista de zonas que carga el propio
repartidor o el depósito**, porque cuál cuadra es riesgosa es información hiperlocal que
sólo tiene quien reparte ahí. La app no la adivina ni la sugiere.

Cada zona es un punto (tipeado o elegido tocando el mapa) más un radio en metros, con motivo
opcional y un límite horario opcional —una esquina puede ser tranquila de día y otra cosa de
noche—. Tres efectos, honestos sobre lo que garantizan:

1. **El optimizador la penaliza fuerte.** Cualquier tramo cuyo segmento en línea recta pase
   dentro del radio de una zona suma `PENAL_ZONA` (40 km equivalentes, más que perder una
   venta) al costo de esa ruta. Cuando existe un orden alternativo que la evita, el 2-opt lo
   encuentra — probado: sobre la cartera de ejemplo, reordenar bajó de tres tramos cruzando
   una zona a cero.
2. **Esa parada se abre en Waze primero**, no en Maps, porque es la app que de verdad va a
   tener alertas en vivo de la zona en el momento real de manejar — la única «inteligencia de
   Waze» que existe de verdad es la del conductor usando la app tal cual es.
3. **Se avisa siempre**, en la parada y en el resumen del recorrido, aunque no se pueda
   evitar.

**El límite que hay que decir de frente:** la detección es geométrica —línea recta entre dos
puntos, con el mismo plano local que usa el optimizador—, no callejera. Puede marcar un
tramo que en la calle real rodea la zona sin problema, o no marcar uno que la cruza por una
cuadra distinta. Es una ayuda de criterio, no una garantía de ruta segura.

## Waze y Google Maps

Los dos botones de navegación abren la app instalada por *deep link*: gratis, sin key, sin
cuenta de desarrollador.

```
https://waze.com/ul?ll=LAT,LNG&navigate=yes
https://www.google.com/maps/dir/?api=1&destination=LAT,LNG
```

**Lo que no existe es «usar los datos de Waze».** Waze no publica una API de tráfico ni de
tiempos de viaje. Lo que ofrece es:

| Producto de Waze | Para qué sirve | Nos sirve |
|---|---|---|
| Deep links | Abrir la app y navegar a un punto | **Sí, ya está puesto** |
| Waze for Cities | Intercambio de datos con gobiernos y municipios | No: es para entidades públicas |
| Waze Ads | Publicidad dentro del mapa | No |

Si algún día hace falta tráfico real, la puerta es la **Routes API de Google** con
`TRAFFIC_AWARE`, que se paga por request. A esta escala —una consulta por repartidor por
día— el costo es de centavos por mes, pero exige proyecto en Google Cloud, tarjeta y una
key que hay que cuidar. **Conviene medirlo antes de pagarlo:** en un reparto de veinte
paradas dentro de tres barrios el tráfico no es lo que cuesta plata; los horarios sí.

Por eso la app trae **«Comparar con Google»**: corre el optimizador local y el de Google
sobre los mismos puntos y muestra las dos filas juntas, kilómetros y paradas fuera de
horario. **La decisión de pagar se toma con el número a la vista, no con una corazonada.**

### La clave de Google no vive en el código

Se pega una vez en la app y queda en `localStorage` de ese dispositivo. Nunca entra al
repositorio ni a la demo publicada.

**Una clave de mapas usada desde el navegador es visible por diseño** —cualquiera que abra
la app la lee— así que el secreto no es la protección. La protección son tres cosas, y hay
que ponerlas antes de usarla en serio:

1. **Restricción por dominio** (HTTP referrer) a los dominios propios.
2. **Restricción por API**: sólo las que se usan.
3. **Tope de cuota diario**, que es lo que convierte un abuso en un aviso en vez de una
   factura.

Las tres APIs de Google que aparecen acá **se habilitan y se facturan por separado**: Maps
JavaScript dibuja el mapa, Directions o Routes calculan el recorrido, Geocoding convierte
direcciones en coordenadas. Tener una no da las otras. Y ninguna funciona sin cuenta de
facturación asociada al proyecto: sin tarjeta, el mapa igual se dibuja pero sale gris con
«For development purposes only» encima y el resto devuelve `REQUEST_DENIED`.

## Arquitectura

Mismo patrón que Caja Zeta y zzz: **web sin build ni dependencias, motores puros en
`app/core/` que corren igual en Node y en el navegador, probados con la misma suite en los
dos lados.** PWA instalable, offline por diseño.

**El offline no es una prestación, es el requisito.** El reparto pasa en la calle, en
sótanos, en zonas sin señal. La app opera la jornada entera sin conexión y sincroniza
cuando hay.

**La sincronización es simple porque el modelo es de asientos.** Cada dispositivo genera
asientos con su identificador de origen y su marca de tiempo; el servidor los apila y
devuelve los que faltan. No hay edición concurrente del mismo registro —cada repartidor
toca su propia carga— así que **no hace falta resolución de conflictos**: hace falta un
log que no se borra, que es lo que ya somos.

Opciones de servidor, con su costo real:

| Opción | Costo | Cuándo |
|---|---|---|
| **Cloudflare Workers + D1** | USD 0 en el plan gratuito, muy por encima del volumen de tres repartidores | Recomendada para arrancar. Sin servidor que mantener |
| **VPS propio** | ~USD 5/mes | Si se prefiere todo en casa, con el mismo `api/servidor.mjs` de Caja Zeta |
| **Sin servidor, archivo consolidado** | USD 0 | Solo si la sincronización pasa a ser una vez por día y manual. Frágil con tres personas |

**La decisión que permitió postergar, y por qué ya no aplica del todo:** F0 corría
local-first puro para no bloquear el prototipo con una decisión de infraestructura. La
sincronización se agregó en F1 sin rehacer nada, porque los asientos ya estaban — Cloudflare
Workers + D1 fue la opción elegida, y desde el 19 de agosto ya corre (en local, sin cuenta
de Cloudflare real todavía). Lo que sigue postergado de F1: remito compartible, informes,
PWA instalable, y trabajar sin conexión.

---

## Lo que depo zeta no hace

1. **No factura.** No emite comprobante fiscal ni habla con ARCA. Emite remito interno.
2. **No fía.** No hay cuenta corriente ni gestión de cobranza. Se cobra en el momento.
3. **No es un GPS de control.** Registra dónde se entregó, no dónde está la persona. La
   diferencia importa y se dice de frente al equipo.
4. **No inventa demanda.** La carga sugerida es una sugerencia con su cálculo a la vista,
   no un pronóstico.

---

## Fases

| Fase | Qué entrega | Estado |
|---|---|---|
| **F0** | Prototipo navegable con datos de ejemplo: hoy, carga, venta, rendición, clientes, productos, cierre | Hecho |
| **F1** | Sincronización con datos reales (auth, roles, libro completo), remito compartible, informes, PWA instalable | Sincronización hecha (`DZ-SEG-01`, `DZ-MOD-01`) — remito compartible, informes y PWA sin empezar |
| **F2** | Envases retornables, lotes y vencimientos, carga sugerida con histórico real | — |

---

## Falta en el repositorio

- `docs/tecnico/04-requerimientos-dz-ers-01.md` — la especificación SMART al estilo
  CZ-ERS-01. Se escribe cuando el prototipo se haya probado en una jornada real.
- `docs/identidad/sistema-visual-depo-zeta.md` — la paleta y los componentes, hoy solo
  declarados en el prototipo.
- El servidor de sincronización, con su prueba de que un asiento no se pierde.

## Pendientes de decisión

1. **La grafía del nombre.** zzz va siempre en minúscula por argumento de marca y Caja Zeta
   en Title Case. **depo zeta** se escribe hoy en minúscula por descarte, sin argumento
   propio. Hay que decidirlo antes de que aparezca en pantalla del cliente.
2. **Producto propio o herramienta interna.** Si se vende a otras distribuidoras cambia el
   alcance: multi-empresa, soporte, precio. Si es herramienta de la casa, no.
3. **Quién carga la cartera inicial** y desde dónde. Importar de una planilla existente es
   una tarde; tipearla de cero es una semana.
