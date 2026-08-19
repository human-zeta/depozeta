# depo zeta — WhatsApp Business Cloud API · DZ-WSP-01

Documento técnico. Decisión tomada por el dueño del proyecto el 19 de agosto de 2026: el
camino oficial de Meta, no la librería no oficial por QR. Motivo — no arriesgar el número
de WhatsApp real de la operación.

---

## Lo que hace falta del lado de Meta — y quién lo hace

Ninguno de estos cinco pasos lo puede completar un tercero. Piden identidad, documentos
de la empresa y el teléfono real del dueño del proyecto — no son un detalle técnico, son
trámites que le tocan a él.

1. **Cuenta de Meta Business (Business Manager), verificada.**
2. **Una app de WhatsApp Business Platform**, creada en developers.facebook.com y
   vinculada a esa cuenta.
3. **Un número para la Cloud API** — ver la decisión de abajo, «número nuevo o el mismo».
4. **Un token de acceso permanente**, generado con un *System User* en el Business
   Manager. El token de prueba que da la consola por default expira a las 24 horas; no
   sirve para producción.
5. **Plantillas de mensaje aprobadas** para cualquier mensaje que la empresa inicie fuera
   de la ventana de 24 horas desde el último mensaje del cliente — por ejemplo, avisar
   «tu pedido salió de reparto» sin que el cliente haya escrito primero.

---

## Número nuevo, o el mismo con coexistencia

La información vieja decía que migrar un número a la Cloud API le sacaba la app común de
WhatsApp. **Ya no es así:** Meta lanzó *coexistencia* en mayo de 2025, y sigue vigente —
el mismo número puede estar en la WhatsApp Business App y en la Cloud API al mismo
tiempo.

| | Número nuevo y dedicado | El mismo número, con coexistencia |
|---|---|---|
| Qué exige | Alta y verificación de un número que hoy no se usa | Tener el número ya en la **WhatsApp Business App** (no la personal), versión 2.24.17 o posterior |
| Historial | Arranca vacío | Importa hasta 6 meses de chat |
| Riesgo si algo sale mal | Ninguno para el número de siempre | El número que ya usan los clientes queda en el medio del cambio |
| Límite propio | — | Un solo número por workspace bajo coexistencia; el throughput de la Cloud API queda fijo en 20 mensajes por segundo |

Un límite de coexistencia que hay que confirmar antes de decidir: la lista de países sin
soporte que encontré (Australia, Japón, Nigeria, Filipinas, Rusia, Corea del Sur,
Sudáfrica, Turquía, Suiza, y todo EEE/UE/Reino Unido) **no incluye Argentina** — pero es
una lista de una fuente secundaria, no la propia página de Meta, así que se confirma en
el alta, no se da por sentado acá.

**La recomendación, con esto ya aclarado:** si el número operativo ya vive en la WhatsApp
Business App, coexistencia es razonable. Si vive en la app personal de WhatsApp, conviene
un número nuevo — mezclar el paso «pasar a Business App» con «sumar la Cloud API» en la
misma maniobra, sobre el número real de la operación, es más riesgo del necesario para la
primera prueba.

---

## Lo que cuesta — con fecha, no en abstracto

Esto cambió dos veces en poco tiempo y va a cambiar de nuevo en seis semanas. No lo
resumo a un número fijo porque ya no lo es.

- **El nivel gratuito de 1.000 conversaciones por mes que existía antes ya no está.**
- **Vigente hoy (19 de agosto de 2026):** las conversaciones que inicia el cliente son
  gratis e ilimitadas desde noviembre de 2024. Dentro de esas, si la empresa responde
  dentro de las 24 horas del último mensaje del cliente, esa respuesta **todavía** no
  tiene costo.
- **El 1° de octubre de 2026 — a seis semanas de hoy — eso cambia:** las respuestas
  dentro de la ventana de 24 horas empiezan a cobrarse por mensaje, igual que las
  plantillas de utilidad y autenticación. Las plantillas de autenticación siempre se
  cobraron dentro de la ventana; ahora se les suman las de utilidad y las respuestas de
  servicio.
- **Las tarifas exactas todavía no están publicadas.** Meta las publica recién para el
  1° de septiembre de 2026 — antes de esa fecha no hay número real que citar.
- Los leads que entran por un anuncio de Click-to-WhatsApp o un botón de Facebook siguen
  con ventana gratis de 72 horas para cualquier tipo de mensaje, aparte de lo anterior.
- Esto rige solo para la Business Platform (la API). La app de WhatsApp normal y la
  WhatsApp Business App gratuitas no cambian.

**La consecuencia para depo zeta:** recién a partir de septiembre va a haber una tarifa
real para presupuestar. Conviene esperar esa fecha antes de calcular el costo mensual del
canal — armar el número y probar en la app de prueba de Meta no cuesta nada mientras
tanto.

---

## Arquitectura — dónde vive esto

No se puede recibir un webhook de Meta en una app que corre sólo en el navegador del
repartidor: Meta necesita pegarle a una URL pública con HTTPS que conteste rápido. Esto
significa que el mensaje de WhatsApp **necesita el mismo backend que ya estaba planeado
para F1** — la sincronización entre camionetas y el webhook pueden vivir en el mismo
Cloudflare Worker, es la misma pieza de infraestructura.

```
Meta (Cloud API) → POST /webhook (Cloudflare Worker) → guarda en D1 → la app lo
                                                          lee al sincronizar
```

Para mandar un mensaje: la app llama al Worker, y el Worker llama a
`POST https://graph.facebook.com/v21.0/{phone_number_id}/messages` con el token guardado
como secreto — nunca en el cliente, nunca en el repo. Mismo principio que la clave de
Google Maps.

---

## Scaffold ya escrito

`server/whatsapp-webhook.mjs` — el esqueleto del Worker: verificación del webhook (GET) y
recepción de mensajes (POST), más el helper para enviar. Escrito contra el contrato
público de la Cloud API (Graph API v21.0, confirmada vigente). **No probado contra una
app real de Meta** — no hay credenciales todavía. Antes de confiar en él en producción,
probarlo con la app y el número de prueba gratuitos que da la consola de Meta.

---

## Lo que sigue, en orden

1. El dueño del proyecto arranca la verificación de Meta Business — es lo que más tarda,
   conviene empezarlo ya aunque el resto se construya después.
2. Decidir número nuevo vs. coexistencia, con el criterio de arriba.
3. Desplegar `server/whatsapp-webhook.mjs` en un Worker con URL pública, cargar los
   secretos, y completar el alta del webhook en Meta.
4. Esperar al 1° de septiembre para presupuestar el costo real por mensaje.
5. Recién ahí conectar el panel de WhatsApp del prototipo a mensajes de verdad. Hoy
   sigue mostrando los links `wa.me` de la V1, que siguen sirviendo mientras tanto.

---

## Fuentes

Verificado el 19 de agosto de 2026, porque esto cambia y no vale la pena confiar en lo
que diga de memoria un modelo con fecha de corte anterior:

- [Pricing on the WhatsApp Business Platform — Meta for Developers](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)
- [Conversation-based pricing (Deprecated) — Meta for Developers](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/conversation-based-pricing)
- [WhatsApp Service Message Pricing Changes Explained (2026) — Wati](https://www.wati.io/en/blog/whatsapp-service-message-pricing/)
- [WhatsApp Business API: new pricing from October 1, 2026 — Nordflux](https://nordflux.de/en/insights/whatsapp-business-api-pricing-october-2026)
- [What is WhatsApp Business App Coexistence? — YCloud](https://www.ycloud.com/blog/whatsapp-business-app-coexistence-meta-update)
- [WhatsApp Coexistence: App + API on One Number (2026) — WhAutomate](https://whautomate.com/whatsapp-coexistence)
