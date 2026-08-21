/* ==========================================================================
   depo zeta — promos · DZ-MOD-01
   --------------------------------------------------------------------------
   Las promos se arman con los datos, no con entusiasmo: el precio épico de
   compra, la pareja que más sale junta en las ventas reales, el margen que
   aguanta descuento y el stock que vence. Cada una trae la cuenta a la
   vista y el margen que queda.

   El gancho y el texto de WhatsApp no llevan costos: son lo único que
   puede ver el repartidor (VER_COSTOS, autorizacion.js). Nada se manda
   solo — la app arma la cuenta y el texto; apretar enviar es del humano.

   Puro: recibe datos planos, corre igual en Node que en el navegador.
   ========================================================================== */

import { cuadroDe } from './compras.js';

/* precio de mostrador: $1.234 no se sostiene — a la decena, como catalogo.js */
export const redondear = (n) => Math.round(n / 10) * 10;

const margenDe = (p, lista = 'mayorista') => {
  const v = (p.precios || {})[lista];
  return v > 0 ? (v - p.costo) / v * 100 : 0;
};

/**
 * Unidades por semana de un producto, medidas sobre las ventas reales de
 * los últimos `dias` días y llevadas a escala semanal. Sin ventas, cero:
 * no se inventa demanda (es la regla 4 de «lo que depo zeta no hace»).
 */
export function rotacionSemanal(ventas, productoId, { dias = 28, ahora = () => new Date() } = {}) {
  const desde = ahora().getTime() - dias * 86400000;
  let unidades = 0;
  for (const v of ventas) {
    if (new Date(v.fecha).getTime() < desde) continue;
    for (const r of v.renglones || []) if (r.producto === productoId) unidades += r.cantidad;
  }
  return unidades * 7 / dias;
}

/** La pareja de productos que más veces salió junta en una misma venta. */
export function parejaEstrella(ventas) {
  const pares = {};
  for (const v of ventas) {
    const ids = [...new Set((v.renglones || []).map((r) => r.producto))];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const k = [ids[i], ids[j]].sort().join('|');
      pares[k] = (pares[k] || 0) + 1;
    }
  }
  const top = Object.entries(pares).sort((a, b) => b[1] - a[1])[0];
  if (!top) return null;
  const [a, b] = top[0].split('|');
  return { a, b, veces: top[1] };
}

export const textoWa = (gancho) =>
  '🛻 *' + gancho + '* — esta semana en el reparto, hasta que se acabe. ' +
  'Contestá este mensaje y te lo llevo con el pedido de siempre.';

/**
 * Las promos del día. Devuelve [{tipo, gancho, cuenta, margen}] — `gancho`
 * sin costos (apto repartidor), `cuenta` con la cuenta entera (sólo
 * depósito). `peso` y `nombreProveedor` se inyectan para no atar este
 * módulo al formato de la interfaz.
 */
export function promosDelDia({ productos, compras, ventas, stockDe, peso, nombreProveedor, ahora = () => new Date() }) {
  const proms = [];
  const $ = peso || ((n) => '$ ' + Math.round(n || 0));
  const nomProv = nombreProveedor || ((id) => id);

  /* 1 · el precio épico de compra se convierte en precio de pelea de venta */
  for (const p of productos) {
    if (proms.filter((x) => x.tipo === 'pelea').length >= 2) break;
    const q = cuadroDe(compras, p.id, { costoReferencia: p.costo, ahora });
    if (!q.epico || !q.mejor) continue;
    const lista = (p.precios || {}).mayorista;
    if (!(lista > 0)) continue;
    const nuevo = redondear(lista * 0.95);
    const m = (nuevo - q.mejor.precio) / nuevo * 100;
    if (m < 18) continue;
    proms.push({
      tipo: 'pelea',
      gancho: p.nombre + ' a ' + $(nuevo) + ' (antes ' + $(lista) + ')',
      cuenta: 'Comprándole a ' + nomProv(q.mejor.proveedor) + ' a ' + $(q.mejor.precio) +
        ', aun bajando la lista un 5% te queda ' + m.toFixed(0) + '% de margen. ' +
        'El precio bueno de compra se pelea en el mostrador, no se guarda.',
      margen: m,
    });
  }

  /* 2 · combo con la pareja que más sale junta en las ventas reales */
  const par = parejaEstrella(ventas);
  if (par) {
    const a = productos.find((p) => p.id === par.a), b = productos.find((p) => p.id === par.b);
    if (a && b && (a.precios || {}).mayorista > 0 && (b.precios || {}).mayorista > 0) {
      const tot = redondear((a.precios.mayorista + b.precios.mayorista) * 0.94);
      const m = (tot - (a.costo + b.costo)) / tot * 100;
      if (m >= 12) proms.push({
        tipo: 'combo',
        gancho: 'Combo: ' + a.nombre + ' + ' + b.nombre + ' a ' + $(tot),
        cuenta: 'Salieron juntos ' + par.veces + ' veces en las ventas. 6% menos que sueltos y el margen queda en ' + m.toFixed(0) + '%.',
        margen: m,
      });
    }
  }

  /* 3 · segunda unidad al 75% sobre el producto de mejor margen */
  const gordo = productos.filter((p) => margenDe(p) >= 25).sort((x, y) => margenDe(y) - margenDe(x))[0];
  if (gordo) {
    const v = gordo.precios.mayorista, tot = v + redondear(v * 0.75);
    const m = (tot - 2 * gordo.costo) / tot * 100;
    if (m >= 12) proms.push({
      tipo: 'segunda',
      gancho: gordo.nombre + ': la segunda al 25% menos',
      cuenta: 'Dos salen ' + $(tot) + '. El margen del par queda en ' + m.toFixed(0) + '% — aguanta el descuento porque ya era el de mejor margen.',
      margen: m,
    });
  }

  /* 4 · sacamercadería: vence y hay más stock que venta */
  const lentos = productos.filter((p) => {
    const r = rotacionSemanal(ventas, p.id, { ahora });
    return p.vence && r > 0 && stockDe(p.id) / r > 5;
  }).sort((x, y) => {
    const rx = rotacionSemanal(ventas, x.id, { ahora }), ry = rotacionSemanal(ventas, y.id, { ahora });
    return stockDe(y.id) / ry - stockDe(x.id) / rx;
  });
  const lento = lentos[0];
  if (lento && (lento.precios || {}).mayorista > 0) {
    const v = lento.precios.mayorista, tot = redondear(5 * v);
    const m = (tot - 6 * lento.costo) / tot * 100;
    const sem = (stockDe(lento.id) / rotacionSemanal(ventas, lento.id, { ahora })).toFixed(0);
    if (m >= 8) proms.push({
      tipo: 'saca',
      gancho: lento.nombre + ': llevá 6 y pagá 5',
      cuenta: 'Hay ' + sem + ' semanas de stock en el depósito y es mercadería que vence. Regalar una de seis deja ' + m.toFixed(0) + '% de margen — mejor que tirarla.',
      margen: m,
    });
  }

  return proms;
}
