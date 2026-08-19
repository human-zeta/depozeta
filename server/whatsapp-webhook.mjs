/**
 * depo zeta — webhook de WhatsApp Business Cloud API · DZ-WSP-01
 *
 * Escrito contra el contrato público de la Cloud API de Meta (Graph API v21.0).
 * No probado todavía contra una app real de Meta — no hay credenciales al
 * momento de escribir esto. Antes de confiar en él en producción: probarlo
 * con la app y el número de prueba gratuitos de Meta for Developers.
 *
 * Secretos esperados (cargar con `wrangler secret put NOMBRE`, nunca en el repo):
 *   WA_VERIFY_TOKEN    — elegido acá, se lo pasás a Meta al configurar el webhook
 *   WA_ACCESS_TOKEN    — token del System User, generado en Meta Business Manager
 *   WA_PHONE_NUMBER_ID — el id que Meta asigna al número dado de alta
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET') return verificarWebhook(url, env);
    if (request.method === 'POST') return recibirMensaje(request, env);
    return new Response('Método no soportado', { status: 405 });
  },
};

/* Meta llama esto una sola vez, al configurar el webhook en su consola. Si el
   verify_token no coincide con el nuestro, hay que rechazar — si no, cualquiera
   podría registrar su propio webhook apuntando a este número. */
function verificarWebhook(url, env) {
  const modo = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const desafio = url.searchParams.get('hub.challenge');

  if (modo === 'subscribe' && token === env.WA_VERIFY_TOKEN) {
    return new Response(desafio, { status: 200 });
  }
  return new Response('Token de verificación inválido', { status: 403 });
}

/* Meta espera una respuesta rápida (200) para no reintentar el mismo mensaje.
   Todo lo demás pasa después de esa respuesta, no antes. */
async function recibirMensaje(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return new Response('JSON inválido', { status: 400 });
  }

  const cambios = payload.entry?.[0]?.changes?.[0]?.value;
  const mensajes = cambios?.messages || [];

  for (const m of mensajes) {
    const entrada = {
      de: m.from,                                  // wa_id del cliente, ej "5491155128840"
      texto: m.text?.body ?? `[${m.type}]`,         // lo que no es texto (imagen, audio) queda marcado, no se descarta
      idMensaje: m.id,
      fecha: new Date(Number(m.timestamp) * 1000).toISOString(),
      nombreContacto: cambios?.contacts?.[0]?.profile?.name ?? null,
    };

    if (env.DB) {
      // TODO F1: crear la tabla cuando exista el esquema de sincronización.
      // await env.DB.prepare(
      //   'INSERT INTO mensajes_whatsapp (id, de, texto, fecha, nombre) VALUES (?,?,?,?,?)'
      // ).bind(entrada.idMensaje, entrada.de, entrada.texto, entrada.fecha, entrada.nombreContacto).run();
      console.log('mensaje de whatsapp (D1 todavía sin tabla, ver TODO):', entrada);
    } else {
      console.log('mensaje de whatsapp (sin D1 todavía):', entrada);
    }
  }

  return new Response('OK', { status: 200 });
}

/* Para mandar un mensaje. Fuera de la ventana de 24 horas desde el último
   mensaje del cliente, esto falla si `texto` no corresponde a una plantilla
   aprobada — es Meta rechazándolo, no una limitación de este código. Y desde
   el 1° de octubre de 2026 hasta las respuestas dentro de esa ventana pasan a
   cobrarse por mensaje — ver DZ-WSP-01. */
export async function enviarMensajeWhatsapp(numero, texto, env) {
  const resp = await fetch(
    `https://graph.facebook.com/v21.0/${env.WA_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.WA_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: numero,
        type: 'text',
        text: { body: texto },
      }),
    }
  );
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Meta rechazó el envío (${resp.status}): ${err}`);
  }
  return resp.json();
}
