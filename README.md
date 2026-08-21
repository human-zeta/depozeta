# depo zeta

**El libro de la mercadería.** Sistema de reparto que trata cada bulto que sale del
depósito con el mismo rigor con el que [Caja Zeta](../cajazeta/) trata cada peso que entra
a la caja.

Repo: https://github.com/human-zeta/depozeta (privado). Destino planeado:
`depozeta.hg-vl.com`, mismo patrón de distribución que zzz en `hg-vl.com`.

**Nuevo (2026-08-21): compras y proveedores.** La pestaña **Compras** (DEPOSITO/ADMIN)
lleva las fichas de proveedores con WhatsApp directo, el historial de precios de compra
—append-only, como el libro— y **el cuadro de precios**: quién lo tiene más barato este
mes, con sello **ÉPICO** cuando la diferencia es para no dejarla pasar (ventana de 35
días: con inflación, un precio de hace dos meses es un recuerdo). De esos datos salen
las **promos que se arman solas** (en Precios, con la cuenta y el margen a la vista),
el **remito de la entrega** (WhatsApp prellenado / PDF, interno, no válido como
factura) y la **ruta entera del día en Google Maps** por deep link multiparada.
El repartidor no ve nada de esto del lado de compras: la pared es del servidor
(`VER_COSTOS` / `GESTIONAR_COMPRAS`), no de la interfaz.

> **Carga − ventas − devoluciones = 0.**
> Si no da cero, hay faltante. Y el faltante se ve el mismo día, no a fin de mes.

## Estructura del repositorio

```
index.html              Redirect a app/ — GitHub Pages necesita algo en la raíz,
                         si no cae a mostrar este README (vía Jekyll)
.nojekyll                Le dice a Pages que sirva los archivos tal cual, sin
                         procesar nada como Jekyll
app/                    El aplicativo, sin build ni dependencias
├── index.html          El aplicativo — abre con doble clic. Login, roles y
│                       todo el libro (catálogo, cartera, ventas, encargues,
│                       zonas) son reales, contra server/api/
├── assets/flujo.js     La seda de la jornada: fondo WebGL que late con la
│                       ruta y se tiñe con el faltante del cierre
└── core/               Motores puros, probados en Node (130/130): TOTP,
                        roles y su jerarquía, clave+sesión, auditoría,
                        usuarios, el libro de asientos, ventas, encargues
server/                 Backend
├── api/                  Auth + libro operativo real: Cloudflare Worker + D1
│                         — DZ-SEG-01 y DZ-MOD-01
├── whatsapp-webhook.mjs  Cloud API oficial (elegida) — Cloudflare Worker
└── baileys/               Alternativa no oficial, con advertencia — DZ-BAI-01
docs/
├── interno/            Concepto y decisiones — no se envían al cliente
├── tecnico/            Modelo de datos y especificaciones
└── identidad/          Paleta y sistema visual
```

## Contenido

| Documento | Qué es | Audiencia |
|---|---|---|
| [`docs/interno/01-concepto-dz-app-01.md`](docs/interno/01-concepto-dz-app-01.md) | Concepto (DZ-APP-01): qué es, alcance decidido, las seis ideas propias, arquitectura, fases | Interno — **no enviar** |
| [`docs/interno/02-prompt-app-ideal-dz-pro-01.md`](docs/interno/02-prompt-app-ideal-dz-pro-01.md) | Prompt (DZ-PRO-01): para arrancar la versión real con un agente de desarrollo, evolucionando F0 | Interno — **no enviar** |
| [`docs/tecnico/01-modelo-datos-dz-mod-01.md`](docs/tecnico/01-modelo-datos-dz-mod-01.md) | Modelo de datos (DZ-MOD-01): entidades, tipos de asiento, los dos controles del cierre, siete invariantes | Desarrollo |
| [`docs/tecnico/02-whatsapp-cloud-api-dz-wsp-01.md`](docs/tecnico/02-whatsapp-cloud-api-dz-wsp-01.md) | WhatsApp Cloud API (DZ-WSP-01): checklist de Meta, número nuevo vs. coexistencia, precios con fecha, arquitectura del webhook | Desarrollo |
| [`server/whatsapp-webhook.mjs`](server/whatsapp-webhook.mjs) | Scaffold del Worker de Cloudflare para el webhook — sin probar contra Meta real todavía | Desarrollo |
| [`docs/tecnico/03-baileys-alternativa-dz-bai-01.md`](docs/tecnico/03-baileys-alternativa-dz-bai-01.md) | Baileys (DZ-BAI-01): la alternativa no oficial — advertencia de baneo primero, para qué serviría, el scaffold | Desarrollo |
| [`docs/tecnico/04-seguridad-dz-seg-01.md`](docs/tecnico/04-seguridad-dz-seg-01.md) | Seguridad (DZ-SEG-01): clave + TOTP, los tres roles y su jerarquía, login en dos pasos, sesiones, los bugs reales al probarlo | Desarrollo |
| [`server/api/README.md`](server/api/README.md) | Backend real: cómo correrlo en local (`wrangler dev`), el primer ADMIN, la tabla de rutas, qué falta para desplegarlo de verdad | Desarrollo |
| [`app/index.html`](app/index.html) | El aplicativo: login real, seis vistas sobre el libro de asientos real, tres roles, optimizador de ruta local | Todos |

Prototipo navegable publicado: https://claude.ai/code/artifact/68184935-c60f-4a8d-ae02-33256d0683df
**El canonical es este repo; el artifact es la demo.**

## Alcance decidido

Cuatro definiciones del 18 de agosto de 2026. Cada una borró trabajo.

| Decisión | Qué borró |
|---|---|
| Rubro mixto — vencimiento y envase son atributos opcionales | Nada, es el modelo general |
| Vos + 1 a 3 repartidores, con depósito | El local-first puro de zzz: necesita sincronización |
| **Todo contado en el momento** | Cuenta corriente completa: saldos, antigüedad, límite de crédito, cobranza |
| **Remito interno, nada fiscal** | La integración ARCA/WSFE: certificados, homologación, CAE |

**La regla que dejó:** el sistema no factura y no fía. Entrega, cobra en el momento y rinde.

## Cómo abrir el prototipo

Doble clic en `app/index.html` — pero desde la noche del 19 de agosto la primera pantalla
pide la URL de una API y un login real (clave + TOTP), porque el acceso ya no es un botón
para cambiar de perfil: es una sesión de servidor. Esa API ya está en vivo:
`https://depo-zeta-api.tukyquilme.workers.dev` (Cloudflare real, no local) — hace falta
crear el primer ADMIN una sola vez con `/api/bootstrap` antes de poder entrar, ver
[server/api/README.md](server/api/README.md#el-primer-admin). Para seguir probando en
la máquina en vez de contra la nube, `server/api/` también corre local con `wrangler dev`
— mismas instrucciones. Ver `DZ-SEG-01` para el diseño completo.

Una vez adentro, el catálogo y la cartera arrancan vacíos — hay que cargarlos desde
**Precios → Agregar producto** y **Clientes → Agregar cliente** antes de que el resto tenga
algo para mostrar. Con eso hecho:

- El encabezado muestra la sesión real (usuario y rol) con un botón **Salir**. Quién ve
  costos, márgenes y el control por repartidor ya no lo decide un botón de la interfaz: lo
  decide el rol de la cuenta (ADMIN, DEPOSITO o REPARTIDOR), verificado por el servidor.
  DEPOSITO y ADMIN pueden dar de alta cuentas nuevas desde la pestaña **Usuarios** —
  DEPOSITO sólo REPARTIDOR, ADMIN cualquier rol menor al suyo.
- El bloque **Recorrido** compara el orden de siempre contra el más corto, avisa a qué
  paradas llegás fuera de horario, y abre cada cliente en Google Maps o en Waze.
- **Clientes → Zonas a evitar**: cargá un punto (tipeado o tocando el mapa) y un radio. El
  optimizador penaliza fuerte cualquier tramo que pase cerca y esa parada se abre en Waze
  primero, por sus alertas en vivo. Es información que ponés vos — la app no la adivina.
- **Precios → Agregar producto** y **Clientes → Agregar cliente**: altas con formulario,
  con lector de código de barras nativo (sin cámara real, cae a carga manual — anda en
  Chrome/Android, no en Safari/iPhone).
- **Encargue**: la venta que se toma sin camioneta, de a pie. No genera un asiento hasta
  que se entrega — hasta entonces es una intención, no una venta. Admite renglones del
  catálogo o especiales (algo que hay que conseguir, que el depósito vincula a un
  producto real antes de poder entregarlo).
- **El desplegable de WhatsApp**, a la derecha de la pantalla: links directos por cliente y
  el total vendido del día, sin tapar el resto de la app. Sigue siendo la V1 —el inbox en
  vivo vía Cloud API oficial (decidido el 19 de agosto) todavía no está conectado, necesita
  el backend de `server/` desplegado con credenciales reales de Meta. Ver `DZ-WSP-01`, y
  `DZ-BAI-01` si se evalúa la alternativa no oficial mientras tanto — con su advertencia.

Para exportar a PDF: Cmd+P. Tiene hoja de impresión que invierte a fondo claro.

## La seda de la jornada

`app/assets/flujo.js` — el mismo fondo WebGL que Caja Zeta, con la paleta de acá y **otros
signos vitales**. No es decoración: la corriente late con la ruta hecha, **el faltante del
cierre tiñe la seda de coral**, las no-ventas tensan los pliegues, y si no hay servidor la
escena se enfría. La resta que ordena todo el producto se ve antes de abrir ninguna
pantalla.

Cero dependencias, WebGL2 puro. Sin WebGL2 la capa no se activa y la app queda igual —
**jamás puede romperla**. Respeta `prefers-reduced-motion` (un cuadro quieto), corre a 30
fps, pausa con la pestaña oculta y duerme a los 2 minutos sin actividad: esto vive una
jornada entera en el teléfono de un repartidor.

Dos toggles abajo a la derecha, que recuerdan la elección: **flujo** (apagarla) y
**vidrio** (una lámina esmerilada entre la seda y el contenido). A diferencia de Caja Zeta,
acá **el vidrio viene puesto**: se trabaja en la calle, con sol, y una tabla de números
sobre la seda a pleno se lee mal. En el login se saca solo — ahí dura cinco segundos y es
la cara del producto. Para evaluar climas a ojo desde la consola:
`FLUJO.estado({flujo:1.2, frac:.14, turb:.8, sync:1})`, y `FLUJO.estado(null)` vuelve a los
datos reales.

## Convenciones

- Los documentos de `docs/interno/` no salen del equipo.
- Un documento con identificador formal (`DZ-APP-01`) lo lleva en el nombre del archivo.
- Los archivos de `docs/tecnico/` van numerados por orden de lectura.
- Paleta: fondo `#08120E` · verde ruta `#2FBF71` · coral carga `#FF7A59`. El ámbar
  `#FFC46B` queda reservado, como en toda la casa, para marcadores a completar.

## Falta en el repositorio

- `docs/tecnico/05-requerimientos-dz-ers-01.md` — la especificación SMART al estilo
  CZ-ERS-01. Se escribe después de probar el prototipo en una jornada real.
- `docs/identidad/sistema-visual-depo-zeta.md` — la paleta y los componentes están hoy
  solo declarados dentro del prototipo.
- **Trabajar sin conexión.** Toda operación del libro es una llamada HTTP en el momento —
  no hay cola local ni sincronización al recuperar señal. Ver «Sincronización» en
  `DZ-MOD-01` para qué significa esto en la práctica y qué cambiaría si hiciera falta.
- **Reporte consolidado de varios repartidores a la vez** — hoy cada vista de cierre o
  carga muestra a quien tiene la sesión abierta, no un tablero de todos juntos.
- **Un dominio propio para la API.** `server/api/` ya está desplegado y en vivo en
  `https://depo-zeta-api.tukyquilme.workers.dev` (19 de agosto) — falta el paso cosmético
  de un dominio propio tipo `depozeta-api.hg-vl.com`, si se quiere.
- El webhook de WhatsApp sigue sin desplegar ni probar contra Meta real, ver DZ-WSP-01. La
  verificación de Meta Business y el alta del número le tocan al dueño del proyecto, no se
  pueden completar por él.

## Roles, acceso y libro operativo — reales desde el 19 de agosto

Login con clave + TOTP obligatorio, tres roles (ADMIN, DEPOSITO, REPARTIDOR), verificado
por un servidor propio (Cloudflare Worker + D1), no por la interfaz. DEPOSITO puede crear
cuentas REPARTIDOR; nadie crea un par ni un superior. El libro completo —catálogo, cartera,
asientos, ventas, encargues, zonas— vive en el mismo servidor, con el costo y el margen
ocultos a REPARTIDOR en la respuesta misma de la API, no sólo en la pantalla. 130/130 tests
en Node, más pruebas en vivo contra el servidor real. Diseño completo:
[`DZ-SEG-01`](docs/tecnico/04-seguridad-dz-seg-01.md) (auth y roles) y
[`DZ-MOD-01`](docs/tecnico/01-modelo-datos-dz-mod-01.md) (el libro).

## Pendientes

1. **La grafía del nombre.** zzz va en minúscula por argumento de marca, Caja Zeta en
   Title Case. **depo zeta** está en minúscula por descarte, sin argumento propio.
2. **Producto propio o herramienta interna.** Parcialmente decidido: existe rol ADMIN
   pensando en que otras empresas lo usen algún día, pero hoy sigue siendo de una sola
   operación — falta confirmar si se llega a construir multi-empresa de verdad (soporte,
   precio, aislamiento de datos entre cuentas).
3. **Quién carga la cartera inicial.** Importar de una planilla es una tarde; tipearla de
   cero es una semana.
4. **Probarlo en una jornada real** antes de escribir una línea más del libro operativo.
   El próximo editor de este repo es un reparto, no un documento.
