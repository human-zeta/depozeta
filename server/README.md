# server/ — backend de depo zeta (F1, en construcción)

Todavía no hay servidor de sincronización entre camionetas. Esto es lo primero que ocupa
ese lugar: el webhook de WhatsApp, porque los dos necesitan lo mismo —un backend con URL
pública— y tiene sentido que terminen compartiendo el mismo Worker.

## Qué hay

| Archivo | Qué es |
|---|---|
| [`whatsapp-webhook.mjs`](whatsapp-webhook.mjs) | Cloudflare Worker: recibe mensajes entrantes de la Cloud API de WhatsApp y expone el envío. Ver [`DZ-WSP-01`](../docs/tecnico/02-whatsapp-cloud-api-dz-wsp-01.md) para el plan completo |
| [`wrangler.toml`](wrangler.toml) | Configuración mínima para desplegar con `wrangler` |
| [`baileys/`](baileys/) | Alternativa no oficial — **leer la advertencia antes de tocar esto**: [`DZ-BAI-01`](../docs/tecnico/03-baileys-alternativa-dz-bai-01.md) |

## Antes de desplegar

Esto no sirve de nada sin que el dueño del proyecto complete, por su cuenta, la
verificación de Meta Business y el alta del número — son trámites que sólo puede hacer
quien controla esa cuenta e identidad. El checklist completo está en DZ-WSP-01.

## Desplegar

```bash
npm install -g wrangler
wrangler secret put WA_VERIFY_TOKEN
wrangler secret put WA_ACCESS_TOKEN
wrangler secret put WA_PHONE_NUMBER_ID
wrangler deploy
```

La URL que devuelve `wrangler deploy` es la que se carga en Meta, en la configuración del
webhook, junto con el mismo valor elegido para `WA_VERIFY_TOKEN`.

## No probado contra Meta real

Escrito contra el contrato público de la Cloud API, sin credenciales para probarlo en
vivo. Meta da una app y un número de prueba gratis en su consola de desarrollo — usarlo
ahí antes de apuntar al número real de la operación.
