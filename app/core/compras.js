/* ==========================================================================
   depo zeta — compras y proveedores · DZ-MOD-01
   --------------------------------------------------------------------------
   La otra mitad del negocio: a quién le comprás y a cuánto. Cada compra
   anotada —incluso con cero unidades, como precio pasado— suma a un
   historial por proveedor y producto. El cruce compara sólo los últimos
   35 días: con inflación, un precio de hace dos meses no es un precio,
   es un recuerdo.

   Puro: no sabe de HTTP ni de base de datos, corre igual en Node que en
   el navegador — igual que app/core/libro.js.
   ========================================================================== */

const error = (codigo, mensaje) => Object.assign(new Error(mensaje), { codigo });

/* La ventana del cuadro. Un precio más viejo no compite: engaña. */
export const VENTANA_PRECIO = 35;

export function validarProveedor({ nombre }) {
  if (!nombre || !String(nombre).trim()) throw error('DATOS_INCOMPLETOS', 'al proveedor le falta el nombre');
}

export function armarProveedor({ id, nombre, contacto, tel, zona, rubros, entrega, condicion, notas }) {
  validarProveedor({ nombre });
  return {
    id,
    nombre: String(nombre).trim(),
    contacto: (contacto || '').trim(),
    tel: (tel || '').trim(),
    zona: (zona || '').trim(),
    rubros: rubros || [],
    entrega: (entrega || '').trim(),
    condicion: (condicion || '').trim(),
    notas: (notas || '').trim(),
    activo: true,
  };
}

/* cantidad 0 es válida a propósito: queda como precio pasado, sin mover
   stock — así el cuadro aprende aunque no compres. */
export function validarCompra({ proveedor, producto, precio, cantidad }) {
  if (!proveedor) throw error('DATOS_INCOMPLETOS', 'falta el proveedor de la compra');
  if (!producto) throw error('DATOS_INCOMPLETOS', 'falta el producto de la compra');
  if (!(Number(precio) > 0)) throw error('PRECIO_INVALIDO', 'la compra necesita el precio por unidad, mayor a cero');
  if (Number(cantidad) < 0 || !Number.isFinite(Number(cantidad))) {
    throw error('CANTIDAD_INVALIDA', 'la cantidad de una compra no puede ser negativa (cero vale: es precio pasado)');
  }
}

export function armarCompra({ id, proveedor, producto, precio, cantidad, autor, ahora = () => new Date() }) {
  validarCompra({ proveedor, producto, precio, cantidad });
  return {
    id,
    proveedor,
    producto,
    precio: Number(precio),
    cantidad: Number(cantidad) || 0,
    autor: autor || null,
    fecha: ahora().toISOString(),
  };
}

/* El asiento que le corresponde a una compra con unidades: proveedor →
   depósito, referenciando la compra. Con cero unidades no hay asiento. */
export function asientoDeCompra(compra) {
  if (!(compra.cantidad > 0)) return null;
  return {
    tipo: 'compra',
    origen: 'proveedor',
    destino: 'deposito',
    producto: compra.producto,
    cantidad: compra.cantidad,
    ref: compra.id,
    motivo: null,
  };
}

export const haceDias = (fechaIso, ahora = () => new Date()) =>
  Math.round((ahora().getTime() - new Date(fechaIso).getTime()) / 86400000);

/**
 * El cruce de un producto: la última oferta de cada proveedor dentro de la
 * ventana, ordenadas de más barata a más cara.
 *
 * «Épico» cuando el mejor le saca 8% o más al segundo, o quedó abajo del
 * costo de reposición que tenés anotado (con 3% de colchón, para que un
 * redondeo no ande gritando épico).
 *
 * `vieja`: hay precios anotados pero todos fuera de la ventana — hay que
 * pedir precio de nuevo, no usar el recuerdo.
 */
export function cuadroDe(compras, productoId, { costoReferencia, ahora = () => new Date() } = {}) {
  const delProducto = compras.filter((x) => x.producto === productoId);
  const recientes = delProducto.filter((x) => haceDias(x.fecha, ahora) <= VENTANA_PRECIO);
  const porProveedor = {};
  for (const x of recientes) {
    const previa = porProveedor[x.proveedor];
    if (!previa || haceDias(x.fecha, ahora) < haceDias(previa.fecha, ahora)) porProveedor[x.proveedor] = x;
  }
  const ofertas = Object.values(porProveedor).sort((a, b) => a.precio - b.precio);
  const mejor = ofertas[0] || null;
  const segundo = ofertas[1] || null;
  const epico = Boolean(mejor) && (
    (Boolean(segundo) && mejor.precio <= segundo.precio * 0.92) ||
    (Number(costoReferencia) > 0 && mejor.precio < costoReferencia * 0.97)
  );
  return { ofertas, mejor, segundo, epico, vieja: !mejor && delProducto.length > 0 };
}

/**
 * Lo que se deja sobre la mesa por semana si se sigue pagando el costo
 * anotado en vez del mejor precio del cuadro. `rotacionDe(productoId)`
 * devuelve unidades por semana — viene de las ventas reales (promos.js).
 */
export function ahorroSemanal(productos, compras, rotacionDe, { ahora = () => new Date() } = {}) {
  return productos.reduce((total, p) => {
    const q = cuadroDe(compras, p.id, { costoReferencia: p.costo, ahora });
    if (!q.mejor) return total;
    return total + Math.max(0, p.costo - q.mejor.precio) * rotacionDe(p.id);
  }, 0);
}
