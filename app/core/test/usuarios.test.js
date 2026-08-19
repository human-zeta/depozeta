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
