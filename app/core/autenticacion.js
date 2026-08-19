/* ==========================================================================
   Autenticación — clave fuerte, TOTP siempre, sesiones cortas · DZ-SEG-01
   --------------------------------------------------------------------------
   Adaptado del mismo motor de Caja Zeta (`cajazeta/app/core/autenticacion.js`),
   con dos simplificaciones deliberadas para el tamaño de depo zeta:

     · El segundo factor es obligatorio para **los tres roles**, sin excepción
       — acá no hay un "operador de mostrador" de bajo riesgo: un REPARTIDOR
       ya opera ventas y cobra. En Caja Zeta el segundo factor se decide por
       rol (`rolDe` inyectado); acá no hace falta esa inyección.
     · No hay filtro de IPs. Un repartidor entra desde la calle, con la IP
       que le toque — restringir por IP no tiene sentido para este uso.

   Todo lo demás queda igual, porque ya está pensado y probado:

     · La clave se guarda como hash con sal (PBKDF2-SHA256, Web Crypto),
       nunca en claro.
     · La sesión expira a los 30 minutos de inactividad y tiene un tope
       absoluto de 8 horas — ambos configurables por `politica`.
     · Cinco intentos fallidos por identidad en 15 minutos; el sexto se
       rechaza sin mirar la clave ni el código.
     · El TOTP tiene anti-replay (RFC 6238 §5.2): un código aceptado quema
       su ventana.

   **Este módulo no decide permisos.** Autenticar es saber quién es;
   autorizar es de `autorizacion.js`.

   Los tickets del paso intermedio (clave verificada, falta el código) se
   guardan a través del repositorio — no en una variable en memoria del
   módulo. En un proceso Node de toda la vida daría lo mismo, pero en un
   Worker de Cloudflare cada request puede caer en una instancia distinta:
   una variable en memoria del paso 1 no sobrevive para el paso 2. El
   repositorio en memoria de más abajo (para los tests) sigue siendo un
   Map, sin más; el de D1 (`server/api/repo-d1.mjs`) usa una tabla.
   ========================================================================== */

import { ACCIONES_AUDITORIA } from './auditoria.js';
import { generarSecreto, verificarCodigo, uriOtpauth } from './totp.js';

/* ─────────────────────────────── Política ──────────────────────────────── */

export const POLITICA = Object.freeze({
  largoMinimo: 12,
  largoMaximo: 128,
  inactividadMinutos: 30,
  duracionMaximaHoras: 8,
  maxIntentos: 5,
  ventanaIntentosMinutos: 15,
  iteracionesPBKDF2: 600_000,
  totpReuso: 'rechazar',   // 'permitir' sólo existe para suites de prueba
  ticketMinutos: 5,
});

export function politicaClave(clave, usuario = '') {
  if (typeof clave !== 'string' || clave.length < POLITICA.largoMinimo) {
    return { ok: false, motivo: `la clave debe tener al menos ${POLITICA.largoMinimo} caracteres` };
  }
  if (clave.length > POLITICA.largoMaximo) {
    return { ok: false, motivo: `la clave no puede superar ${POLITICA.largoMaximo} caracteres` };
  }
  if (usuario && clave.toLowerCase().includes(String(usuario).toLowerCase())) {
    return { ok: false, motivo: 'la clave no puede contener el nombre de usuario' };
  }
  return { ok: true };
}

/* ─────────────────────────────── Hashing ───────────────────────────────── */

const aHex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
const deHex = (hex) => new Uint8Array(hex.match(/.{2}/g)?.map((h) => parseInt(h, 16)) ?? []);

async function derivar(clave, sal, iteraciones) {
  const material = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(clave), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iteraciones },
    material, 256);
  return aHex(bits);
}

export async function hashearClave(clave, { iteraciones = POLITICA.iteracionesPBKDF2 } = {}) {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivar(clave, sal, iteraciones);
  return `pbkdf2-sha256$${iteraciones}$${aHex(sal)}$${hash}`;
}

export async function verificarClave(clave, guardado) {
  if (typeof guardado !== 'string' || !guardado) return false;
  const [algo, iters, salHex, hashGuardado] = guardado.split('$');
  if (algo !== 'pbkdf2-sha256' || !salHex || !hashGuardado) return false;
  const hash = await derivar(clave, deHex(salHex), Number(iters));
  if (hash.length !== hashGuardado.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ hashGuardado.charCodeAt(i);
  return diff === 0;
}

/* Contra un usuario inexistente se verifica igual, contra este hash de una
   clave imposible. Sin esto, el tiempo de respuesta delata qué usuarios
   existen. */
const HASH_SENUELO = 'pbkdf2-sha256$600000$00000000000000000000000000000000$' + '0'.repeat(64);

/* ─────────────────────────────── Tokens ────────────────────────────────── */

const tokenNuevo = () => aHex(crypto.getRandomValues(new Uint8Array(32)));

/** En el repositorio va el hash del token, no el token: un volcado de la
    base no debe regalar sesiones vivas. */
export async function hashDeToken(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return aHex(digest);
}

/* ───────────────────── Repositorio en memoria (tests) ──────────────────── */

export function crearRepositorioAutenticacion() {
  const claves = new Map();
  const intentos = [];
  const sesiones = new Map();
  const totp = new Map();
  const tickets = new Map();

  return {
    async guardarTicket(id, datos) { tickets.set(id, { ...datos }); },
    async ticketPorId(id) { return tickets.get(id) ?? null; },
    async borrarTicket(id) { tickets.delete(id); },

    async claveDe(usuario) {
      return claves.has(usuario) ? { usuario, hash: claves.get(usuario) } : null;
    },
    async guardarClave(usuario, hash) { claves.set(usuario, hash); },

    async totpDe(usuario) { return totp.get(usuario) ?? null; },
    async guardarTotp(usuario, secreto, confirmado) {
      totp.set(usuario, { secreto, confirmado, ultimoPaso: totp.get(usuario)?.ultimoPaso ?? null });
    },
    async marcarPasoTotp(usuario, paso) {
      const t = totp.get(usuario);
      if (t) t.ultimoPaso = paso;
    },

    async registrarIntento(i) { intentos.push({ ...i }); },
    async intentosFallidosDesde(usuario, desde) {
      return intentos.filter((i) => i.usuario === usuario && !i.exito && i.fecha >= desde).length;
    },

    async guardarSesion(s) { sesiones.set(s.tokenHash, { ...s }); return s; },
    async sesionPorTokenHash(h) { return sesiones.get(h) ?? null; },
    async actualizarSesion(tokenHash, campos) {
      const s = sesiones.get(tokenHash);
      if (s) Object.assign(s, campos);
    },
    async revocarSesionesDe(usuario, fecha) {
      for (const s of sesiones.values()) {
        if (s.usuario === usuario && !s.revocadaEn) s.revocadaEn = fecha;
      }
    },
  };
}

/* ──────────────────────────────── Motor ────────────────────────────────── */

const MS = { minuto: 60_000, hora: 3_600_000 };

/**
 * @param {object} args
 * @param {object} args.repositorio  Claves, intentos, sesiones y TOTP.
 * @param {object} [args.auditoria]
 * @param {(usuario:string) => Promise<boolean>} [args.activoDe]
 * @param {() => Date} [args.ahora]
 * @param {object} [args.politica]
 */
export function crearAutenticacion({
  repositorio, auditoria = null,
  activoDe = async () => true, ahora = () => new Date(), politica = {},
}) {
  const P = { ...POLITICA, ...politica };

  async function emitirTicket(datos) {
    const hoy = ahora();
    const ticket = aHex(crypto.getRandomValues(new Uint8Array(32)));
    await repositorio.guardarTicket(ticket, { ...datos, expira: new Date(hoy.getTime() + P.ticketMinutos * MS.minuto) });
    return ticket;
  }

  const auditar = (accion, { usuario = null, ip = null, detalle = null } = {}) =>
    auditoria?.registrar({
      accion,
      sujeto: usuario ? { id: null, usuario, rol: null } : null,
      ip, detalle,
    }) ?? Promise.resolve();

  const error = (codigo, mensaje) => Object.assign(new Error(mensaje), { codigo });

  async function establecerClave({ usuario, clave }) {
    const p = politicaClave(clave, usuario);
    if (!p.ok) throw error('CLAVE_DEBIL', p.motivo);
    await repositorio.guardarClave(usuario, await hashearClave(clave, { iteraciones: P.iteracionesPBKDF2 }));
    await repositorio.revocarSesionesDe(usuario, ahora());
    await auditar(ACCIONES_AUDITORIA.CLAVE_ESTABLECIDA, { usuario });
    return { ok: true };
  }

  async function verificarClaveDe(usuario, clave) {
    const registro = await repositorio.claveDe(usuario);
    return verificarClave(clave, registro?.hash ?? HASH_SENUELO);
  }

  async function iniciarSesion({ usuario, clave, ip = null, userAgent = null }) {
    const hoy = ahora();
    const desde = new Date(hoy.getTime() - P.ventanaIntentosMinutos * MS.minuto);

    const fallidos = await repositorio.intentosFallidosDesde(usuario, desde);
    if (fallidos >= P.maxIntentos) {
      await repositorio.registrarIntento({ usuario, exito: false, ip, fecha: hoy });
      await auditar(ACCIONES_AUDITORIA.LOGIN_BLOCKED, {
        usuario, ip, detalle: { fallidos, ventanaMinutos: P.ventanaIntentosMinutos },
      });
      throw error('INTENTOS_EXCEDIDOS',
        `demasiados intentos fallidos: esperá ${P.ventanaIntentosMinutos} minutos`);
    }

    const registro = await repositorio.claveDe(usuario);
    const valida = await verificarClave(clave, registro?.hash || HASH_SENUELO);

    if (!registro?.hash || !valida) {
      await repositorio.registrarIntento({ usuario, exito: false, ip, fecha: hoy });
      await auditar(ACCIONES_AUDITORIA.LOGIN_FAILED, { usuario, ip });
      throw error('CREDENCIALES_INVALIDAS', 'usuario o clave incorrectos');
    }

    if (!(await activoDe(usuario))) {
      await auditar(ACCIONES_AUDITORIA.LOGIN_FAILED, { usuario, ip, detalle: { motivo: 'cuenta inactiva' } });
      throw error('CUENTA_INACTIVA', 'la cuenta está desactivada: hablá con tu depósito o administrador');
    }

    /* La clave está bien. El segundo factor es obligatorio para los tres
       roles acá — sin excepción, sin rol que lo salte. */
    const totp = await repositorio.totpDe(usuario);

    if (totp?.confirmado) {
      return {
        segundoFactor: 'REQUERIDO',
        ticket: await emitirTicket({ usuario, ip, userAgent, secretoPendiente: null }),
      };
    }

    const secreto = generarSecreto();
    return {
      segundoFactor: 'ENROLAR',
      ticket: await emitirTicket({ usuario, ip, userAgent, secretoPendiente: secreto }),
      secreto,
      uri: uriOtpauth({ usuario, secreto }),
    };
  }

  async function abrirSesion({ usuario, ip, userAgent }) {
    const hoy = ahora();
    await repositorio.registrarIntento({ usuario, exito: true, ip, fecha: hoy });

    const token = tokenNuevo();
    const sesion = {
      tokenHash: await hashDeToken(token),
      usuario,
      creadaEn: hoy,
      ultimaActividad: hoy,
      expiraEn: new Date(hoy.getTime() + P.duracionMaximaHoras * MS.hora),
      revocadaEn: null,
      ip, userAgent,
    };
    await repositorio.guardarSesion(sesion);
    await auditar(ACCIONES_AUDITORIA.LOGIN_SUCCESS, { usuario, ip });

    return { token, usuario, expiraEn: sesion.expiraEn, inactividadMinutos: P.inactividadMinutos };
  }

  async function completarTotp({ ticket, codigo, ip = null, userAgent = null }) {
    const hoy = ahora();
    const datos = await repositorio.ticketPorId(ticket ?? '');

    if (!datos || new Date(datos.expira) <= hoy) {
      await repositorio.borrarTicket(ticket ?? '');
      throw error('TICKET_INVALIDO', 'el ingreso venció: volvé a poner usuario y clave');
    }
    const { usuario } = datos;

    const desde = new Date(hoy.getTime() - P.ventanaIntentosMinutos * MS.minuto);
    if (await repositorio.intentosFallidosDesde(usuario, desde) >= P.maxIntentos) {
      await repositorio.borrarTicket(ticket);
      await auditar(ACCIONES_AUDITORIA.LOGIN_BLOCKED, { usuario, ip });
      throw error('INTENTOS_EXCEDIDOS',
        `demasiados intentos fallidos: esperá ${P.ventanaIntentosMinutos} minutos`);
    }

    const registro = await repositorio.totpDe(usuario);
    const secreto = datos.secretoPendiente ?? registro?.secreto;
    const pasoAceptado = secreto ? await verificarCodigo(secreto, codigo, { ahora: hoy }) : null;
    if (!pasoAceptado) {
      await repositorio.registrarIntento({ usuario, exito: false, ip, fecha: hoy });
      await auditar(ACCIONES_AUDITORIA.LOGIN_FAILED, { usuario, ip, detalle: { paso: 'segundo factor' } });
      throw error('CODIGO_INVALIDO', 'el código no es válido');
    }

    if (P.totpReuso !== 'permitir'
        && registro?.ultimoPaso != null && pasoAceptado <= Number(registro.ultimoPaso)) {
      await repositorio.registrarIntento({ usuario, exito: false, ip, fecha: hoy });
      await auditar(ACCIONES_AUDITORIA.LOGIN_FAILED, {
        usuario, ip, detalle: { paso: 'segundo factor', motivo: 'código reusado' },
      });
      throw error('CODIGO_INVALIDO', 'el código no es válido');
    }

    if (datos.secretoPendiente) {
      await repositorio.guardarTotp(usuario, secreto, true);
      await auditar(ACCIONES_AUDITORIA.TOTP_ENROLADO, { usuario, ip });
    }

    await repositorio.marcarPasoTotp(usuario, pasoAceptado);
    await repositorio.borrarTicket(ticket);
    return abrirSesion({ usuario, ip: ip ?? datos.ip, userAgent: userAgent ?? datos.userAgent });
  }

  async function validarSesion(token) {
    if (typeof token !== 'string' || token.length < 32) return null;
    const s = await repositorio.sesionPorTokenHash(await hashDeToken(token));
    if (!s || s.revocadaEn) return null;

    const hoy = ahora();
    if (hoy >= s.expiraEn) return null;
    if (hoy.getTime() - new Date(s.ultimaActividad).getTime() > P.inactividadMinutos * MS.minuto) {
      await repositorio.actualizarSesion(s.tokenHash, { revocadaEn: hoy });
      return null;
    }

    if (!(await activoDe(s.usuario))) {
      await repositorio.actualizarSesion(s.tokenHash, { revocadaEn: hoy });
      return null;
    }

    await repositorio.actualizarSesion(s.tokenHash, { ultimaActividad: hoy });
    return { usuario: s.usuario, creadaEn: s.creadaEn, expiraEn: s.expiraEn };
  }

  async function cerrarSesion(token) {
    const s = await repositorio.sesionPorTokenHash(await hashDeToken(token ?? ''));
    if (s && !s.revocadaEn) await repositorio.actualizarSesion(s.tokenHash, { revocadaEn: ahora() });
    return { ok: true };
  }

  async function segundoFactorDe(usuario) {
    return Boolean((await repositorio.totpDe(usuario))?.confirmado);
  }

  /** Reinicia el TOTP de un usuario (perdió el teléfono, cambió de app).
      La autorización de quién puede pedirlo la impone la API, no esto. */
  async function reiniciarTotp({ usuario }) {
    await repositorio.guardarTotp(usuario, null, false);
    await repositorio.revocarSesionesDe(usuario, ahora());
    await auditar(ACCIONES_AUDITORIA.TOTP_REINICIADO, { usuario, detalle: { reinicio: true } });
    return { ok: true };
  }

  return {
    establecerClave, verificarClaveDe, iniciarSesion, completarTotp,
    validarSesion, cerrarSesion, segundoFactorDe, reiniciarTotp, politica: P,
  };
}
