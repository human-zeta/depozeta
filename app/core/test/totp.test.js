/* ==========================================================================
   TOTP: contra los vectores del RFC, no contra sí mismo
   --------------------------------------------------------------------------
   RFC 6238, apéndice B: secreto ASCII "12345678901234567890" y tres
   instantes con su código esperado. Mismos vectores que usa Caja Zeta —
   totp.js es el mismo módulo, portado. Si esta implementación coincide con
   el RFC, coincide con Microsoft Authenticator, Google Authenticator y
   todas las apps del ecosistema.
   ========================================================================== */

import { describe, test, igual, assert } from './harness.js';
import {
  aBase32, deBase32, generarSecreto, codigoTotp, verificarCodigo, uriOtpauth,
} from '../totp.js';

const SECRETO_RFC = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('totp · base32 (RFC 4648)', () => {
  test('ida y vuelta sin pérdida', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255, 77, 128, 3, 9, 200]);
    igual(aBase32(deBase32(aBase32(bytes))), aBase32(bytes));
  });

  test('el secreto del RFC decodifica al ASCII esperado', () => {
    const texto = new TextDecoder().decode(deBase32(SECRETO_RFC));
    igual(texto, '12345678901234567890');
  });

  test('acepta minúsculas, espacios y guiones: como lo tipea una persona', () => {
    igual(aBase32(deBase32('gezd gnbv-GY3T QOJQ gezd gnbv-gy3t qojq')), SECRETO_RFC);
  });
});

describe('totp · los vectores del RFC 6238', () => {
  const casos = [
    [59, '287082'],
    [1111111109, '081804'],
    [1234567890, '005924'],
  ];
  for (const [segundos, esperado] of casos) {
    test(`en t=${segundos}s el código es ${esperado}`, async () => {
      igual(await codigoTotp(SECRETO_RFC, { ahora: new Date(segundos * 1000) }), esperado);
    });
  }
});

describe('totp · verificación', () => {
  const t = new Date('2026-08-19T12:00:15Z');

  test('el código de la ventana actual verifica', async () => {
    const c = await codigoTotp(SECRETO_RFC, { ahora: t });
    assert(await verificarCodigo(SECRETO_RFC, c, { ahora: t }), 'devuelve el paso aceptado');
  });

  test('la ventana anterior y la siguiente también: los relojes derivan', async () => {
    const antes = await codigoTotp(SECRETO_RFC, { ahora: new Date(t.getTime() - 30_000) });
    const despues = await codigoTotp(SECRETO_RFC, { ahora: new Date(t.getTime() + 30_000) });
    assert(await verificarCodigo(SECRETO_RFC, antes, { ahora: t }), 'ventana anterior');
    assert(await verificarCodigo(SECRETO_RFC, despues, { ahora: t }), 'ventana siguiente');
  });

  test('dos ventanas atrás ya no: tolerancia no es bajar la barrera', async () => {
    const viejo = await codigoTotp(SECRETO_RFC, { ahora: new Date(t.getTime() - 90_000) });
    igual(await verificarCodigo(SECRETO_RFC, viejo, { ahora: t }), null);
  });

  test('basura, vacío y largos incorrectos no verifican', async () => {
    for (const c of ['', null, '12345', '1234567', 'abcdef', '12 34 5']) {
      igual(await verificarCodigo(SECRETO_RFC, c, { ahora: t }), null, `"${c}" no debería pasar`);
    }
  });

  test('el código con espacios del usuario sí: "123 456" es 123456', async () => {
    const c = await codigoTotp(SECRETO_RFC, { ahora: t });
    const espaciado = c.slice(0, 3) + ' ' + c.slice(3);
    assert(await verificarCodigo(SECRETO_RFC, espaciado, { ahora: t }), 'con espacios verifica');
  });
});

describe('totp · secreto y URI de enrolamiento', () => {
  test('cada secreto es distinto y decodifica a 20 bytes', () => {
    const a = generarSecreto();
    const b = generarSecreto();
    assert(a !== b, 'sin azar no hay secreto');
    igual(deBase32(a).length, 20);
  });

  test('la URI otpauth lleva secreto, emisor y usuario — issuer "depo zeta"', () => {
    const uri = uriOtpauth({ usuario: 'marcos', secreto: SECRETO_RFC });
    assert(uri.startsWith('otpauth://totp/'), uri);
    assert(uri.includes(`secret=${SECRETO_RFC}`));
    assert(uri.includes('issuer=depo%20zeta'));
    assert(uri.includes('marcos'));
  });
});
