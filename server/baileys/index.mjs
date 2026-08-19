/**
 * depo zeta — conexión de WhatsApp vía Baileys (alternativa no oficial) · DZ-BAI-01
 *
 * LEER LA ADVERTENCIA EN DZ-BAI-01 ANTES DE CORRER ESTO. Este script automatiza
 * una cuenta de WhatsApp común por fuera de la app oficial. Viola los Términos
 * de Servicio de WhatsApp y el número puede quedar baneado sin aviso, de forma
 * permanente. Probarlo únicamente con un número descartable — nunca con el
 * número real de la operación.
 *
 * Contra @whiskeysockets/baileys en su línea estable 6.7.x — la 7.x sigue en
 * release candidate y trae cambios incompatibles, no se apunta a esa acá.
 * No probado en vivo — escrito contra el patrón documentado en baileys.wiki,
 * sin una sesión real vinculada al momento de escribir esto.
 */
import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import qrcodeTerminal from 'qrcode-terminal';

async function iniciar() {
  // auth_info/ guarda la sesión vinculada — es tan sensible como una
  // contraseña. NUNCA se commitea (ver .gitignore de esta carpeta).
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');

  const sock = makeWASocket({ auth: state });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (actualizacion) => {
    const { connection, lastDisconnect, qr } = actualizacion;

    if (qr) {
      console.log('Escaneá este código desde el número de PRUEBA — WhatsApp → Dispositivos vinculados:');
      qrcodeTerminal.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const debeReconectar =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log(
        'Conexión cerrada.',
        debeReconectar ? 'Reconectando…' : 'Sesión cerrada — hay que volver a escanear el QR.'
      );
      // Sin backoff todavía: reconecta apenas se corta. Ver "lo que no está
      // resuelto" en DZ-BAI-01 — puede generar más tráfico de reconexión del
      // conveniente frente a los sistemas de detección de Meta.
      if (debeReconectar) iniciar();
    } else if (connection === 'open') {
      console.log('Conectado.');
    }
  });

  // El mismo punto de contacto que el webhook de la Cloud API: acá se decide
  // qué hacer con un mensaje entrante (guardarlo, mostrarlo, lo que sea).
  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const m of messages) {
      if (m.key.fromMe) continue;
      const texto =
        m.message?.conversation ??
        m.message?.extendedTextMessage?.text ??
        `[mensaje sin texto plano: ${Object.keys(m.message || {})[0] || 'desconocido'}]`;
      console.log('mensaje entrante:', {
        de: m.key.remoteJid,
        texto,
        nombre: m.pushName,
        fecha: new Date(Number(m.messageTimestamp) * 1000).toISOString(),
      });
      // TODO: guardar donde corresponda — si algún día conviven Baileys y la
      // Cloud API, en el mismo lugar que los mensajes de whatsapp-webhook.mjs.
    }
  });

  return sock;
}

/* numero en formato "54911XXXXXXXX@s.whatsapp.net" */
export async function enviarMensajeBaileys(sock, numero, texto) {
  return sock.sendMessage(numero, { text: texto });
}

iniciar();
