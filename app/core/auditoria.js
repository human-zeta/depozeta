/* ==========================================================================
   Auditoría — registro de actividad, append-only · DZ-SEG-01
   --------------------------------------------------------------------------
   Quién hizo qué, desde dónde y cuándo — para poder responder "¿quién creó
   este usuario?" o "¿desde dónde se intentó entrar?" sin adivinar.

   Append-only: no hay `actualizar` ni `borrar` acá, a propósito. Una
   corrección es un evento nuevo, no una edición del viejo.

   Simplificación deliberada frente a Caja Zeta: ese registro encadena cada
   entrada con el hash de la anterior (RF-601, por la Resolución UIF
   200/2024 — diez años de respaldo verificable). depo zeta no tiene esa
   obligación regulatoria, así que acá el encadenamiento no está. Si el
   producto alguna vez lo necesita, se suma sin romper esta forma.
   ========================================================================== */

export const ACCIONES_AUDITORIA = {
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGIN_BLOCKED: 'LOGIN_BLOCKED',
  CLAVE_ESTABLECIDA: 'CLAVE_ESTABLECIDA',
  TOTP_ENROLADO: 'TOTP_ENROLADO',
  TOTP_REINICIADO: 'TOTP_REINICIADO',
  USUARIO_CREADO: 'USUARIO_CREADO',
  USUARIO_DESACTIVADO: 'USUARIO_DESACTIVADO',
  PERMISO_DENEGADO: 'PERMISO_DENEGADO',
};

/**
 * @param {object} args
 * @param {() => string} [args.idNuevo]   Generador de id. Inyectable para
 *   pruebas deterministas.
 * @param {() => Date} [args.ahora]
 */
export function crearAuditoria({ idNuevo = idAleatorio, ahora = () => new Date() } = {}) {
  const entradas = [];

  async function registrar({ accion, sujeto = null, ip = null, detalle = null }) {
    if (!ACCIONES_AUDITORIA[accion] && !Object.values(ACCIONES_AUDITORIA).includes(accion)) {
      throw new Error(`acción de auditoría desconocida: ${accion}`);
    }
    const entrada = {
      id: idNuevo(),
      fecha: ahora().toISOString(),
      accion,
      sujeto: sujeto ? { id: sujeto.id ?? null, usuario: sujeto.usuario ?? null, rol: sujeto.rol ?? null } : null,
      ip,
      detalle,
    };
    entradas.push(entrada);
    return entrada;
  }

  async function listar({ desde = null, accion = null, usuario = null } = {}) {
    return entradas.filter((e) =>
      (!desde || e.fecha >= desde) &&
      (!accion || e.accion === accion) &&
      (!usuario || e.sujeto?.usuario === usuario)
    );
  }

  return { registrar, listar };
}

function idAleatorio() {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
}
