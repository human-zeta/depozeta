/* ==========================================================================
   depo zeta — el libro de asientos · DZ-MOD-01
   --------------------------------------------------------------------------
   El stock no se guarda: se calcula. No hay un campo `cantidad` que se
   edita — hay un libro que no se borra, y el stock de cualquier ubicación
   en cualquier momento es la suma de los asientos que la tocaron.

   Puro: no sabe de HTTP ni de base de datos. Recibe y devuelve datos planos,
   corre igual en Node que en el navegador — igual que app/core/totp.js.
   ========================================================================== */

const error = (codigo, mensaje) => Object.assign(new Error(mensaje), { codigo });

export const TIPOS_ASIENTO = [
  'compra', 'carga', 'venta', 'devolucion_cliente', 'descarga', 'merma', 'ajuste',
];

/* invariante 3: ajuste y merma son la única forma de mover mercadería sin que
   un asiento de compra/venta/carga lo explique — por eso exigen motivo */
const REQUIEREN_MOTIVO = new Set(['merma', 'ajuste']);

/* Valida un asiento antes de crearlo. No lo persiste — eso es del repositorio. */
export function validarAsiento({ tipo, origen, destino, producto, cantidad, motivo }) {
  if (!TIPOS_ASIENTO.includes(tipo)) throw error('TIPO_INVALIDO', `tipo de asiento inválido: ${tipo}`);
  if (!origen || !destino) throw error('DATOS_INCOMPLETOS', 'falta origen o destino del asiento');
  if (!producto) throw error('DATOS_INCOMPLETOS', 'falta el producto del asiento');
  // invariante 2: la cantidad siempre es positiva, la dirección la da origen → destino
  if (!(Number(cantidad) > 0)) throw error('CANTIDAD_INVALIDA', 'la cantidad de un asiento tiene que ser mayor a cero');
  if (REQUIEREN_MOTIVO.has(tipo) && !motivo) throw error('MOTIVO_REQUERIDO', `un asiento de «${tipo}» necesita motivo`);
}

/** stock(producto, ubicación) = Σ asientos que la tocaron, hasta ahora. */
export function calcularStock(asientos, producto, ubicacion) {
  let s = 0;
  for (const a of asientos) {
    if (a.producto !== producto) continue;
    if (a.destino === ubicacion) s += a.cantidad;
    if (a.origen === ubicacion) s -= a.cantidad;
  }
  return s;
}

/* id único sin coordinación entre dispositivos — la sincronización apila por
   este id, nunca fusiona (DZ-MOD-01, «Sincronización»). */
export function idAsiento(dispositivo, contador) {
  return `${dispositivo}-${contador}`;
}

export function camionetaDe(repartidor) {
  return `camioneta:${repartidor}`;
}
