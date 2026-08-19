# depo zeta

**El libro de la mercadería.** Sistema de reparto que trata cada bulto que sale del
depósito con el mismo rigor con el que [Caja Zeta](../cajazeta/) trata cada peso que entra
a la caja.

> **Carga − ventas − devoluciones = 0.**
> Si no da cero, hay faltante. Y el faltante se ve el mismo día, no a fin de mes.

## Estructura del repositorio

```
app/                    El aplicativo, sin build ni dependencias
├── index.html          Prototipo F0 navegable — abre con doble clic
└── core/               Motores puros (F1): stock, cierre, sugerido
server/                 Backend F1, en construcción
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
| [`app/index.html`](app/index.html) | Prototipo F0: seis vistas sobre el libro de asientos real, dos perfiles, optimizador de ruta local y 36 clientes de ejemplo | Todos |

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

Doble clic en `app/index.html`. No necesita servidor ni instalación.

- **«Simular la jornada entera»** carga la camioneta, hace las ventas del día, deja una
  no-venta por precio y un faltante de dos unidades — que es lo que pasa de verdad.
- El chip **«Marcos · repartidor»** del encabezado cambia de perfil. El depósito ve costos,
  márgenes y el control por repartidor; el repartidor no.
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

## Convenciones

- Los documentos de `docs/interno/` no salen del equipo.
- Un documento con identificador formal (`DZ-APP-01`) lo lleva en el nombre del archivo.
- Los archivos de `docs/tecnico/` van numerados por orden de lectura.
- Paleta: fondo `#08120E` · verde ruta `#2FBF71` · coral carga `#FF7A59`. El ámbar
  `#FFC46B` queda reservado, como en toda la casa, para marcadores a completar.

## Falta en el repositorio

- `docs/tecnico/04-requerimientos-dz-ers-01.md` — la especificación SMART al estilo
  CZ-ERS-01. Se escribe después de probar el prototipo en una jornada real.
- `docs/identidad/sistema-visual-depo-zeta.md` — la paleta y los componentes están hoy
  solo declarados dentro del prototipo.
- `app/core/` — los motores extraídos del prototipo (stock, cierre, rutas), con su suite
  corriendo en Node y en el navegador.
- Los permisos de verdad: hoy el perfil filtra la interfaz, no los datos. Se resuelve en F1
  con el servidor.
- El servidor de sincronización, con su prueba de que un asiento no se pierde. El webhook
  de WhatsApp en `server/` es el primer paso —sin probar contra Meta real, ver DZ-WSP-01.
- La verificación de Meta Business, el alta del número y el despliegue real del Worker de
  WhatsApp — los tres le tocan al dueño del proyecto, no se pueden completar por él.

## Pendientes

1. **La grafía del nombre.** zzz va en minúscula por argumento de marca, Caja Zeta en
   Title Case. **depo zeta** está en minúscula por descarte, sin argumento propio.
2. **Producto propio o herramienta interna.** Si se vende a otras distribuidoras cambia
   todo: multi-empresa, soporte, precio.
3. **Quién carga la cartera inicial.** Importar de una planilla es una tarde; tipearla de
   cero es una semana.
4. **Probarlo en una jornada real** antes de escribir una línea más. El próximo editor de
   este repo es un reparto, no un documento.
