/* ==========================================================================
   Autenticación: política, hash, TOTP siempre, intentos y expiraciones
   --------------------------------------------------------------------------
   El reloj va inyectado: la expiración por inactividad y el tope absoluto
   se prueban avanzando el tiempo, no esperándolo. Acá no hay camino directo
   a `abrirSesion` sin TOTP —a diferencia de Caja Zeta, donde el rol decide—:
   depo zeta lo exige a los tres roles, así que todo login pasa por el
   ticket → completarTotp().
   ========================================================================== */

import { describe, test, igual, assert } from './harness.js';
import {
  crearAutenticacion, crearRepositorioAutenticacion, politicaClave,
  hashearClave, verificarClave, POLITICA,
} from '../autenticacion.js';
import { codigoTotp } from '../totp.js';

function armar(politica = {}, inactivos = new Set()) {
  let t = new Date('2026-08-19T10:00:00Z');
  const reloj = {
    avanzarMinutos: (m) => { t = new Date(t.getTime() + m * 60_000); },
    avanzarSegundos: (s) => { t = new Date(t.getTime() + s * 1_000); },
  };
  const repositorio = crearRepositorioAutenticacion();
  const auth = crearAutenticacion({
    repositorio,
    activoDe: async (u) => !inactivos.has(u),
    ahora: () => t,
    politica: { iteracionesPBKDF2: 1_000, ...politica },
  });
  return { auth, reloj, repositorio, ahora: () => t };
}

const CLAVE = 'una clave larga y decente';

async function lanzaCon(fn, codigo) {
  try { await fn(); } catch (e) { igual(e.codigo, codigo); return e; }
  throw new Error(`se esperaba el error ${codigo}`);
}

/* ─────────────────────────────── Política ──────────────────────────────── */

describe('autenticación · política de clave', () => {
  test('una clave corta se rechaza', () => {
    igual(politicaClave('corta123').ok, false);
  });

  test('doce caracteres cualesquiera alcanzan', () => {
    igual(politicaClave('doce letras!').ok, true);
  });

  test('la clave no puede contener el nombre de usuario', () => {
    igual(politicaClave('marcos.demo.2026', 'marcos').ok, false);
    igual(politicaClave('otra cosa bien larga', 'marcos').ok, true);
  });

  test('el costo por defecto es el máximo que acepta el runtime de Cloudflare Workers', () => {
    igual(POLITICA.iteracionesPBKDF2, 100_000);
  });
});

/* ──────────────────────────────── Hash ─────────────────────────────────── */

describe('autenticación · hash de clave', () => {
  test('el hash verifica la clave correcta y rechaza la incorrecta', async () => {
    const h = await hashearClave(CLAVE, { iteraciones: 1_000 });
    igual(await verificarClave(CLAVE, h), true);
    igual(await verificarClave('otra clave distinta', h), false);
  });

  test('dos hashes de la misma clave difieren: la sal es por clave', async () => {
    const a = await hashearClave(CLAVE, { iteraciones: 1_000 });
    const b = await hashearClave(CLAVE, { iteraciones: 1_000 });
    assert(a !== b, 'sin sal aleatoria, dos usuarios con la misma clave se delatan');
  });

  test('un hash vacío o ajeno nunca verifica', async () => {
    igual(await verificarClave(CLAVE, ''), false);
    igual(await verificarClave(CLAVE, null), false);
    igual(await verificarClave(CLAVE, 'md5$lo-que-sea'), false);
  });
});

/* ────────────────────────── El login completo ──────────────────────────── */

describe('autenticación · TOTP obligatorio para los tres roles, siempre', () => {
  test('el primer login pide ENROLAR, nunca abre sesión directo', async () => {
    const { auth } = armar();
    await auth.establecerClave({ usuario: 'marcos', clave: CLAVE });
    const r = await auth.iniciarSesion({ usuario: 'marcos', clave: CLAVE });
    igual(r.segundoFactor, 'ENROLAR');
    assert(r.secreto, 'trae el secreto para armar el QR');
    assert(r.ticket, 'trae el ticket para el segundo paso');
  });

  test('enrolar con el código correcto abre sesión, y confirma el TOTP', async () => {
    const { auth, ahora } = armar();
    await auth.establecerClave({ usuario: 'marcos', clave: CLAVE });
    const r = await auth.iniciarSesion({ usuario: 'marcos', clave: CLAVE });
    const codigo = await codigoTotp(r.secreto, { ahora: ahora() });

    const sesion = await auth.completarTotp({ ticket: r.ticket, codigo });
    assert(sesion.token);
    igual(await auth.segundoFactorDe('marcos'), true, 'quedó confirmado');
  });

  test('el segundo login ya no ofrece enrolar: pide el código de la app', async () => {
    const { auth, ahora } = armar();
    await auth.establecerClave({ usuario: 'marcos', clave: CLAVE });
    const r1 = await auth.iniciarSesion({ usuario: 'marcos', clave: CLAVE });
    await auth.completarTotp({ ticket: r1.ticket, codigo: await codigoTotp(r1.secreto, { ahora: ahora() }) });

    const r2 = await auth.iniciarSesion({ usuario: 'marcos', clave: CLAVE });
    igual(r2.segundoFactor, 'REQUERIDO');
    igual(r2.secreto, undefined, 'no vuelve a mandar el secreto: ya está enrolado');
  });

  test('anti-replay: el mismo código no abre dos sesiones (RFC 6238 §5.2)', async () => {
    const { auth, ahora } = armar();
    await auth.establecerClave({ usuario: 'marcos', clave: CLAVE });
    const r1 = await auth.iniciarSesion({ usuario: 'marcos', clave: CLAVE });
    const codigo = await codigoTotp(r1.secreto, { ahora: ahora() });
    await auth.completarTotp({ ticket: r1.ticket, codigo });

    const r2 = await auth.iniciarSesion({ usuario: 'marcos', clave: CLAVE });
    await lanzaCon(() => auth.completarTotp({ ticket: r2.ticket, codigo }), 'CODIGO_INVALIDO');
  });

  test('un código equivocado no enrola ni abre sesión', async () => {
    const { auth } = armar();
    await auth.establecerClave({ usuario: 'marcos', clave: CLAVE });
    const r = await auth.iniciarSesion({ usuario: 'marcos', clave: CLAVE });
    await lanzaCon(() => auth.completarTotp({ ticket: r.ticket, codigo: '000000' }), 'CODIGO_INVALIDO');
    igual(await auth.segundoFactorDe('marcos'), false, 'no quedó confirmado con un código malo');
  });

  test('el ticket vence a los 5 minutos: no se puede enrolar con uno viejo', async () => {
    const { auth, reloj, ahora } = armar();
    await auth.establecerClave({ usuario: 'marcos', clave: CLAVE });
    const r = await auth.iniciarSesion({ usuario: 'marcos', clave: CLAVE });
    const codigo = await codigoTotp(r.secreto, { ahora: ahora() });
    reloj.avanzarMinutos(6);
    await lanzaCon(() => auth.completarTotp({ ticket: r.ticket, codigo }), 'TICKET_INVALIDO');
  });

  test('reiniciar TOTP borra el enrolamiento: el próximo login vuelve a pedir QR', async () => {
    const { auth, ahora } = armar();
    await auth.establecerClave({ usuario: 'marcos', clave: CLAVE });
    const r1 = await auth.iniciarSesion({ usuario: 'marcos', clave: CLAVE });
    await auth.completarTotp({ ticket: r1.ticket, codigo: await codigoTotp(r1.secreto, { ahora: ahora() }) });

    await auth.reiniciarTotp({ usuario: 'marcos' });
    const r2 = await auth.iniciarSesion({ usuario: 'marcos', clave: CLAVE });
    igual(r2.segundoFactor, 'ENROLAR', 'perdió el enrolamiento, vuelve a pedir QR');
  });
});

/* ─────────────────────────────── Sesión ────────────────────────────────── */

describe('autenticación · sesión', () => {
  test('clave incorrecta y usuario inexistente fallan con el mismo mensaje', async () => {
    const { auth } = armar();
    await auth.establecerClave({ usuario: 'marcos', clave: CLAVE });
    const a = await lanzaCon(() => auth.iniciarSesion({ usuario: 'marcos', clave: 'clave equivocada!' }),
      'CREDENCIALES_INVALIDAS');
    const b = await lanzaCon(() => auth.iniciarSesion({ usuario: 'nadie', clave: CLAVE }),
      'CREDENCIALES_INVALIDAS');
    igual(a.message, b.message, 'mensajes distintos regalan la lista de usuarios');
  });

  test('la sesión expira a los 30 minutos de inactividad', async () => {
    const { auth, reloj, ahora } = armar();
    await auth.establecerClave({ usuario: 'marcos', clave: CLAVE });
    const r = await auth.iniciarSesion({ usuario: 'marcos', clave: CLAVE });
    const { token } = await auth.completarTotp({ ticket: r.ticket, codigo: await codigoTotp(r.secreto, { ahora: ahora() }) });

    reloj.avanzarMinutos(29);
    assert(await auth.validarSesion(token), 'a los 29 minutos sigue viva');
    reloj.avanzarMinutos(29);
    assert(await auth.validarSesion(token), 'cada uso renueva la ventana');
    reloj.avanzarMinutos(31);
    igual(await auth.validarSesion(token), null, 'a los 31 minutos sin uso, muere');
  });

  test('el tope absoluto de 8 horas corta aunque la sesión se use sin parar', async () => {
    const { auth, reloj, ahora } = armar();
    await auth.establecerClave({ usuario: 'marcos', clave: CLAVE });
    const r = await auth.iniciarSesion({ usuario: 'marcos', clave: CLAVE });
    const { token } = await auth.completarTotp({ ticket: r.ticket, codigo: await codigoTotp(r.secreto, { ahora: ahora() }) });

    for (let i = 0; i < 16; i++) {
      reloj.avanzarMinutos(29);
      assert(await auth.validarSesion(token), `viva a las ${((i + 1) * 29 / 60).toFixed(1)} h`);
    }
    reloj.avanzarMinutos(29);
    igual(await auth.validarSesion(token), null, 'el tope absoluto no se renueva');
  });

  test('una cuenta desactivada corta la sesión ya abierta, no sólo el próximo login', async () => {
    const inactivos = new Set();
    const { auth, ahora } = armar({}, inactivos);
    await auth.establecerClave({ usuario: 'marcos', clave: CLAVE });
    const r = await auth.iniciarSesion({ usuario: 'marcos', clave: CLAVE });
    const { token } = await auth.completarTotp({ ticket: r.ticket, codigo: await codigoTotp(r.secreto, { ahora: ahora() }) });
    assert(await auth.validarSesion(token));

    inactivos.add('marcos');
    igual(await auth.validarSesion(token), null, 'se desactivó: la sesión viva también muere');
  });

  test('cerrar sesión revoca el token', async () => {
    const { auth, ahora } = armar();
    await auth.establecerClave({ usuario: 'marcos', clave: CLAVE });
    const r = await auth.iniciarSesion({ usuario: 'marcos', clave: CLAVE });
    const { token } = await auth.completarTotp({ ticket: r.ticket, codigo: await codigoTotp(r.secreto, { ahora: ahora() }) });
    await auth.cerrarSesion(token);
    igual(await auth.validarSesion(token), null);
  });
});

/* ────────────────────────────── Rate limiting ──────────────────────────── */

describe('autenticación · intentos limitados (fuerza bruta)', () => {
  test('el sexto intento fallido en 15 minutos se rechaza sin mirar la clave', async () => {
    const { auth } = armar();
    await auth.establecerClave({ usuario: 'marcos', clave: CLAVE });
    for (let i = 0; i < 5; i++) {
      await lanzaCon(() => auth.iniciarSesion({ usuario: 'marcos', clave: 'mal' }), 'CREDENCIALES_INVALIDAS');
    }
    // el sexto, incluso con la clave BIEN, se rechaza por el límite
    await lanzaCon(() => auth.iniciarSesion({ usuario: 'marcos', clave: CLAVE }), 'INTENTOS_EXCEDIDOS');
  });

  test('un código de TOTP incorrecto también cuenta como intento fallido', async () => {
    const { auth, ahora } = armar();
    await auth.establecerClave({ usuario: 'marcos', clave: CLAVE });
    const r = await auth.iniciarSesion({ usuario: 'marcos', clave: CLAVE });
    for (let i = 0; i < 4; i++) {
      await lanzaCon(() => auth.completarTotp({ ticket: r.ticket, codigo: '000000' }), 'CODIGO_INVALIDO');
    }
    // van 4 fallidos de TOTP; uno más de clave alcanza el tope de 5
    await lanzaCon(() => auth.iniciarSesion({ usuario: 'marcos', clave: 'mal' }), 'CREDENCIALES_INVALIDAS');
    await lanzaCon(() => auth.iniciarSesion({ usuario: 'marcos', clave: CLAVE }), 'INTENTOS_EXCEDIDOS');
  });
});
