/* ==========================================================================
   depo zeta — ventas · DZ-MOD-01
   --------------------------------------------------------------------------
   Cabecera y renglones. Los renglones generan asientos; la cabecera guarda
   la plata. El precio se congela en el renglón: si mañana se remarca, la
   venta de ayer no cambia (invariante 6) — por eso esta capa nunca recalcula
   un precio, sólo usa el que ya viene en el renglón.
   ========================================================================== */

import { calcularStock } from './libro.js';

const error = (codigo, mensaje) => Object.assign(new Error(mensaje), { codigo });

export const MEDIOS_PAGO = ['efectivo', 'transferencia', 'qr'];

/* invariante 5: una venta sin medio_pago es inválida */
export function validarVenta({ cliente, renglones, medioPago }) {
  if (!cliente) throw error('DATOS_INCOMPLETOS', 'falta el cliente de la venta');
  if (!renglones || !renglones.length) throw error('DATOS_INCOMPLETOS', 'la venta no tiene renglones');
  for (const r of renglones) {
    if (!r.producto || !(r.cantidad > 0) || !(r.precio >= 0)) {
      throw error('DATOS_INCOMPLETOS', 'cada renglón necesita producto, cantidad y precio');
    }
  }
  if (!MEDIOS_PAGO.includes(medioPago)) {
    throw error('MEDIO_PAGO_REQUERIDO', 'una venta sin medio de pago es inválida');
  }
}

export function totalDeRenglones(renglones) {
  return renglones.reduce((t, r) => t + r.cantidad * r.precio, 0);
}

/* invariante 4: el stock de camioneta:X nunca es negativo — no se puede
   vender lo que no se cargó. Se simula la aplicación en orden de los
   asientos nuevos para permitir varios renglones del mismo producto en la
   misma venta sin pisarse. */
export function validarStockParaAsientos(asientosExistentes, asientosNuevos) {
  const acumulado = asientosExistentes.slice();
  for (const a of asientosNuevos) {
    if (a.origen && a.origen.startsWith('camioneta:')) {
      const disponible = calcularStock(acumulado, a.producto, a.origen);
      if (disponible < a.cantidad) {
        throw error(
          'STOCK_INSUFICIENTE',
          `sólo hay ${disponible} de «${a.producto}» en la camioneta — no se puede vender lo que no se cargó (invariante 4)`
        );
      }
    }
    acumulado.push(a);
  }
}

/* Arma la cabecera de venta a partir de renglones ya con precio congelado.
   No persiste nada — eso es del repositorio D1, en server/api/. */
export function armarVenta({ id, cliente, repartidor, renglones, medioPago, punto, remito, ahora = () => new Date() }) {
  validarVenta({ cliente, renglones, medioPago });
  return {
    id,
    fecha: ahora().toISOString(),
    cliente,
    repartidor: repartidor || null,
    renglones,
    total: totalDeRenglones(renglones),
    medioPago,
    remito: remito || id,
    punto: punto || null,
  };
}

/* Los asientos que le corresponden a una venta ya armada — un `venta` por
   renglón, camioneta → cliente. Se validan contra el histórico con
   validarStockParaAsientos() antes de persistirlos. */
export function asientosDeVenta(venta, origenCamioneta, { motivo } = {}) {
  return venta.renglones.map((r) => ({
    tipo: 'venta',
    origen: origenCamioneta,
    destino: 'cliente',
    producto: r.producto,
    cantidad: r.cantidad,
    ref: venta.id,
    motivo: motivo || null,
  }));
}
