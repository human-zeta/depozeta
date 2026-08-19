# depo zeta — prompt de construcción · DZ-PRO-01

Documento interno. **No enviar al cliente.**

Prompt para arrancar la versión real de depo zeta con un agente de desarrollo —pensado
para uno con filesystem y capacidad de correr Node, tipo Claude Code—, evolucionando el
prototipo F0 ya probado en `~/Desktop/depozeta/app/index.html`, no reescribiendo desde
cero. Copiá todo el bloque de abajo como primer mensaje de una sesión nueva.

---

## El prompt

> Vas a construir la versión real de **depo zeta**, un sistema de reparto de mercadería.
> Todo lo que sigue son decisiones ya tomadas con el dueño del proyecto — no las vuelvas a
> discutir ni las cuestiones salvo que encuentres una razón técnica concreta. Si la
> encontrás, decila antes de cambiar algo; no cambies nada en silencio.
>
> Si tenés acceso al filesystem, el repo ya existe en `~/Desktop/depozeta/` con un
> prototipo F0 funcionando (`app/index.html`, sin build ni dependencias), auth real
> detrás (`server/api/`, Cloudflare Worker + D1 — ver más abajo) y tres documentos
> técnicos (`docs/interno/01-concepto-dz-app-01.md`,
> `docs/tecnico/01-modelo-datos-dz-mod-01.md` y `docs/tecnico/04-seguridad-dz-seg-01.md`).
> Leelos enteros antes de escribir una línea: tienen decisiones, invariantes y constantes
> ya afinadas que este prompt resume pero no reemplaza.
>
> ### Qué es
>
> depo zeta es **el libro de la mercadería**: un sistema de reparto que trata cada bulto
> que sale del depósito con el mismo rigor con el que un libro contable trata cada peso.
> El principio que ordena todo el diseño:
>
> **carga − ventas − devoluciones = 0.**
>
> Si no da cero hay faltante, y tiene que verse el mismo día, no a fin de mes. Todo lo
> demás —clientes, precios, rutas— existe para alimentar esa resta.
>
> ### Alcance — no lo amplíes sin preguntar
>
> Cuatro decisiones ya tomadas, cada una descartó trabajo real:
>
> - **Rubro mixto.** Vencimiento y envase retornable son atributos *opcionales* por
>   producto, no supuestos del modelo.
> - **Uno a tres repartidores más depósito**, cada uno en su dispositivo. Esto es lo que
>   obliga a tener sincronización — no alcanza un local-first puro sin servidor.
> - **Todo se cobra en el momento.** No hay cuenta corriente. Nada de saldos, antigüedad
>   de deuda, límite de crédito ni gestión de cobranza. Si en algún momento se pide
>   agregarlo, es un cambio de alcance mayor y hay que decirlo explícitamente, no meterlo
>   en un sprint como si fuera un detalle.
> - **Remito interno, nada fiscal.** No hay integración con ARCA/WSFE. El sistema no
>   factura y no fía — entrega, cobra, rinde.
>
> ### El modelo de datos — no negociable
>
> El stock **no se guarda, se calcula.** No existe un campo `cantidad` que se edita. Hay
> un libro de asientos que no se borra nunca; el stock de cualquier producto en cualquier
> ubicación en cualquier momento es la suma de los asientos que la tocaron. Corregir un
> error es un contra-asiento con motivo y autor, nunca un UPDATE.
>
> Cuatro ubicaciones: `deposito`, `camioneta:{repartidor}` (una por repartidor),
> `cliente`, `merma`. Siete tipos de asiento: `compra`, `carga`, `venta`,
> `devolucion_cliente`, `descarga`, `merma`, `ajuste` — los dos últimos exigen motivo, si
> no son inválidos.
>
> Siete invariantes que el sistema tiene que hacer cumplir, no sugerir:
>
> 1. Ningún asiento se edita ni se borra — se corrige con un contra-asiento que lo
>    referencia.
> 2. `cantidad` siempre positiva; la dirección la da `origen → destino`.
> 3. `ajuste` o `merma` sin `motivo` es inválido.
> 4. El stock de `camioneta:X` nunca es negativo — no se puede vender lo que no se cargó.
> 5. Una venta sin `medio_pago` es inválida. No hay venta impaga.
> 6. El precio del renglón es inmutable después de confirmada la venta — remarcar no
>    cambia ventas ya cerradas.
> 7. Un cliente con `punto` nulo no bloquea nada: se navega por `domicilio` hasta la
>    primera entrega, que es la que completa el pin.
>
> El cierre de jornada tiene **dos controles**, no uno: mercadería
> (`carga − ventas − devoluciones − descarga = 0` por producto) y caja
> (`declarado − Σventas = 0` por medio de pago). Se puede cerrar con faltante; no se puede
> cerrar callándolo — exige un asiento de `merma` o `ajuste` con motivo antes de dejar
> cerrar.
>
> ### Los diferenciales — no los recortes por "no alcanza el tiempo"
>
> Son el producto, no accesorios:
>
> 1. **El pin GPS se aprende en la entrega**, no se geocodifica. La primera visita navega
>    por dirección; desde la segunda, el punto capturado en el momento de entregar es
>    definitivo. Media cartera de reparto vive en "la casa de rejas verdes al lado del
>    kiosco" y eso no lo resuelve ningún geocodificador.
> 2. **La ruta se optimiza localmente**, sin depender de una API paga por default:
>    vecino-más-cercano + 2-opt sobre distancia en línea recta con factor de calle
>    (arrancar con 1.32, ajustar con datos reales). La función de costo no es sólo
>    kilómetros — pondera **ventanas horarias por cliente** (`recibe`, lista de rangos):
>    esperar a que abra pesa poco, llegar después de que cerró pesa mucho más (arrancar en
>    10 km-equivalentes por hora de espera, 25 por venta perdida, ajustar con datos
>    reales). Ofrecé comparar contra Google Directions/Routes cuando el usuario tenga su
>    propia key con facturación habilitada — nunca como dependencia obligatoria.
> 3. **Zonas a evitar, cargadas por el usuario, nunca precargadas por vos.** Punto + radio
>    + motivo + hora límite opcional. Penalizan fuerte el costo de ruta (más que perder
>    una venta — arrancar en 40 km-equivalentes) y fuerzan que esa parada abra en Waze en
>    vez de Maps, porque la única "inteligencia de tráfico/seguridad" real que existe es
>    la del conductor usando la app de Waze de verdad en el momento — no existe API de
>    Waze para ruteo ni para evitar zonas, en ninguna plataforma. Si alguien te pide "que
>    Waze decida la ruta", decí explícitamente que no se puede y por qué.
> 4. **El "no compró" es un registro con motivo**, no la ausencia de una venta:
>    `cerrado / no_estaba / tiene_stock / precio / otro`. Sirve para ver un competidor
>    entrando antes de perder al cliente.
> 5. **El margen se calcula contra costo de reposición**, no costo histórico. Con
>    inflación argentina, el costo de hace cuarenta días es ficción contable.
> 6. **Carga sugerida** desde el histórico de compra de cada cliente en la ruta del día.
>    Ataca los dos errores caros del reparto: volver cargado (plata inmovilizada) y
>    quedarse corto en la tercera parada (venta perdida con el cliente adelante).
> 7. **El faltante tiene dueño** — la rendición es por repartidor y por día. No es una
>    acusación, es un número, y la mayoría de las veces resulta ser un error de carga.
>
> ### Perfiles — y el límite de seguridad que hay que resolver de verdad
>
> Dos perfiles con datos distintos, no sólo pantallas distintas: **repartidor** (su ruta,
> su camioneta, la cartera completa, precios de venta — nunca costo ni margen) y
> **depósito** (todo, incluido costo de reposición, márgenes, carga, y el cierre
> consolidado por repartidor).
>
> Lo que se protege es el margen: un costo de reposición dicho en el mostrador de un
> cliente vuelve como negociación de precio. En F0 esto era sólo ocultamiento de
> interfaz — cualquiera con el dispositivo podía abrir las herramientas del navegador y
> ver todo. **En la versión real esto tiene que ser un límite de servidor de verdad**:
> cada perfil se autentica y el backend no le manda al repartidor los campos que no le
> corresponden. No lo trates como un detalle — es la diferencia entre una app terminada y
> una que sólo parece terminada.
>
> ### Arquitectura objetivo
>
> Seguí el patrón de la casa, ya usado en los otros productos del mismo autor: **web sin
> build ni dependencias en el cliente, PWA instalable, offline-first de verdad** —el
> reparto pasa en la calle, en sótanos, en zonas sin señal, y la app tiene que operar la
> jornada entera sin conexión. Motores de negocio puros (el libro de asientos, el cálculo
> de stock, el optimizador, el cierre) separados de la interfaz, con la misma suite de
> tests corriendo en Node y en el navegador.
>
> Lo que F0 no tenía y la versión real sí necesita: **sincronización real entre
> dispositivos.** El modelo ya está pensado para esto — cada asiento lleva
> `{dispositivo}-{contador}` como id, así que dos celulares nunca colisionan y el servidor
> sólo tiene que apilar, no fusionar ni resolver conflictos, porque no hay edición
> concurrente del mismo registro (cada repartidor toca su propia camioneta). Para el
> volumen de uno a tres repartidores, **Cloudflare Workers + D1** cubre esto gratis, sin
> servidor que mantener; un VPS chico (~USD 5/mes) es la alternativa si se prefiere todo
> en casa. El catálogo de productos y precios es el único dato compartido de escritura
> única — resolvé ese caso aparte, no como parte del apilado de asientos. El webhook de
> WhatsApp (ver más abajo) necesita la misma URL pública — es una razón más para que el
> sync y el webhook terminen en el mismo Worker.
>
> ### Integraciones opcionales — con sus límites dichos de frente
>
> - **Google Maps** (Maps JavaScript + Directions o Routes): opcional, con la clave propia
>   del usuario, guardada del lado del cliente (nunca en el código ni en el repo). Sin
>   facturación habilitada en el proyecto de Google, el mapa sale marcado con "For
>   development purposes only" y las APIs de ruteo devuelven error — avisá esto
>   explícitamente en vez de fallar en silencio.
> - **Waze**: sólo deep link (`https://waze.com/ul?ll=lat,lng&navigate=yes`). No hay API
>   de Waze para ruteo, tráfico ni zonas de riesgo, en ningún plan ni partnership
>   disponible para un desarrollo privado. No lo prometas.
> - **WhatsApp Business Cloud API** — decidido, no opcional. El dueño del proyecto eligió
>   el camino oficial de Meta por sobre una librería no oficial (que arriesga que baneen
>   el número real). Esto necesita un webhook con URL pública — no corre en el cliente, es
>   la primera pieza real del backend de F1, y el sync de camionetas puede compartir el
>   mismo Worker. Hay un scaffold sin probar en `server/whatsapp-webhook.mjs` y el
>   checklist completo (verificación de Meta Business, número nuevo vs. coexistencia, el
>   modelo de precios vigente con sus fechas de cambio) en `DZ-WSP-01`. La verificación de
>   Meta Business y el alta del número son trámites del dueño del proyecto — no se pueden
>   completar por él.
> - **Baileys (no oficial) existe como alternativa documentada, no como plan B silencioso.**
>   Hay scaffold en `server/baileys/`, contra la línea estable 6.7.x, con su advertencia de
>   baneo en `DZ-BAI-01`. No lo despliegues contra el número real de la operación bajo
>   ninguna circunstancia — sólo con un número descartable, y sólo si el dueño del proyecto
>   lo pide explícitamente sabiendo el riesgo.
>
> ### Lo que NO hay que construir
>
> - Facturación fiscal (ARCA/WSFE) — es un proyecto aparte si alguna vez se pide.
> - Cuenta corriente, saldos, cobranza — explícitamente fuera de alcance.
> - Cualquier forma de "evitar zona peligrosa" como parámetro de una API externa — no
>   existe; la única vía real es la lista cargada por el usuario descrita arriba.
> - Optimización de ruta con calles reales por default — es opcional y paga; el motor
>   local sin key es el camino principal.
>
> ### Antes de escribir la primera línea de la versión real
>
> Este prototipo F0 nunca salió a la calle. **Auth y el libro operativo completo ya se
> construyeron** — clave + TOTP, tres roles (ADMIN/DEPOSITO/REPARTIDOR), gestión de
> usuarios (`DZ-SEG-01`), y catálogo/cartera/asientos/ventas/encargues/zonas sincronizados
> contra el mismo servidor (`DZ-MOD-01`) — porque el dueño del proyecto lo pidió
> explícitamente en dos noches seguidas (19 de agosto), no por iniciativa propia de un
> agente; esa parte de la advertencia original ya está saldada. Lo que sigue en pie es el
> resto de esta lista — sincronización offline, remito compartible, informes, PWA,
> integraciones opcionales: **antes de invertir en cualquiera de esas, hacé confirmar al
> dueño del proyecto que ya probó el prototipo en una jornada real de reparto.** Si
> todavía no lo hizo, decíselo de vuelta en vez de seguir construyendo sobre supuestos
> sin validar — el modelo de datos, las constantes del optimizador y hasta el flujo de
> la venta pueden cambiar en contacto con una camioneta real.
>
> ### Lo que todavía no está decidido — preguntale, no lo asumas
>
> 1. **La grafía del nombre.** ¿"depo zeta" en minúscula queda así con un argumento de
>    marca propio, o se revisa? (Comparar con el otro producto de la casa, que sí tiene
>    uno explícito.)
> 2. **Producto vendible a otras distribuidoras, o herramienta interna de una sola
>    operación.** Parcialmente decidido: existe rol ADMIN pensando en que otras empresas
>    lo usen algún día, pero **hoy es de una sola operación** — no asumas multi-tenant
>    real (aislamiento de datos entre `empresaId`, soporte, modelo de precio) sin
>    confirmarlo primero, el pedido original fue explícito en que es una previsión, no
>    un encargo de construirlo ya.
> 3. **De dónde sale la cartera inicial de clientes** — importar de una planilla existente
>    es una tarde de trabajo; tipearla de cero es una semana.

---

## Cómo usarlo

Pegalo entero, tal cual, como primer mensaje. Está escrito para un agente con filesystem
y Node — si el destino es una herramienta sin acceso al repo (un builder online, por
ejemplo), sigue siendo autocontenido: no depende de que lea los archivos locales, sólo se
beneficia si puede.

Las constantes del optimizador (`1.32`, `10`, `25`, `40` km-equivalentes) son las de F0,
**nunca validadas contra una jornada real** — quedan ahí como punto de partida, no como
verdad medida.

Actualizá este documento si alguna de las decisiones de arriba cambia. Que quede
desactualizado es peor que no tenerlo.
