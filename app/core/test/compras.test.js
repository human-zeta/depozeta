import { describe, test, assert, igual, lanza } from './harness.js';
import {
  validarCompra, armarCompra, asientoDeCompra, cuadroDe, haceDias, ahorroSemanal,
  armarProveedor, VENTANA_PRECIO,
} from '../compras.js';

const AHORA = () => new Date('2026-08-21T12:00:00Z');
const hace = (dias) => new Date(AHORA().getTime() - dias * 86400000).toISOString();

describe('compras · validarCompra', () => {
  test('sin precio, o precio cero, se rechaza', async () => {
    await lanza(() => validarCompra({ proveedor: 'PR1', producto: 'COLA', precio: 0, cantidad: 6 }));
    await lanza(() => validarCompra({ proveedor: 'PR1', producto: 'COLA', cantidad: 6 }));
  });
  test('cantidad cero vale: es precio pasado, no compra', () => {
    validarCompra({ proveedor: 'PR1', producto: 'COLA', precio: 100, cantidad: 0 });
  });
  test('cantidad negativa se rechaza', async () => {
    await lanza(() => validarCompra({ proveedor: 'PR1', producto: 'COLA', precio: 100, cantidad: -1 }));
  });
});

describe('compras · asientoDeCompra', () => {
  test('con unidades genera asiento proveedor → depósito con ref a la compra', () => {
    const c = armarCompra({ id: 'CO-1', proveedor: 'PR1', producto: 'COLA', precio: 100, cantidad: 24, ahora: AHORA });
    const a = asientoDeCompra(c);
    igual(a.tipo, 'compra'); igual(a.origen, 'proveedor'); igual(a.destino, 'deposito');
    igual(a.cantidad, 24); igual(a.ref, 'CO-1');
  });
  test('con cero unidades no hay asiento — sólo queda el precio', () => {
    const c = armarCompra({ id: 'CO-2', proveedor: 'PR1', producto: 'COLA', precio: 100, cantidad: 0, ahora: AHORA });
    igual(asientoDeCompra(c), null);
  });
});

describe('compras · cuadroDe', () => {
  const compras = [
    { producto: 'COLA', proveedor: 'PR1', precio: 1190, fecha: hace(6) },
    { producto: 'COLA', proveedor: 'PR2', precio: 1090, fecha: hace(2) },   /* 1090 ≤ 1190·0.92 */
    { producto: 'COLA', proveedor: 'PR1', precio: 1120, fecha: hace(50) },   /* vieja: no compite */
    { producto: 'AGUA', proveedor: 'PR1', precio: 620, fecha: hace(6) },
    { producto: 'ACEITE', proveedor: 'PR2', precio: 1980, fecha: hace(41) }, /* sólo vieja */
  ];

  test('elige el más barato de la ventana y ordena las ofertas', () => {
    const q = cuadroDe(compras, 'COLA', { ahora: AHORA });
    igual(q.mejor.proveedor, 'PR2'); igual(q.mejor.precio, 1090);
    igual(q.segundo.proveedor, 'PR1');
  });
  test('un precio fuera de la ventana no compite — es un recuerdo', () => {
    const q = cuadroDe(compras, 'COLA', { ahora: AHORA });
    igual(q.ofertas.length, 2);
    assert(haceDias(compras[2].fecha, AHORA) > VENTANA_PRECIO);
  });
  test('épico por sacarle 8% al segundo', () => {
    assert(cuadroDe(compras, 'COLA', { ahora: AHORA }).epico);      /* 1090 <= 1180·0.92 */
    assert(!cuadroDe(compras, 'AGUA', { ahora: AHORA }).epico);     /* oferta única, sin costo ref */
  });
  test('épico por quedar abajo del costo de reposición anotado', () => {
    assert(cuadroDe(compras, 'AGUA', { costoReferencia: 700, ahora: AHORA }).epico);
    assert(!cuadroDe(compras, 'AGUA', { costoReferencia: 630, ahora: AHORA }).epico);  /* 3% de colchón */
  });
  test('todo viejo se marca `vieja`: pedir precio de nuevo, no usar el recuerdo', () => {
    const q = cuadroDe(compras, 'ACEITE', { ahora: AHORA });
    igual(q.mejor, null); assert(q.vieja);
  });
  test('de un mismo proveedor cuenta sólo su precio más reciente', () => {
    const dos = [
      { producto: 'COLA', proveedor: 'PR1', precio: 900, fecha: hace(20) },
      { producto: 'COLA', proveedor: 'PR1', precio: 1180, fecha: hace(1) },
    ];
    igual(cuadroDe(dos, 'COLA', { ahora: AHORA }).mejor.precio, 1180);
  });
});

describe('compras · ahorroSemanal', () => {
  test('diferencia × rotación, sólo cuando el cuadro mejora el costo', () => {
    const productos = [{ id: 'COLA', costo: 1180 }, { id: 'AGUA', costo: 600 }];
    const compras = [
      { producto: 'COLA', proveedor: 'PR2', precio: 1080, fecha: hace(2) },
      { producto: 'AGUA', proveedor: 'PR1', precio: 620, fecha: hace(2) },  /* más caro: no suma */
    ];
    igual(ahorroSemanal(productos, compras, () => 10, { ahora: AHORA }), 1000);
  });
});

describe('compras · armarProveedor', () => {
  test('sin nombre se rechaza', async () => {
    await lanza(() => armarProveedor({ nombre: '  ' }));
  });
  test('normaliza espacios y arranca activo', () => {
    const p = armarProveedor({ id: 'PR1', nombre: '  El Galpón ', tel: ' 11 6601-2210 ' });
    igual(p.nombre, 'El Galpón'); igual(p.tel, '11 6601-2210'); assert(p.activo);
  });
});
