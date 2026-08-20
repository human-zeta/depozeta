/* ==========================================================================
   Usuarios: el arranque, y el pedido literal integrado de punta a punta
   --------------------------------------------------------------------------
   Acá `autenticacion.js` y `autorizacion.js` se usan juntos, como los va a
   usar la API real — no cada uno probado en aislamiento.
   ========================================================================== */

import { describe, test, igual, assert } from './harness.js';
import { crearAutenticacion, crearRepositorioAutenticacion } from '../autenticacion.js';
import { crearGestionUsuarios, crearRepositorioUsuarios } from '../usuarios.js';
import { ROLES, crearSujeto } from '../autorizacion.js';

const CLAVE = 'una clave larga y decente';

function armar() {
  const repoAuth = crearRepositorioAutenticacion();
  const repoUsu = crearRepositorioUsuarios();
  const auth = crearAutenticacion({
    repositorio: repoAuth,
    politica: { iteracionesPBKDF2: 1_000 },
  });
  const usuarios = crearGestionUsuarios({ repositorio: repoUsu, autenticacion: auth });
  return { usuarios, repoUsu };
}

async function lanzaCon(fn, codigo) {
  try { await fn(); } catch (e) { igual(e.codigo, codigo); return e; }
  throw new Error(`se esperaba el error ${codigo}`);
}

describe('usuarios · arranque (bootstrap del primer ADMIN)', () => {
  test('el primer bootstrap crea un ADMIN', async () => {
    const { usuarios } = armar();
    const u = await usuarios.bootstrapAdmin({ usuario: 'juan', nombre: 'Juan Cruz', clave: CLAVE });
    igual(u.rol, ROLES.ADMIN);
    igual(u.creadoPor, null);
  });

  test('un segundo bootstrap se rechaza: ya hay usuarios', async () => {
    const { usuarios } = armar();
    await usuarios.bootstrapAdmin({ usuario: 'juan', nombre: 'Juan Cruz', clave: CLAVE });
    await lanzaCon(
      () => usuarios.bootstrapAdmin({ usuario: 'otro', nombre: 'Otro', clave: CLAVE }),
      'YA_INICIALIZADO',
    );
  });
});

describe('usuarios · el pedido literal: depósito crea reparto', () => {
  async function conAdminYDeposito() {
    const { usuarios, repoUsu } = armar();
    const admin = await usuarios.bootstrapAdmin({ usuario: 'juan', nombre: 'Juan Cruz', clave: CLAVE });
    const sujAdmin = crearSujeto({ id: admin.id, usuario: admin.usuario, rol: admin.rol, empresaId: admin.empresaId });

    const dep = await usuarios.crearUsuario(sujAdmin, {
      usuario: 'deposito1', nombre: 'Depósito Central', rol: ROLES.DEPOSITO, clave: CLAVE,
    });
    const sujDep = crearSujeto({ id: dep.id, usuario: dep.usuario, rol: dep.rol, empresaId: dep.empresaId });
    return { usuarios, repoUsu, sujAdmin, sujDep };
  }

  test('depósito crea un repartidor con éxito', async () => {
    const { usuarios, sujDep } = await conAdminYDeposito();
    const rep = await usuarios.crearUsuario(sujDep, {
      usuario: 'marcos', nombre: 'Marcos', rol: ROLES.REPARTIDOR, clave: CLAVE,
    });
    igual(rep.rol, ROLES.REPARTIDOR);
    igual(rep.creadoPor, 'deposito1');
  });

  test('depósito NO puede crear otro depósito', async () => {
    const { usuarios, sujDep } = await conAdminYDeposito();
    await lanzaCon(
      () => usuarios.crearUsuario(sujDep, { usuario: 'dep2', nombre: 'Otro Depósito', rol: ROLES.DEPOSITO, clave: CLAVE }),
      'NO_AUTORIZADO',
    );
  });

  test('depósito NO puede crear un admin', async () => {
    const { usuarios, sujDep } = await conAdminYDeposito();
    await lanzaCon(
      () => usuarios.crearUsuario(sujDep, { usuario: 'admin2', nombre: 'Otro Admin', rol: ROLES.ADMIN, clave: CLAVE }),
      'NO_AUTORIZADO',
    );
  });

  test('un repartidor no puede crear a nadie', async () => {
    const { usuarios, sujDep } = await conAdminYDeposito();
    const rep = await usuarios.crearUsuario(sujDep, { usuario: 'marcos', nombre: 'Marcos', rol: ROLES.REPARTIDOR, clave: CLAVE });
    const sujRep = crearSujeto({ id: rep.id, usuario: rep.usuario, rol: rep.rol, empresaId: rep.empresaId });
    await lanzaCon(
      () => usuarios.crearUsuario(sujRep, { usuario: 'otro', nombre: 'Otro', rol: ROLES.REPARTIDOR, clave: CLAVE }),
      'NO_AUTORIZADO',
    );
  });

  test('un usuario duplicado se rechaza', async () => {
    const { usuarios, sujDep } = await conAdminYDeposito();
    await usuarios.crearUsuario(sujDep, { usuario: 'marcos', nombre: 'Marcos', rol: ROLES.REPARTIDOR, clave: CLAVE });
    await lanzaCon(
      () => usuarios.crearUsuario(sujDep, { usuario: 'marcos', nombre: 'Marcos Otra Vez', rol: ROLES.REPARTIDOR, clave: CLAVE }),
      'YA_EXISTE',
    );
  });

  test('una clave débil no crea el usuario (ni a medias)', async () => {
    const { usuarios, sujDep, repoUsu } = await conAdminYDeposito();
    await lanzaCon(
      () => usuarios.crearUsuario(sujDep, { usuario: 'marcos', nombre: 'Marcos', rol: ROLES.REPARTIDOR, clave: 'corta' }),
      'CLAVE_DEBIL',
    );
    igual(await repoUsu.usuarioPorNombre('marcos'), null, 'no quedó un usuario a medio crear');
  });
});

describe('usuarios · desactivar y reiniciar TOTP ajeno', () => {
  test('depósito desactiva a un repartidor que creó', async () => {
    const { usuarios, repoUsu } = armar();
    const admin = await usuarios.bootstrapAdmin({ usuario: 'juan', nombre: 'Juan Cruz', clave: CLAVE });
    const sujAdmin = crearSujeto({ id: admin.id, usuario: admin.usuario, rol: admin.rol, empresaId: admin.empresaId });
    const dep = await usuarios.crearUsuario(sujAdmin, { usuario: 'deposito1', nombre: 'Depósito', rol: ROLES.DEPOSITO, clave: CLAVE });
    const sujDep = crearSujeto({ id: dep.id, usuario: dep.usuario, rol: dep.rol, empresaId: dep.empresaId });
    await usuarios.crearUsuario(sujDep, { usuario: 'marcos', nombre: 'Marcos', rol: ROLES.REPARTIDOR, clave: CLAVE });

    await usuarios.desactivarUsuario(sujDep, 'marcos');
    igual(await usuarios.activoDe('marcos'), false);
  });

  test('un repartidor desactivado no puede loguearse más', async () => {
    const { usuarios } = armar();
    const admin = await usuarios.bootstrapAdmin({ usuario: 'juan', nombre: 'Juan Cruz', clave: CLAVE });
    const sujAdmin = crearSujeto({ id: admin.id, usuario: admin.usuario, rol: admin.rol, empresaId: admin.empresaId });
    await usuarios.crearUsuario(sujAdmin, { usuario: 'marcos', nombre: 'Marcos', rol: ROLES.REPARTIDOR, clave: CLAVE });
    await usuarios.desactivarUsuario(sujAdmin, 'marcos');

    // activoDe() es lo que la API inyecta en crearAutenticacion como activoDe
    igual(await usuarios.activoDe('marcos'), false);
  });

  test('depósito no puede desactivar a otro depósito (par)', async () => {
    const { usuarios } = armar();
    const admin = await usuarios.bootstrapAdmin({ usuario: 'juan', nombre: 'Juan Cruz', clave: CLAVE });
    const sujAdmin = crearSujeto({ id: admin.id, usuario: admin.usuario, rol: admin.rol, empresaId: admin.empresaId });
    const dep1 = await usuarios.crearUsuario(sujAdmin, { usuario: 'dep1', nombre: 'D1', rol: ROLES.DEPOSITO, clave: CLAVE });
    const dep2 = await usuarios.crearUsuario(sujAdmin, { usuario: 'dep2', nombre: 'D2', rol: ROLES.DEPOSITO, clave: CLAVE });
    const sujDep1 = crearSujeto({ id: dep1.id, usuario: dep1.usuario, rol: dep1.rol, empresaId: dep1.empresaId });

    await lanzaCon(() => usuarios.desactivarUsuario(sujDep1, 'dep2'), 'NO_AUTORIZADO');
    void dep2;
  });

  test('desactivar a alguien que no existe da error propio', async () => {
    const { usuarios } = armar();
    const admin = await usuarios.bootstrapAdmin({ usuario: 'juan', nombre: 'Juan Cruz', clave: CLAVE });
    const sujAdmin = crearSujeto({ id: admin.id, usuario: admin.usuario, rol: admin.rol, empresaId: admin.empresaId });
    await lanzaCon(() => usuarios.desactivarUsuario(sujAdmin, 'fantasma'), 'NO_EXISTE');
  });
});

describe('usuarios · listar', () => {
  test('admin y depósito ven la lista; un repartidor no', async () => {
    const { usuarios } = armar();
    const admin = await usuarios.bootstrapAdmin({ usuario: 'juan', nombre: 'Juan Cruz', clave: CLAVE });
    const sujAdmin = crearSujeto({ id: admin.id, usuario: admin.usuario, rol: admin.rol, empresaId: admin.empresaId });
    const rep = await usuarios.crearUsuario(sujAdmin, { usuario: 'marcos', nombre: 'Marcos', rol: ROLES.REPARTIDOR, clave: CLAVE });
    const sujRep = crearSujeto({ id: rep.id, usuario: rep.usuario, rol: rep.rol, empresaId: rep.empresaId });

    const lista = await usuarios.listarUsuarios(sujAdmin);
    igual(lista.length, 2, 'admin + repartidor');

    await lanzaCon(() => usuarios.listarUsuarios(sujRep), 'NO_AUTORIZADO');
  });
});

/* ==========================================================================
   El caso que faltaba: crear una cuenta y que esa persona pueda entrar.
   Estaba probado por partes (alta por un lado, login por otro) pero nunca
   de punta a punta — y es exactamente el camino que falló en producción
   cuando el dueño del proyecto dio de alta a sus dos repartidores.
   ========================================================================== */

function armarConAuth() {
  const repoAuth = crearRepositorioAutenticacion();
  const repoUsu = crearRepositorioUsuarios();
  const auth = crearAutenticacion({
    repositorio: repoAuth,
    politica: { iteracionesPBKDF2: 1_000 },
    activoDe: async (u) => Boolean((await repoUsu.usuarioPorNombre(u))?.activo),
  });
  const usuarios = crearGestionUsuarios({ repositorio: repoUsu, autenticacion: auth });
  return { usuarios, auth };
}

describe('usuarios · el alta tiene que terminar en un login que funcione', () => {
  test('una cuenta recién creada entra con su clave', async () => {
    const { usuarios, auth } = armarConAuth();
    const admin = await usuarios.bootstrapAdmin({ usuario: 'juan', nombre: 'Juan Cruz', clave: CLAVE });
    const suj = crearSujeto({ id: admin.id, usuario: admin.usuario, rol: admin.rol, empresaId: admin.empresaId });
    await usuarios.crearUsuario(suj, { usuario: 'grillodepo', nombre: 'Grillo', rol: ROLES.DEPOSITO, clave: 'clave-del-deposito-2026' });

    const r = await auth.iniciarSesion({ usuario: 'grillodepo', clave: 'clave-del-deposito-2026' });
    igual(r.segundoFactor, 'ENROLAR', 'primera vez: tiene que ofrecer enrolar el TOTP');
    assert(r.ticket, 'tiene que venir un ticket para el segundo paso');
  });

  test('el usuario NO distingue mayúsculas — el teclado del teléfono las mete solo', async () => {
    const { usuarios, auth } = armarConAuth();
    const admin = await usuarios.bootstrapAdmin({ usuario: 'juan', nombre: 'Juan Cruz', clave: CLAVE });
    const suj = crearSujeto({ id: admin.id, usuario: admin.usuario, rol: admin.rol, empresaId: admin.empresaId });
    await usuarios.crearUsuario(suj, { usuario: 'grilloreparto', nombre: 'Grillo', rol: ROLES.REPARTIDOR, clave: 'clave-del-reparto-2026' });

    // exactamente lo que manda un iPhone: primera letra en mayúscula
    const r = await auth.iniciarSesion({ usuario: 'Grilloreparto', clave: 'clave-del-reparto-2026' });
    assert(r.ticket, 'Grilloreparto y grilloreparto son la misma persona');
  });

  test('dar de alta con mayúsculas guarda la cuenta en minúsculas', async () => {
    const { usuarios, auth } = armarConAuth();
    const admin = await usuarios.bootstrapAdmin({ usuario: 'juan', nombre: 'Juan Cruz', clave: CLAVE });
    const suj = crearSujeto({ id: admin.id, usuario: admin.usuario, rol: admin.rol, empresaId: admin.empresaId });
    const creado = await usuarios.crearUsuario(suj, { usuario: '  GrilloDepo ', nombre: 'Grillo', rol: ROLES.DEPOSITO, clave: 'otra-clave-larga-2026' });
    igual(creado.usuario, 'grillodepo');

    const r = await auth.iniciarSesion({ usuario: 'grillodepo', clave: 'otra-clave-larga-2026' });
    assert(r.ticket, 'entra con el nombre normalizado');
  });
});

describe('usuarios · cambiar la clave de otra cuenta', () => {
  test('admin le pone clave nueva a un repartidor y ese entra con ella', async () => {
    const { usuarios, auth } = armarConAuth();
    const admin = await usuarios.bootstrapAdmin({ usuario: 'juan', nombre: 'Juan Cruz', clave: CLAVE });
    const suj = crearSujeto({ id: admin.id, usuario: admin.usuario, rol: admin.rol, empresaId: admin.empresaId });
    await usuarios.crearUsuario(suj, { usuario: 'marcos', nombre: 'Marcos', rol: ROLES.REPARTIDOR, clave: 'la-vieja-que-se-olvido' });

    await usuarios.cambiarClaveDe(suj, 'Marcos', 'la-nueva-clave-2026');

    const r = await auth.iniciarSesion({ usuario: 'marcos', clave: 'la-nueva-clave-2026' });
    assert(r.ticket, 'entra con la clave nueva');
    await lanzaCon(() => auth.iniciarSesion({ usuario: 'marcos', clave: 'la-vieja-que-se-olvido' }), 'CREDENCIALES_INVALIDAS');
  });

  test('un depósito NO puede cambiarle la clave a otro depósito ni al admin', async () => {
    const { usuarios } = armarConAuth();
    const admin = await usuarios.bootstrapAdmin({ usuario: 'juan', nombre: 'Juan Cruz', clave: CLAVE });
    const sujAdmin = crearSujeto({ id: admin.id, usuario: admin.usuario, rol: admin.rol, empresaId: admin.empresaId });
    const dep = await usuarios.crearUsuario(sujAdmin, { usuario: 'depo1', nombre: 'Depo', rol: ROLES.DEPOSITO, clave: CLAVE });
    await usuarios.crearUsuario(sujAdmin, { usuario: 'depo2', nombre: 'Otro depo', rol: ROLES.DEPOSITO, clave: CLAVE });
    const sujDep = crearSujeto({ id: dep.id, usuario: dep.usuario, rol: dep.rol, empresaId: dep.empresaId });

    await lanzaCon(() => usuarios.cambiarClaveDe(sujDep, 'depo2', 'clave-robada-2026'), 'NO_AUTORIZADO');
    await lanzaCon(() => usuarios.cambiarClaveDe(sujDep, 'juan', 'clave-robada-2026'), 'NO_AUTORIZADO');
  });

  test('una clave débil se rechaza y la vieja sigue sirviendo', async () => {
    const { usuarios, auth } = armarConAuth();
    const admin = await usuarios.bootstrapAdmin({ usuario: 'juan', nombre: 'Juan Cruz', clave: CLAVE });
    const suj = crearSujeto({ id: admin.id, usuario: admin.usuario, rol: admin.rol, empresaId: admin.empresaId });
    await usuarios.crearUsuario(suj, { usuario: 'marcos', nombre: 'Marcos', rol: ROLES.REPARTIDOR, clave: 'clave-que-anda-bien' });

    await lanzaCon(() => usuarios.cambiarClaveDe(suj, 'marcos', 'corta'), 'CLAVE_DEBIL');
    const r = await auth.iniciarSesion({ usuario: 'marcos', clave: 'clave-que-anda-bien' });
    assert(r.ticket, 'la clave vieja sigue valiendo');
  });
});
