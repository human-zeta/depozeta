/* ==========================================================================
   depo zeta — catálogo · DZ-MOD-01
   --------------------------------------------------------------------------
   Productos y precios. «El único registro compartido es el catálogo de
   productos y precios, y se escribe desde un solo lugar» — no tiene la
   complejidad de sincronización del libro de asientos, es un CRUD con una
   regla propia: el costo es de reposición, no histórico.
   ========================================================================== */

const error = (codigo, mensaje) => Object.assign(new Error(mensaje), { codigo });

const UNIDADES = ['unidad', 'bulto', 'kg'];

export function validarProducto({ id, nombre, unidad }) {
  if (!id || !nombre) throw error('DATOS_INCOMPLETOS', 'falta el código o el nombre del producto');
  if (unidad && !UNIDADES.includes(unidad)) throw error('DATOS_INCOMPLETOS', `unidad inválida: ${unidad}`);
}

export function armarProducto({ id, nombre, rubro, unidad, porBulto, costo, precios, vence, retornable, ahora = () => new Date() }) {
  validarProducto({ id, nombre, unidad });
  return {
    id,
    nombre,
    rubro: (rubro || 'Sin rubro').trim() || 'Sin rubro',
    unidad: unidad || 'unidad',
    porBulto: porBulto > 0 ? porBulto : 1,
    costo: costo >= 0 ? costo : 0,
    // el costo recién cargado es fresco por definición — de acá sale
    // «hace cuántos días» en la vista de precios (vProductos, index.html)
    costoActualizado: ahora().toISOString(),
    precios: precios || {},
    vence: Boolean(vence),
    retornable: Boolean(retornable),
    activo: true,
  };
}

export function margen(producto, lista = 'mayorista') {
  const v = (producto.precios || {})[lista];
  return v > 0 ? (v - producto.costo) / v * 100 : 0;
}

/* remarcación masiva: redondea a la decena más cercana, igual que F0 —
   un precio como $1.234 no se sostiene en el mostrador. */
export function precioRemarcado(precio, pct) {
  return Math.round((precio * (1 + pct / 100)) / 10) * 10;
}

export function remarcarProductos(productos, { pct, rubro }) {
  if (!Number.isFinite(pct)) throw error('DATOS_INCOMPLETOS', 'falta el porcentaje de remarcación');
  const afectados = productos.filter((p) => !rubro || p.rubro === rubro);
  return afectados.map((p) => ({
    ...p,
    precios: Object.fromEntries(Object.entries(p.precios).map(([lista, precio]) => [lista, precioRemarcado(precio, pct)])),
  }));
}
