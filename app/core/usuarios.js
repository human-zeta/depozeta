/* ==========================================================================
   Usuarios — el flujo real de alta y baja de cuentas · DZ-SEG-01
   --------------------------------------------------------------------------
   Mismo orden que Caja Zeta en cada mutación: autorizar → ejecutar →
   auditar, incluso cuando falla — un intento denegado se audita, porque el
   registro de lo que alguien quiso hacer y no pudo suele valer más que el
   de lo que sí.

   El arranque (`bootstrapAdmin`) es el único camino que no pasa por
   `puedeCrearUsuario`: no hay todavía ningún ADMIN que autorice al primero.
   Sólo funciona si el repositorio no tiene un solo usuario — el borde de la
   API además le exige un token de arranque (ver `server/api/worker.mjs`),
   para que no alcance con adivinar la URL antes de que el dueño real
   arranque su cuenta.
   ========================================================================== */

import { ROLES, ACCIONES, puedeCrearUsuario, puedeGestionarUsuario } from './autorizacion.js';
import { normalizarUsuario } from './autenticacion.js';
import { ACCIONES_AUDITORIA } from './auditoria.js';

/* ------------------------------ Repositorio -------------------------------- */

export function crearRepositorioUsuarios() {
  const usuarios = new Map();   // usuario (nombre) → registro
  let seq = 0;

  return {
    async hayUsuarios() { return usuarios.size > 0; },
    async usuarioPorNombre(usuario) { return usuarios.get(usuario) ?? null; },
    async guardarUsuario(u) { usuarios.set(u.usuario, { ...u }); return u; },
    async listarUsuarios(empresaId) {
      return [...usuarios.values()].filter((u) => u.empresaId === empresaId);
    },
    async siguienteId() { return `u${++seq}`; },
  };
}

/* --------------------------------- Motor ------------------------------------ */

const error = (codigo, mensaje) => Object.assign(new Error(mensaje), { codigo });

/**
 * @param {object} args
 * @param {object} args.repositorio    De este módulo.
 * @param {object} args.autenticacion  El motor de `autenticacion.js` — acá
 *   se apoya para fijar la clave inicial de cada cuenta nueva.
 * @param {object} [args.auditoria]
 * @param {() => Date} [args.ahora]
 */
export function crearGestionUsuarios({ repositorio, autenticacion, auditoria = null, ahora = () => new Date() }) {
  const auditar = (accion, actor, detalle = null) =>
    auditoria?.registrar({
      accion,
      sujeto: actor ? { id: actor.id ?? null, usuario: actor.usuario, rol: actor.rol } : null,
      detalle,
    }) ?? Promise.resolve();

  const denegar = async (actor, accion, motivo, detalle = null) => {
    await auditar(ACCIONES_AUDITORIA.PERMISO_DENEGADO, actor, { accion, motivo, ...detalle });
    throw error('NO_AUTORIZADO', motivo);
  };

  /** El primer ADMIN. Ver la nota del encabezado sobre el token de arranque
      —eso lo exige la API, no esto—. */
  async function bootstrapAdmin({ usuario: crudo, nombre, clave, empresaId = 'default' }) {
    const usuario = normalizarUsuario(crudo);
    if (await repositorio.hayUsuarios()) {
      throw error('YA_INICIALIZADO', 'ya existe al menos un usuario — el arranque ya se usó');
    }
    if (!usuario || !nombre) throw error('DATOS_INCOMPLETOS', 'falta usuario o nombre');

    await autenticacion.establecerClave({ usuario, clave });

    const registro = {
      id: await repositorio.siguienteId(), usuario, nombre, rol: ROLES.ADMIN, empresaId,
      activo: true, creadoEn: ahora(), creadoPor: null,
    };
    await repositorio.guardarUsuario(registro);
    await auditar(ACCIONES_AUDITORIA.USUARIO_CREADO, null, { usuario, rol: ROLES.ADMIN, detalle: { bootstrap: true } });
    return registro;
  }

  /** Alta de un DEPOSITO o REPARTIDOR, por un ADMIN o un DEPOSITO. */
  async function crearUsuario(actor, { usuario: crudo, nombre, rol, clave }) {
    const p = puedeCrearUsuario(actor, rol);
    if (!p.ok) return denegar(actor, ACCIONES.CREAR_USUARIO, p.motivo, { rol });

    const usuario = normalizarUsuario(crudo);
    if (!usuario || !nombre) throw error('DATOS_INCOMPLETOS', 'falta usuario o nombre');
    if (await repositorio.usuarioPorNombre(usuario)) {
      throw error('YA_EXISTE', `el usuario ${usuario} ya existe`);
    }

    /* La clave se fija antes de guardar el perfil: si la política la
       rechaza, no queda un usuario a medio crear. */
    await autenticacion.establecerClave({ usuario, clave });

    const registro = {
      id: await repositorio.siguienteId(), usuario, nombre, rol, empresaId: actor.empresaId,
      activo: true, creadoEn: ahora(), creadoPor: actor.usuario,
    };
    await repositorio.guardarUsuario(registro);
    await auditar(ACCIONES_AUDITORIA.USUARIO_CREADO, actor, { usuario, rol });
    return registro;
  }

  async function desactivarUsuario(actor, usuarioCrudo) {
    const usuarioObjetivo = normalizarUsuario(usuarioCrudo);
    const objetivo = await repositorio.usuarioPorNombre(usuarioObjetivo);
    if (!objetivo) throw error('NO_EXISTE', 'ese usuario no existe');

    const p = puedeGestionarUsuario(actor, ACCIONES.DESACTIVAR_USUARIO, objetivo);
    if (!p.ok) return denegar(actor, ACCIONES.DESACTIVAR_USUARIO, p.motivo, { usuario: usuarioObjetivo });

    objetivo.activo = false;
    await repositorio.guardarUsuario(objetivo);
    await auditar(ACCIONES_AUDITORIA.USUARIO_DESACTIVADO, actor, { usuario: usuarioObjetivo });
    return objetivo;
  }

  /** Reinicia el TOTP de otra cuenta (perdió el teléfono). Misma regla
      anti-escalada que desactivar. */
  async function reiniciarTotpDe(actor, usuarioCrudo) {
    const usuarioObjetivo = normalizarUsuario(usuarioCrudo);
    const objetivo = await repositorio.usuarioPorNombre(usuarioObjetivo);
    if (!objetivo) throw error('NO_EXISTE', 'ese usuario no existe');

    const p = puedeGestionarUsuario(actor, ACCIONES.REINICIAR_TOTP_AJENO, objetivo);
    if (!p.ok) return denegar(actor, ACCIONES.REINICIAR_TOTP_AJENO, p.motivo, { usuario: usuarioObjetivo });

    await autenticacion.reiniciarTotp({ usuario: usuarioObjetivo });
    return { ok: true };
  }

  /** Le pone una clave nueva a otra cuenta — para cuando alguien se la
      olvida. Misma regla anti-escalada que desactivar: nadie le cambia la
      clave a un par ni a un superior, así un DEPOSITO no puede quedarse
      con la cuenta del ADMIN. Corta también las sesiones abiertas de esa
      cuenta (lo hace `establecerClave`), que es lo que corresponde: si la
      clave cambió, lo que estuviera abierto deja de valer. */
  async function cambiarClaveDe(actor, usuarioCrudo, claveNueva) {
    const usuarioObjetivo = normalizarUsuario(usuarioCrudo);
    const objetivo = await repositorio.usuarioPorNombre(usuarioObjetivo);
    if (!objetivo) throw error('NO_EXISTE', 'ese usuario no existe');

    const p = puedeGestionarUsuario(actor, ACCIONES.CAMBIAR_CLAVE_AJENA, objetivo);
    if (!p.ok) return denegar(actor, ACCIONES.CAMBIAR_CLAVE_AJENA, p.motivo, { usuario: usuarioObjetivo });

    await autenticacion.establecerClave({ usuario: usuarioObjetivo, clave: claveNueva });
    return { ok: true, usuario: usuarioObjetivo };
  }

  /** Para inyectar en `autenticacion.js` como `activoDe`. */
  async function activoDe(crudo) {
    const u = await repositorio.usuarioPorNombre(normalizarUsuario(crudo));
    return Boolean(u?.activo);
  }

  async function listarUsuarios(actor) {
    const p = puedeCrearUsuario(actor, ROLES.REPARTIDOR); // proxy: quien puede crear, puede listar
    if (!p.ok && actor.rol !== ROLES.ADMIN) return denegar(actor, ACCIONES.CREAR_USUARIO, 'no autorizado a listar usuarios');
    return repositorio.listarUsuarios(actor.empresaId);
  }

  return { bootstrapAdmin, crearUsuario, desactivarUsuario, reiniciarTotpDe, cambiarClaveDe, activoDe, listarUsuarios };
}
