# Modelo de datos · DZ-MOD-01

Cómo se guarda un reparto. Documento técnico, primero en orden de lectura.

---

## La decisión de fondo

**El stock no se guarda: se calcula.** No hay un campo `cantidad` que se edita. Hay un
libro de asientos que no se borra, y el stock de cualquier ubicación en cualquier momento
es la suma de los asientos que la tocaron.

```
stock(producto, ubicación, momento) = Σ asientos hasta ese momento
```

**Por qué:** un stock editable siempre cuadra, porque el que se equivoca lo acomoda. Un
stock calculado no cuadra hasta que alguien explica la diferencia con un asiento de ajuste
que lleva su motivo y su autor. Esa explicación es el dato que hoy no existe en ningún
reparto chico.

---

## Las cuatro ubicaciones

Todo movimiento va de una ubicación a otra. No hay creación ni destrucción sin asiento.

| Ubicación | Qué es |
|---|---|
| `deposito` | El stock quieto |
| `camioneta:{repartidor}` | La carga del día de cada uno. Una por repartidor |
| `cliente` | Lo entregado. Sale del sistema |
| `merma` | Rotura, vencido, faltante reconocido. Sale del sistema, con motivo |

---

## Entidades

### `producto`

| Campo | Tipo | Nota |
|---|---|---|
| `id` | texto | SKU o código propio |
| `nombre` | texto | |
| `rubro` | texto | Para remarcación masiva y ordenamiento |
| `unidad` | `unidad` \| `bulto` \| `kg` | |
| `unidades_por_bulto` | entero | 0 si no aplica |
| `costo_reposicion` | decimal | **No es el costo histórico.** Es lo que sale reponerlo hoy |
| `costo_actualizado` | fecha | Para avisar cuando el costo quedó viejo |
| `precios` | mapa lista → decimal | Una entrada por lista de precios |
| `vence` | booleano | Opcional por producto. Activa lote y vencimiento en F2 |
| `retornable` | texto \| nulo | Id del envase asociado. Opcional. F2 |
| `activo` | booleano | Baja lógica: un producto discontinuado no se borra, tiene historia |

### `lista_precios`

| Campo | Tipo | Nota |
|---|---|---|
| `id` | texto | `mayorista`, `minorista`, `volumen` |
| `nombre` | texto | |
| `orden` | entero | Para mostrar de menor a mayor |

### `cliente`

| Campo | Tipo | Nota |
|---|---|---|
| `id` | texto | |
| `nombre` | texto | Nombre de fantasía del comercio |
| `contacto` | texto | Quién atiende |
| `telefono` | texto | Se usa para el remito por WhatsApp |
| `domicilio` | texto | Como se dice, no como lo escribe el correo |
| `referencia` | texto | «Al lado del kiosco, rejas verdes». **Campo de primera clase**, no una nota al pie |
| `punto` | `{lat, lng, fecha}` \| nulo | **Capturado en la entrega**, no geocodificado |
| `lista` | texto | Su lista de precios |
| `frecuencia` | ver abajo | Qué días toca |
| `zona` | texto | Agrupador de ruta |
| `orden_zona` | entero | Posición en el recorrido. **Se aprende del orden real de entrega** |
| `recibe` | lista de rangos | **En qué horas te atiende.** `[[8,13],[16,19]]` es un cliente que cierra al mediodía. Es lo que usa el optimizador de ruta, y es dato de primera clase |
| `notas` | texto | Con quién no hablar, portón de atrás, cómo cobra |
| `activo` | booleano | |

### `frecuencia`

Qué días se visita. Tres formas, la que corresponda:

```js
{ tipo: 'dias',     dias: [1, 4] }              // lunes y jueves
{ tipo: 'quincenal', dia: 2, semanas: [1, 3] }  // martes de la 1ra y 3ra semana
{ tipo: 'demanda' }                              // solo si llama
```

**Lo que sale de acá:** la hoja de ruta del día se arma sola. No se carga a mano.

---

## El asiento

La única forma de mover mercadería. Nunca se edita ni se borra.

| Campo | Tipo | Nota |
|---|---|---|
| `id` | texto | `{dispositivo}-{contador}`. Único sin coordinación, para que la sincronización sea apilar |
| `fecha` | ISO 8601 | Del dispositivo que lo generó |
| `tipo` | ver tabla | |
| `origen` | ubicación | |
| `destino` | ubicación | |
| `producto` | id | |
| `cantidad` | decimal | **Siempre positiva.** El signo lo da la dirección origen→destino |
| `autor` | texto | Quién lo hizo |
| `dispositivo` | texto | De qué celular salió |
| `motivo` | texto | **Obligatorio** en `ajuste` y `merma` |
| `ref` | id \| nulo | Venta o carga a la que pertenece |
| `anula` | id \| nulo | Contra-asiento: apunta al asiento que corrige |

### Tipos de asiento

| Tipo | Origen → Destino | Cuándo |
|---|---|---|
| `compra` | — → `deposito` | Entra mercadería del proveedor |
| `carga` | `deposito` → `camioneta:X` | A la mañana |
| `venta` | `camioneta:X` → `cliente` | En la parada |
| `devolucion_cliente` | `cliente` → `camioneta:X` | El cliente devuelve |
| `descarga` | `camioneta:X` → `deposito` | A la vuelta, lo que sobró |
| `merma` | cualquiera → `merma` | Rotura, vencido, faltante reconocido. **Exige motivo** |
| `ajuste` | cualquiera ↔ cualquiera | Corrección de inventario. **Exige motivo y autor** |

---

## La venta

Cabecera y renglones. Los renglones **generan asientos**; la cabecera guarda la plata.

| Campo | Tipo | Nota |
|---|---|---|
| `id` | texto | `{dispositivo}-{contador}` |
| `fecha` | ISO 8601 | |
| `cliente` | id | |
| `repartidor` | texto | |
| `renglones` | lista | `{producto, cantidad, precio_unitario, lista}` |
| `total` | decimal | Suma de renglones. Se recalcula, no se confía |
| `medio_pago` | `efectivo` \| `transferencia` \| `qr` | **No hay `cuenta_corriente`:** se cobra en el momento |
| `punto` | `{lat, lng}` \| nulo | Dónde se entregó. Alimenta el pin del cliente |
| `remito` | texto | Numeración propia. No fiscal |

**El precio se congela en el renglón.** Si mañana se remarca, la venta de ayer no cambia.
Un sistema que recalcula precios viejos no puede auditar nada.

## La no-venta

Pesa igual que la venta, y por eso es una entidad y no un campo vacío.

| Campo | Tipo | Nota |
|---|---|---|
| `id`, `fecha`, `cliente`, `repartidor` | | |
| `motivo` | `cerrado` \| `no_estaba` \| `tiene_stock` \| `precio` \| `otro` | |
| `detalle` | texto | Libre. Con `precio`, el precio del otro si se supo |

**Lo que habilita:** tres `precio` en un mes en la misma zona es un competidor entrando.

## El encargue

Una intención, no un asiento. Se toma sin camioneta al lado —de a pie—, contra el
catálogo o algo que hay que conseguir. **No genera un solo asiento hasta que se
entrega**, y ese es el punto: un encargue que nunca se resuelve no deja rastro en el
libro, porque no llegó a pasar.

| Campo | Tipo | Nota |
|---|---|---|
| `id` | texto | `ENC{contador}` |
| `fecha` | ISO 8601 | Cuándo se tomó el pedido |
| `cliente` | id | Cualquiera de la cartera, no sólo los de la ruta de hoy |
| `autor` | texto | Quién lo tomó |
| `renglones` | lista | Ver abajo — mezcla renglones de catálogo y especiales |
| `estado` | `pendiente` \| `preparado` \| `entregado` \| `cancelado` | |
| `motivo` | texto | Sólo si `cancelado` |
| `venta_id` | id \| nulo | El id de la venta real, una vez `entregado` |

### El renglón, de dos tipos

```
{ tipo:'catalogo', producto: id, cantidad }
{ tipo:'especial', descripcion: texto, cantidad, producto_vinculado: id | nulo }
```

Un renglón `especial` nace sin `producto_vinculado`. No se puede entregar así: primero
tiene que existir como producto real (mismo alta que cualquier producto — con su costo,
sus precios, su código) y después vincularse al renglón. No es un trámite de más: sin un
producto real detrás, no hay forma honesta de generar un asiento de venta — invariante 3
de esta misma tabla, aplicada acá.

### Los tres estados que no son «entregado»

| Estado | Qué significa | ¿Toca el libro? |
|---|---|---|
| `pendiente` | Tomado, nadie lo preparó todavía | No |
| `preparado` | El depósito lo separó | No — es coordinación, no contabilidad |
| `cancelado` | No se va a entregar, con motivo | No |

### Entregar — acá sí es una venta

Al entregar, el encargue se convierte en una venta como cualquier otra, con las mismas
reglas: se arma un renglón por cada línea (usando el producto vinculado si era especial),
**el precio sale de la lista del cliente en ese momento** —no el que tenía cuando se tomó
el pedido, todavía no existía como venta— y exige `medio_pago`, igual que la invariante 5.

Y antes de dejar entregar, se vuelve a chequear la invariante 4 contra la camioneta:
`stock(producto, camioneta) ≥ cantidad`, para cada renglón. **Un encargue pendiente no
reserva stock.** Si dos encargues compiten por el mismo producto limitado, se resuelve a
mano — no hay reserva automática todavía.

---

## La jornada y su cierre

La jornada es lo que se abre a la mañana y se cierra a la tarde.

| Campo | Tipo |
|---|---|
| `id`, `fecha`, `repartidor` | |
| `estado` | `abierta` \| `cerrada` |
| `ruta` | lista de clientes previstos |
| `caja_declarada` | mapa medio de pago → decimal |

### Los dos controles del cierre

**Control de mercadería, por producto:**

```
carga − ventas − devoluciones − descarga = 0
```

Distinto de cero es **faltante** (o sobrante). No bloquea el cierre: exige un asiento de
`merma` o `ajuste` con motivo. **Se puede cerrar con faltante; no se puede cerrar
callándolo.**

**Control de caja, por medio de pago:**

```
declarado − Σ ventas del medio = 0
```

Distinto de cero es diferencia de caja, y se anota igual.

**La regla que dejó:** el cierre no es un botón, es una resta que alguien firma.

---

## Invariantes

1. Ningún asiento se edita ni se borra. Se corrige con un contra-asiento que lo referencia.
2. `cantidad` siempre positiva; la dirección la da `origen → destino`.
3. Un asiento de `ajuste` o `merma` sin `motivo` es inválido.
4. El stock de `camioneta:X` nunca es negativo — no se puede vender lo que no se cargó.
5. Una venta sin `medio_pago` es inválida. No hay venta impaga.
6. El precio del renglón es inmutable después de confirmada la venta.
7. Un cliente con `punto` nulo no bloquea nada: se navega por `domicilio` hasta la primera
   entrega.

---

## Perfil y permisos

No hay tabla de usuarios todavía; hay un perfil por dispositivo.

| Perfil | Ve | No ve |
|---|---|---|
| `repartidor` | Su ruta, su camioneta, la cartera, los precios de venta | Costo de reposición, margen, remarcación, la carga de otros |
| `deposito` | Todo: catálogo, costos, márgenes, carga, cierre por repartidor | — |

**El dato que se protege es el margen**, no la operación. Un costo de reposición contado en
el mostrador de un cliente vuelve como negociación de precio.

**Lo que hoy no es cierto:** mientras el estado viva en el dispositivo, el perfil filtra la
interfaz y nada más. Cualquiera con el celular abre las herramientas del navegador y ve el
objeto completo. **La separación real es una propiedad del servidor de F1** — que responde
según quién pregunta— y hasta entonces se documenta como lo que es.

---

## Rutas

Sin dependencias externas ni costo por request, todo en el dispositivo.

| Constante | Valor | Qué es |
|---|---|---|
| `FACTOR_CALLE` | 1,32 | La calle nunca es la recta. Corrige la distancia en línea recta a distancia de grilla urbana |
| `VELOCIDAD` | 22 km/h | Velocidad de reparto, ya con semáforos |
| `MIN_PARADA` | 12 min | Lo que lleva una entrega |
| `SALIDA` | 08:00 | Hora de salida del depósito |
| `ESPERA_OK` | 15 min | Esperar menos que esto no es un problema |
| `PENAL_HORA` | 10 km | Lo que vale una hora parado, en kilómetros equivalentes |
| `PENAL_PERDIDA` | 25 km | Lo que vale una venta perdida |

**Algoritmo:** vecino más cercano desde el depósito, después 2-opt hasta que no mejore.
Con veinte paradas corre en milisegundos.

**La función de costo es lo que importa:**

```
costo(ruta) = kilómetros
            + Σ (horas de espera × PENAL_HORA)
            + Σ (paradas ya cerradas × PENAL_PERDIDA)
```

Un ruteador comercial optimiza el primer término. **Los otros dos son los que deciden si hay
venta**, y los datos que necesitan —`recibe` por cliente— no están en ningún mapa: están en
la cabeza del repartidor hasta que alguien los escribe.

**Lo que no modela:** calles de una mano, sentido de circulación, barreras del tren, tráfico
del momento, ni el tiempo de descarga distinto según el cliente. Para veinte paradas en tres
barrios alcanza; para otra cosa, no.

---

## Zonas a evitar

Estructura nueva, poblada por el usuario — la app no trae ninguna precargada.

| Campo | Tipo | Nota |
|---|---|---|
| `id` | texto | `Z1`, `Z2`... |
| `nombre` | texto | Referencia libre: calle, esquina, apodo del lugar |
| `lat`, `lng` | decimal | El centro, tipeado o tomado con un click en el mapa |
| `radio` | metros | Mínimo 30 |
| `motivo` | texto | Opcional |
| `hastaHora` | número \| `null` | Si está, la zona sólo penaliza tramos cuya hora de llegada
  sea igual o posterior. `null` es «siempre» |

**Geometría:** la distancia de un punto a un *tramo* (no a una parada) se calcula proyectando
ambos extremos a un plano local en kilómetros centrado en el origen del tramo, y después la
distancia punto-segmento estándar en ese plano. A la escala de una ciudad el error contra la
esfera real es despreciable — no vale la pena la complejidad de geometría esférica exacta
para esto.

```
costo_zonas(ruta) = Σ (tramos cuyo segmento pasa a ≤ radio de alguna zona activa) × PENAL_ZONA
```

`PENAL_ZONA = 40`, a propósito más alto que `PENAL_PERDIDA` (25): pesa más no cruzar la zona
que no perder una venta. Se sortea en `costo()`, así que el 2-opt del optimizador reordena
para reducir cruces cuando existe una alternativa — no siempre existe, porque los puntos son
fijos y a veces todos los órdenes cruzan igual.

**Lo que no hace:** no conoce calles reales, así que un tramo marcado puede en los hechos
esquivar la zona por otra cuadra, y uno no marcado puede cruzarla. Es una señal para decidir
con criterio, no una ruta verificada como segura.

---

## Sincronización

**Apilar, no fusionar.** El `id` de cada asiento lleva el dispositivo que lo generó, así
que dos celulares nunca colisionan. El servidor guarda el log; cada dispositivo pide los
asientos posteriores al último que tiene.

No hay resolución de conflictos porque no hay edición concurrente: cada repartidor toca
su propia camioneta y el depósito toca la suya. **El único registro compartido es el
catálogo de productos y precios, y se escribe desde un solo lugar.**

---

## Lo que no está resuelto

- **Numeración de remito con varios dispositivos offline.** Hoy el número es
  `{dispositivo}-{contador}`, que es único pero no correlativo. Si hace falta correlativo
  de verdad, se numera al sincronizar y el papel del momento lleva el id de dispositivo.
- **Lotes y vencimiento** (F2): el asiento necesita un campo `lote` y el cálculo de stock
  se parte por lote. El modelo lo soporta, no está escrito.
- **Envases retornables** (F2): son un saldo por cliente que va y vuelve, no un stock.
  Probablemente un asiento con ubicación `cliente:{id}` en lugar de `cliente`.
