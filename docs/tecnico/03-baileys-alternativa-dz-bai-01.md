# depo zeta — Baileys, la alternativa no oficial · DZ-BAI-01

Documento técnico. Complementa [`DZ-WSP-01`](02-whatsapp-cloud-api-dz-wsp-01.md) — el
camino elegido para depo zeta sigue siendo la **Cloud API oficial**. Esto se agrega como
alternativa documentada y con scaffold, no como reemplazo de esa decisión.

---

## La advertencia, primero, no al final

- Baileys y librerías parecidas (whatsapp-web.js, Evolution API, WAHA) reimplementan el
  protocolo de WhatsApp Web para automatizar una cuenta común desde afuera de la app de
  Meta. **Esto viola los Términos de Servicio de WhatsApp.** No es una zona gris.
- Meta puede banear el número **sin aviso previo y de forma permanente.** No hay apelación
  garantizada ni soporte de Meta al que reclamarle — a diferencia de la Cloud API, acá no
  hay una cuenta oficial detrás que responda.
- Lo que dispara la detección, según lo reportado en 2026: un ratio de respuesta bajo
  (menos del 10% de lo que mandás recibe contestación, señal de riesgo alto), escribirle a
  números que no te tienen agendado, patrones de horario robóticos —siempre la misma hora
  exacta, en ráfaga—, y desde este año además se cuentan los mensajes propios que nunca
  obtuvieron respuesta.
- Tiempo de vida reportado antes de la detección: **entre dos y ocho semanas**, según casos
  relevados en 2026. Un dato de India —68% de las empresas que usaron automatización no
  oficial reportó al menos un baneo en doce meses— no es un dato argentino, pero da la
  magnitud.
- **No instalar paquetes de "anti-ban" de terceros.** En abril de 2026 se confirmó que uno
  de esos paquetes, con 56.000 descargas, robaba las credenciales de sesión y los mensajes
  de quien lo instalaba. El riesgo de algo que promete evitar la detección puede ser peor
  que la detección misma.

**La regla que se aplica, sin excepción:** si se prueba esto, es con un número
descartable — nunca con el número real de la operación. Perder el número de prueba no
cuesta nada; perder el número con el que los clientes ya tienen guardado el contacto del
reparto, sí.

---

## Para qué serviría, si es que sirve para algo acá

La verificación de Meta Business de `DZ-WSP-01` tarda — es el paso que más demora de
todos. Tres razones honestas para tener esto documentado mientras tanto, sin que ninguna
obligue a usarlo:

1. Probar cómo se siente un inbox en vivo adentro del panel, sobre un número descartable,
   antes de que la Cloud API esté lista.
2. Tener un camino de respaldo si la verificación de Meta se traba.
3. Simplemente saber qué implica, para decidir con información y no por default.

La decisión de desplegar esto de verdad —aunque sea con un número de prueba— es del dueño
del proyecto, igual que la decisión de ir por la Cloud API lo fue.

---

## Por qué no vive en el mismo Worker que la Cloud API

Baileys mantiene una conexión WebSocket persistente con los servidores de WhatsApp, igual
que una pestaña de WhatsApp Web abierta en un navegador — tiene que seguir viva todo el
tiempo, no se levanta por request como una función serverless. Cloudflare Workers no
sostiene ese modelo de ejecución.

Esto necesita un **proceso de Node corriendo todo el tiempo**: el mismo VPS chico
(~USD 5/mes) que ya aparecía como alternativa a Cloudflare Workers + D1 para la
sincronización, si se termina eligiendo ese camino en vez del serverless.

---

## El scaffold

`server/baileys/` — contra `@whiskeysockets/baileys` en su línea estable 6.7.x (`npm i
@whiskeysockets/baileys`). La 7.0 sigue publicada sólo como *release candidate* y trae
cambios incompatibles con la 6.x — no se apunta a esa todavía.

| Archivo | Qué es |
|---|---|
| `index.mjs` | Conecta, muestra el QR en la terminal, persiste la sesión, escucha mensajes entrantes y expone el envío |
| `package.json` | Declara la dependencia — sólo acá, nunca en `app/`, que sigue sin dependencias |
| `.gitignore` | `auth_info/` no se commitea nunca — es tan sensible como una contraseña |

**No probado en vivo** — escrito contra el patrón documentado en baileys.wiki, sin una
sesión real vinculada al momento de escribir esto.

---

## Comparado con la Cloud API, en una fila

| | Baileys | Cloud API |
|---|---|---|
| Alta | Escanear un QR, nada más | Verificación de Meta Business, que tarda |
| Costo | Gratis | Por mensaje, ver `DZ-WSP-01` |
| Riesgo | **Baneo permanente y sin aviso** | Ninguno — es la vía oficial |
| Soporte si algo falla | Ninguno | El de Meta, imperfecto pero existe |
| Dónde corre | Proceso Node siempre activo (VPS) | Cloudflare Worker (serverless) |

---

## Lo que no está resuelto

- Qué hacer con los mensajes recibidos — hoy el scaffold sólo los imprime en consola. Si
  algún día conviven Baileys y la Cloud API, conviene que caigan en el mismo lugar que los
  mensajes de `whatsapp-webhook.mjs`, no en dos sistemas separados.
- Reintento y backoff de reconexión — el scaffold reconecta apenas se corta, sin límite ni
  espera creciente. Puede generar más tráfico de reconexión del que conviene mostrarle a
  los sistemas de detección de Meta.
