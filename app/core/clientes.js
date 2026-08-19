/* ==========================================================================
   depo zeta — clientes · DZ-MOD-01
   --------------------------------------------------------------------------
   La cartera. Un campo hace de idea propia: `punto` se aprende en la
   entrega real, no se geocodifica — y una vez que es real, nada lo pisa.
   ========================================================================== */

const error = (codigo, mensaje) => Object.assign(new Error(mensaje), { codigo });

export function validarCliente({ nombre, dir }) {
  if (!nombre || !dir) throw error('DATOS_INCOMPLETOS', 'falta el nombre o el domicilio del cliente');
}

export function siguienteIdCliente(idsExistentes) {
  const max = idsExistentes.reduce((m, id) => Math.max(m, parseInt(String(id).slice(1), 10) || 0), 0);
  return 'C' + String(max + 1).padStart(2, '0');
}

export function armarCliente({ id, nombre, contacto, tel, dir, ref, zona, orden, lista, dias, punto, notas, recibe }) {
  validarCliente({ nombre, dir });
  return {
    id,
    nombre,
    contacto: contacto || '',
    tel: tel || '',
    dir,
    ref: ref || '',
    zona: (zona || 'Sin zona').trim() || 'Sin zona',
    orden: orden || 1,
    lista: lista || 'mayorista',
    dias: dias || [],
    punto: punto || null,
    ultima: null,
    notas: notas || '',
    recibe: recibe || null,
    activo: true,
  };
}

/* Un pin aproximado (geocodificado al alta) se deja pisar por el real —lo
   que se aprende entregando siempre es más preciso—, pero un pin real ya
   capturado nunca se pierde detrás de uno aproximado. */
export function puedeActualizarPunto(clienteExistente) {
  return !(clienteExistente && clienteExistente.punto && !clienteExistente.punto.aproximado);
}
