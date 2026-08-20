/* ==========================================================================
   Autorización — roles y permisos · DZ-SEG-01
   --------------------------------------------------------------------------
   Mismo patrón que Caja Zeta (`cajazeta/app/core/autorizacion.js`), adaptado
   al dominio del reparto. Tres roles, jerárquicos:

     ADMIN (30)       — el dueño de la operación. Crea cualquier rol, ve todo.
     DEPOSITO (20)    — administra catálogo, carga, precios. Crea REPARTIDOR.
     REPARTIDOR (10)  — vende en la calle, encarga, cobra.

   Dos chequeos independientes, y hacen falta los dos:

     1. ¿El ROL permite la acción?     → tabla de permisos
     2. ¿La EMPRESA es la del sujeto?  → alcance (hoy una sola; el modelo ya
        soporta más de una, aunque el producto todavía no las vende)

   Todo es **denegar por defecto**. Un rol desconocido, una acción desconocida
   o una empresa sin dueño claro devuelven `false`. En permisos, el silencio
   nunca puede significar que sí.
   ========================================================================== */

export const ROLES = {
  ADMIN: 'ADMIN',
  DEPOSITO: 'DEPOSITO',
  REPARTIDOR: 'REPARTIDOR',
};

/* Nivel jerárquico. Sólo se usa para impedir que alguien cree o modifique a
   un par o a un superior — la defensa contra la escalada de privilegios. */
const NIVEL = {
  [ROLES.ADMIN]: 30,
  [ROLES.DEPOSITO]: 20,
  [ROLES.REPARTIDOR]: 10,
};

export const ACCIONES = {
  // Compartido — los tres roles operan la jornada
  VER_HOY: 'VER_HOY',
  VER_CLIENTES: 'VER_CLIENTES',
  AGREGAR_CLIENTE: 'AGREGAR_CLIENTE',
  VER_CIERRE_PROPIO: 'VER_CIERRE_PROPIO',

  // Reparto — el mismo repartidor que toma un encargue de a pie es quien lo
  // trae en su camioneta y lo entrega en la calle.
  VENDER: 'VENDER',
  REGISTRAR_NO_VENTA: 'REGISTRAR_NO_VENTA',
  TOMAR_ENCARGUE: 'TOMAR_ENCARGUE',
  ENTREGAR_ENCARGUE: 'ENTREGAR_ENCARGUE',

  // Depósito
  CONFIRMAR_CARGA: 'CONFIRMAR_CARGA',
  VER_COSTOS: 'VER_COSTOS',
  GESTIONAR_PRODUCTOS: 'GESTIONAR_PRODUCTOS',
  REMARCAR: 'REMARCAR',
  GESTIONAR_ZONAS: 'GESTIONAR_ZONAS',
  PREPARAR_ENCARGUE: 'PREPARAR_ENCARGUE',
  VINCULAR_ENCARGUE_ESPECIAL: 'VINCULAR_ENCARGUE_ESPECIAL',
  VER_CIERRE_CONSOLIDADO: 'VER_CIERRE_CONSOLIDADO',

  // Administración
  CREAR_USUARIO: 'CREAR_USUARIO',
  DESACTIVAR_USUARIO: 'DESACTIVAR_USUARIO',
  REINICIAR_TOTP_AJENO: 'REINICIAR_TOTP_AJENO',
  CAMBIAR_CLAVE_AJENA: 'CAMBIAR_CLAVE_AJENA',
  VER_AUDITORIA: 'VER_AUDITORIA',
};

const A = ACCIONES;

const COMPARTIDAS = [A.VER_HOY, A.VER_CLIENTES, A.AGREGAR_CLIENTE, A.VER_CIERRE_PROPIO];

const PERMISOS = {
  [ROLES.ADMIN]: new Set(Object.values(A)),

  [ROLES.DEPOSITO]: new Set([
    ...COMPARTIDAS,
    A.CONFIRMAR_CARGA, A.VER_COSTOS, A.GESTIONAR_PRODUCTOS, A.REMARCAR,
    A.GESTIONAR_ZONAS, A.PREPARAR_ENCARGUE, A.VINCULAR_ENCARGUE_ESPECIAL,
    A.VER_CIERRE_CONSOLIDADO,
    // Los tres, acotados a REPARTIDOR por puedeCrearUsuario()/
    // puedeGestionarUsuario() — depósito arma y mantiene su propia planta
    // de repartidores de punta a punta, sin pasar por ADMIN para cada baja.
    A.CREAR_USUARIO, A.DESACTIVAR_USUARIO, A.REINICIAR_TOTP_AJENO, A.CAMBIAR_CLAVE_AJENA,
    // No ve auditoría: eso queda para ADMIN.
  ]),

  [ROLES.REPARTIDOR]: new Set([
    ...COMPARTIDAS,
    A.VENDER, A.REGISTRAR_NO_VENTA, A.TOMAR_ENCARGUE, A.ENTREGAR_ENCARGUE,
    // No ve costos ni margen (VER_COSTOS): vende con la lista del cliente,
    // no con lo que salió reponer — es la separación que pidió el dueño del
    // proyecto, ahora aplicada por el servidor, no sólo por la interfaz.
  ]),
};

/* ------------------------------- Sujeto ----------------------------------- */

/**
 * @param {object} args
 * @param {string} args.id
 * @param {string} args.usuario
 * @param {string} args.rol        Uno de ROLES.
 * @param {string} [args.empresaId] Hoy siempre la misma; el modelo ya la
 *   lleva para cuando el producto venda a más de una operación.
 */
export function crearSujeto({ id, usuario, rol, empresaId = 'default' }) {
  if (!NIVEL[rol]) throw new Error(`Rol desconocido: ${rol}`);
  return { id, usuario, rol, empresaId, nivel: NIVEL[rol] };
}

/* ---------------------------- Autorización -------------------------------- */

/**
 * ¿Puede el sujeto ejecutar la acción? Si el recurso pertenece a una
 * empresa, tiene que ser la misma que la del sujeto — hoy es siempre así
 * porque sólo existe una, pero el chequeo ya está.
 *
 * @returns {{ok: boolean, motivo?: string}}
 */
export function puede(sujeto, accion, recurso = {}) {
  if (!sujeto || !NIVEL[sujeto.rol]) return { ok: false, motivo: 'sujeto inválido' };
  if (!Object.values(ACCIONES).includes(accion)) {
    return { ok: false, motivo: `acción desconocida: ${accion}` };
  }

  const permitidas = PERMISOS[sujeto.rol];
  if (!permitidas?.has(accion)) {
    return { ok: false, motivo: `el rol ${sujeto.rol} no puede ${accion}` };
  }

  if (recurso.empresaId && recurso.empresaId !== sujeto.empresaId) {
    return { ok: false, motivo: 'recurso fuera de la empresa del sujeto' };
  }

  return { ok: true };
}

/** Igual que `puede`, pero lanza. Para usar en el borde de cada endpoint. */
export function exigir(sujeto, accion, recurso = {}) {
  const r = puede(sujeto, accion, recurso);
  if (!r.ok) {
    const e = new Error(`No autorizado: ${r.motivo}`);
    e.codigo = 'NO_AUTORIZADO';
    e.accion = accion;
    throw e;
  }
  return true;
}

/* ------------------- Defensa contra escalada de privilegios ---------------- */

/**
 * ¿Puede `actor` crear un usuario con el rol `rolNuevo`?
 *
 * Regla central, la misma que en Caja Zeta: **nadie crea a un par ni a un
 * superior.** Es lo que hace literal el pedido del dueño del proyecto —
 * "depósito puede crear usuarios de reparto"— y lo que impide que un
 * DEPOSITO se fabrique un ADMIN o a otro DEPOSITO.
 */
export function puedeCrearUsuario(actor, rolNuevo) {
  const base = puede(actor, ACCIONES.CREAR_USUARIO);
  if (!base.ok) return base;

  if (!NIVEL[rolNuevo]) return { ok: false, motivo: `rol desconocido: ${rolNuevo}` };

  if (NIVEL[rolNuevo] >= actor.nivel) {
    return {
      ok: false,
      motivo: `un ${actor.rol} no puede crear un ${rolNuevo}: sería un par o un superior`,
    };
  }

  return { ok: true };
}

/**
 * ¿Puede `actor` desactivar (o reiniciar el TOTP de) `objetivo`? Misma regla
 * anti-escalada: nadie desactiva a un par ni a un superior — si no, un
 * DEPOSITO podría desactivar a otro DEPOSITO o al ADMIN.
 */
export function puedeGestionarUsuario(actor, accion, objetivo) {
  const base = puede(actor, accion);
  if (!base.ok) return base;

  if (!objetivo || !NIVEL[objetivo.rol]) return { ok: false, motivo: 'usuario objetivo inválido' };

  if (NIVEL[objetivo.rol] >= actor.nivel) {
    return { ok: false, motivo: `un ${actor.rol} no puede gestionar a un ${objetivo.rol}: sería un par o un superior` };
  }

  return { ok: true };
}
