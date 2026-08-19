/* ==========================================================================
   Autorización: el pedido literal, hecho prueba
   --------------------------------------------------------------------------
   "Depósito puede crear usuarios de reparto" — y nada más. Estos tests
   verifican exactamente esa frase y su contraparte: nadie crea a un par ni
   a un superior.
   ========================================================================== */

import { describe, test, assert, igual } from './harness.js';
import {
  ROLES, ACCIONES, crearSujeto, puede, exigir, puedeCrearUsuario, puedeGestionarUsuario,
} from '../autorizacion.js';

const admin = crearSujeto({ id: 'u1', usuario: 'juan', rol: ROLES.ADMIN });
const deposito = crearSujeto({ id: 'u2', usuario: 'dep', rol: ROLES.DEPOSITO });
const repartidor = crearSujeto({ id: 'u3', usuario: 'marcos', rol: ROLES.REPARTIDOR });

describe('autorizacion · permisos por rol', () => {
  test('repartidor puede vender, no ver costos', () => {
    assert(puede(repartidor, ACCIONES.VENDER).ok);
    assert(!puede(repartidor, ACCIONES.VER_COSTOS).ok);
  });

  test('deposito ve costos, no puede vender (no está en la calle)', () => {
    assert(puede(deposito, ACCIONES.VER_COSTOS).ok);
    assert(!puede(deposito, ACCIONES.VENDER).ok);
  });

  test('admin puede todo lo que existe como acción', () => {
    for (const a of Object.values(ACCIONES)) assert(puede(admin, a).ok, a);
  });

  test('una acción inexistente se rechaza para cualquiera', () => {
    igual(puede(admin, 'VOLAR').ok, false);
  });

  test('un rol desconocido se rechaza', () => {
    igual(puede({ rol: 'GERENTE' }, ACCIONES.VENDER).ok, false);
  });

  test('exigir() lanza cuando no autoriza', async () => {
    let lanzo = false;
    try { exigir(repartidor, ACCIONES.VER_COSTOS); } catch (e) { lanzo = true; igual(e.codigo, 'NO_AUTORIZADO'); }
    assert(lanzo);
  });
});

describe('autorizacion · el pedido exacto: depósito crea reparto', () => {
  test('DEPOSITO puede crear REPARTIDOR', () => {
    assert(puedeCrearUsuario(deposito, ROLES.REPARTIDOR).ok);
  });

  test('DEPOSITO NO puede crear otro DEPOSITO — sería un par', () => {
    igual(puedeCrearUsuario(deposito, ROLES.DEPOSITO).ok, false);
  });

  test('DEPOSITO NO puede crear ADMIN — sería un superior', () => {
    igual(puedeCrearUsuario(deposito, ROLES.ADMIN).ok, false);
  });

  test('REPARTIDOR no puede crear a nadie: ni siquiera tiene el permiso base', () => {
    igual(puedeCrearUsuario(repartidor, ROLES.REPARTIDOR).ok, false);
  });

  test('ADMIN puede crear DEPOSITO y REPARTIDOR', () => {
    assert(puedeCrearUsuario(admin, ROLES.DEPOSITO).ok);
    assert(puedeCrearUsuario(admin, ROLES.REPARTIDOR).ok);
  });

  test('ADMIN NO puede crear otro ADMIN — sería un par', () => {
    igual(puedeCrearUsuario(admin, ROLES.ADMIN).ok, false);
  });

  test('un rol nuevo desconocido se rechaza con motivo propio', () => {
    const r = puedeCrearUsuario(admin, 'GERENTE');
    igual(r.ok, false);
    assert(r.motivo.includes('desconocido'));
  });
});

describe('autorizacion · gestionar usuarios (desactivar, reiniciar TOTP)', () => {
  test('DEPOSITO puede desactivar a un REPARTIDOR', () => {
    assert(puedeGestionarUsuario(deposito, ACCIONES.DESACTIVAR_USUARIO, repartidor).ok);
  });

  test('DEPOSITO no puede desactivar a otro DEPOSITO', () => {
    igual(puedeGestionarUsuario(deposito, ACCIONES.DESACTIVAR_USUARIO, deposito).ok, false);
  });

  test('REPARTIDOR no puede desactivar a nadie (sin el permiso base)', () => {
    igual(puedeGestionarUsuario(repartidor, ACCIONES.DESACTIVAR_USUARIO, repartidor).ok, false);
  });

  test('ADMIN puede desactivar a DEPOSITO y REPARTIDOR, no a otro ADMIN', () => {
    assert(puedeGestionarUsuario(admin, ACCIONES.DESACTIVAR_USUARIO, deposito).ok);
    assert(puedeGestionarUsuario(admin, ACCIONES.DESACTIVAR_USUARIO, repartidor).ok);
    igual(puedeGestionarUsuario(admin, ACCIONES.DESACTIVAR_USUARIO, admin).ok, false);
  });
});

describe('autorizacion · alcance por empresa (hoy una sola, el modelo ya la lleva)', () => {
  test('un recurso de otra empresa se rechaza aunque el rol alcance', () => {
    const r = puede(admin, ACCIONES.VER_HOY, { empresaId: 'otra-empresa' });
    igual(r.ok, false);
  });

  test('un recurso de la propia empresa pasa', () => {
    assert(puede(admin, ACCIONES.VER_HOY, { empresaId: 'default' }).ok);
  });
});
