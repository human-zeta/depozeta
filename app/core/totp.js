/* ==========================================================================
   TOTP — el segundo factor, sin dependencias · DZ-SEG-01
   --------------------------------------------------------------------------
   RFC 6238 sobre HMAC-SHA1, 6 dígitos, paso de 30 segundos: el estándar que
   hablan Microsoft Authenticator, Google Authenticator, 1Password y todos
   los demás. No se integra ningún proveedor de identidad: el secreto vive
   en nuestra base, el código lo genera la app que el usuario elija, y la
   verificación es una cuenta de HMAC que corre acá.

   Portado del mismo módulo en Caja Zeta (`cajazeta/app/core/totp.js`) — es
   genérico, sin nada propio de esa base, así que la casa lo reusa tal cual.

   Web Crypto: corre en Node 20+, en el navegador y en Cloudflare Workers,
   sin bifurcar.
   ========================================================================== */

/* ------------------------------- Base32 ----------------------------------
   RFC 4648. Es el formato en que las apps de autenticación esperan el
   secreto — la "clave manual" que el usuario tipea si no escanea un QR. */

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function aBase32(bytes) {
  let bits = 0, valor = 0, salida = '';
  for (const b of bytes) {
    valor = (valor << 8) | b;
    bits += 8;
    while (bits >= 5) {
      salida += ALFABETO[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) salida += ALFABETO[(valor << (5 - bits)) & 31];
  return salida;
}

export function deBase32(texto) {
  const limpio = String(texto).toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0, valor = 0;
  const salida = [];
  for (const c of limpio) {
    const i = ALFABETO.indexOf(c);
    if (i < 0) throw new Error(`carácter inválido en base32: "${c}"`);
    valor = (valor << 5) | i;
    bits += 5;
    if (bits >= 8) {
      salida.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(salida);
}

/* -------------------------------- TOTP ------------------------------------ */

export const PASO_SEGUNDOS = 30;
export const DIGITOS = 6;

/** Secreto nuevo: 20 bytes aleatorios, en base32 para la app del usuario. */
export function generarSecreto() {
  return aBase32(crypto.getRandomValues(new Uint8Array(20)));
}

async function hmacSha1(claveBytes, mensajeBytes) {
  const clave = await crypto.subtle.importKey(
    'raw', claveBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', clave, mensajeBytes));
}

/**
 * El código para un instante dado. SHA-1 acá no es una debilidad: HMAC-SHA1
 * sigue siendo seguro para autenticación y es lo que el ecosistema de apps
 * implementa — un secreto "más fuerte" que ninguna app puede leer no
 * autentica a nadie.
 */
export async function codigoTotp(secretoBase32, { ahora = new Date(), paso = PASO_SEGUNDOS } = {}) {
  const contador = Math.floor(ahora.getTime() / 1000 / paso);
  const mensaje = new Uint8Array(8);
  new DataView(mensaje.buffer).setBigUint64(0, BigInt(contador));

  const h = await hmacSha1(deBase32(secretoBase32), mensaje);
  const desplazamiento = h[h.length - 1] & 0x0f;
  const binario =
    ((h[desplazamiento] & 0x7f) << 24) |
    (h[desplazamiento + 1] << 16) |
    (h[desplazamiento + 2] << 8) |
    h[desplazamiento + 3];

  return String(binario % 10 ** DIGITOS).padStart(DIGITOS, '0');
}

/**
 * ¿El código es válido ahora? Se acepta la ventana anterior y la siguiente
 * (±30 s): los relojes de los teléfonos derivan y un código tipeado sobre
 * el final de su ventana no puede fallar por eso. Más ventana que ésa ya no
 * es tolerancia: es bajar la barrera.
 *
 * Devuelve el PASO (número de ventana) del código que matcheó, o null.
 * El paso es lo que permite el anti-replay (RFC 6238 §5.2): quien guarda el
 * último paso aceptado puede rechazar cualquier código de un paso ≤ ése.
 * Sigue siendo veraz como booleano: un paso real nunca es 0.
 */
export async function verificarCodigo(secretoBase32, codigo, { ahora = new Date(), paso = PASO_SEGUNDOS } = {}) {
  const limpio = String(codigo ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(limpio)) return null;

  for (const ventana of [0, -1, 1]) {
    const instante = new Date(ahora.getTime() + ventana * paso * 1000);
    if ((await codigoTotp(secretoBase32, { ahora: instante, paso })) === limpio) {
      return Math.floor(instante.getTime() / (paso * 1000));
    }
  }
  return null;
}

/**
 * La URI estándar de enrolamiento (`otpauth://`). Las apps la aceptan como
 * QR o el usuario carga el secreto a mano — la pantalla muestra los dos.
 */
export function uriOtpauth({ usuario, secreto, emisor = 'depo zeta' }) {
  const e = encodeURIComponent(emisor);
  const u = encodeURIComponent(usuario);
  return `otpauth://totp/${e}:${u}?secret=${secreto}&issuer=${e}&algorithm=SHA1&digits=${DIGITOS}&period=${PASO_SEGUNDOS}`;
}
