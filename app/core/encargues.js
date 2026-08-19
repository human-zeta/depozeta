/* ==========================================================================
   depo zeta — encargues · DZ-MOD-01
   --------------------------------------------------------------------------
   Una intención, no un asiento. Se toma sin camioneta al lado, contra el
   catálogo o algo por conseguir. No genera un solo asiento hasta que se
   entrega — un encargue que nunca se resuelve no deja rastro en el libro,
   porque no llegó a pasar.
   ========================================================================== */

import { armarVenta } from './ventas.js';

const error = (codigo, mensaje) => Object.assign(new Error(mensaje), { codigo });

const TRANSICIONES = {
  pendiente: ['preparado', 'cancelado', 'entregado'],
  preparado: ['entregado', 'cancelado'],
  entregado: [],
  cancelado: [],
};

export function validarRenglonEncargue({ tipo, producto, descripcion, cantidad }) {
  if (!(cantidad > 0)) throw error('DATOS_INCOMPLETOS', 'cada renglón necesita cantidad mayor a cero');
  if (tipo === 'catalogo') {
    if (!producto) throw error('DATOS_INCOMPLETOS', 'el renglón de catálogo necesita un producto');
  } else if (tipo === 'especial') {
    if (!descripcion) throw error('DATOS_INCOMPLETOS', 'el renglón especial necesita una descripción');
  } else {
    throw error('TIPO_INVALIDO', `tipo de renglón inválido: ${tipo}`);
  }
}

export function armarEncargue({ id, cliente, autor, renglones, ahora = () => new Date() }) {
  if (!cliente) throw error('DATOS_INCOMPLETOS', 'falta el cliente del encargue');
  if (!renglones || !renglones.length) throw error('DATOS_INCOMPLETOS', 'el encargue no tiene renglones');
  renglones.forEach(validarRenglonEncargue);
  return {
    id,
    fecha: ahora().toISOString(),
    cliente,
    autor: autor || null,
    renglones,
    estado: 'pendiente',
    motivo: '',
    ventaId: null,
  };
}

export function renglonProductoId(r) {
  return r.tipo === 'catalogo' ? r.producto : r.productoVinculado;
}

/* Un renglón especial nace sin producto_vinculado. No se puede entregar
   así: primero tiene que existir como producto real y vincularse — sin
   eso no hay forma honesta de generar un asiento de venta. */
export function encargueListoParaEntregar(encargue) {
  return encargue.renglones.every((r) => renglonProductoId(r));
}

export function puedeCambiarEstado(encargue, siguiente) {
  return (TRANSICIONES[encargue.estado] || []).includes(siguiente);
}

export function exigirTransicion(encargue, siguiente) {
  if (!puedeCambiarEstado(encargue, siguiente)) {
    throw error('TRANSICION_INVALIDA', `un encargue «${encargue.estado}» no puede pasar a «${siguiente}»`);
  }
}

export function vincularProductoEspecial(encargue, indice, productoId) {
  const renglon = encargue.renglones[indice];
  if (!renglon) throw error('NO_EXISTE', 'ese renglón no existe en el encargue');
  if (renglon.tipo !== 'especial') throw error('TIPO_INVALIDO', 'sólo un renglón especial se vincula a un producto');
  if (!productoId) throw error('DATOS_INCOMPLETOS', 'falta el producto a vincular');
  return renglon.tipo === 'especial' ? { ...renglon, productoVinculado: productoId } : renglon;
}

/* Entregar: el encargue se convierte en una venta como cualquier otra. El
   precio sale de la lista del cliente EN ESTE MOMENTO —no el que tenía
   cuando se tomó el pedido, todavía no existía como venta. */
export function armarVentaDesdeEncargue({ encargue, ventaId, repartidor, clienteLista, productoPorId, medioPago, punto, ahora }) {
  exigirTransicion(encargue, 'entregado');
  if (!encargueListoParaEntregar(encargue)) {
    throw error('ENCARGUE_INCOMPLETO', 'hay renglones especiales sin vincular a un producto real');
  }
  const renglones = encargue.renglones.map((r) => {
    const productoId = renglonProductoId(r);
    const producto = productoPorId(productoId);
    if (!producto) throw error('NO_EXISTE', `no existe el producto ${productoId}`);
    return { producto: productoId, cantidad: r.cantidad, precio: (producto.precios || {})[clienteLista] || 0, lista: clienteLista };
  });
  return armarVenta({ id: ventaId, cliente: encargue.cliente, repartidor, renglones, medioPago, punto, remito: ventaId, ahora });
}
