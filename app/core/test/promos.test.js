import { describe, test, assert, igual } from './harness.js';
import { rotacionSemanal, parejaEstrella, promosDelDia, redondear, textoWa } from '../promos.js';

const AHORA = () => new Date('2026-08-21T12:00:00Z');
const hace = (dias) => new Date(AHORA().getTime() - dias * 86400000).toISOString();

const venta = (dias, renglones) => ({ fecha: hace(dias), renglones });

describe('promos · rotacionSemanal', () => {
  test('suma las ventas de la ventana y las lleva a escala semanal', () => {
    const ventas = [
      venta(3, [{ producto: 'COLA', cantidad: 12 }]),
      venta(10, [{ producto: 'COLA', cantidad: 16 }]),
      venta(40, [{ producto: 'COLA', cantidad: 99 }]),   /* fuera de la ventana de 28 días */
    ];
    igual(rotacionSemanal(ventas, 'COLA', { ahora: AHORA }), 28 * 7 / 28);
  });
  test('sin ventas, cero — no se inventa demanda', () => {
    igual(rotacionSemanal([], 'COLA', { ahora: AHORA }), 0);
  });
});

describe('promos · parejaEstrella', () => {
  test('encuentra la pareja que más veces salió junta', () => {
    const ventas = [
      venta(1, [{ producto: 'COLA', cantidad: 6 }, { producto: 'GALL', cantidad: 6 }]),
      venta(2, [{ producto: 'COLA', cantidad: 6 }, { producto: 'GALL', cantidad: 6 }]),
      venta(3, [{ producto: 'COLA', cantidad: 6 }, { producto: 'AGUA', cantidad: 6 }]),
    ];
    const par = parejaEstrella(ventas);
    igual([par.a, par.b].sort().join('|'), 'COLA|GALL');
    igual(par.veces, 2);
  });
  test('sin ventas con dos productos, no hay pareja', () => {
    igual(parejaEstrella([venta(1, [{ producto: 'COLA', cantidad: 6 }])]), null);
  });
});

describe('promos · promosDelDia', () => {
  const productos = [
    { id: 'COLA', nombre: 'Cola', costo: 1180, precios: { mayorista: 1560 }, vence: false },
    { id: 'GALL', nombre: 'Galletitas', costo: 780, precios: { mayorista: 1020 }, vence: true },
    { id: 'AGUA', nombre: 'Agua', costo: 620, precios: { mayorista: 850 }, vence: false },
  ];
  const compras = [
    { producto: 'COLA', proveedor: 'PR2', precio: 1090, fecha: hace(2) },
    { producto: 'COLA', proveedor: 'PR1', precio: 1180, fecha: hace(6) },
  ];
  const ventas = [
    venta(1, [{ producto: 'COLA', cantidad: 12 }, { producto: 'GALL', cantidad: 6 }]),
    venta(2, [{ producto: 'COLA', cantidad: 12 }, { producto: 'GALL', cantidad: 6 }]),
  ];

  test('el precio épico de compra se vuelve precio de pelea con margen a la vista', () => {
    const proms = promosDelDia({ productos, compras, ventas, stockDe: () => 100, ahora: AHORA });
    const pelea = proms.find((p) => p.tipo === 'pelea');
    assert(pelea, 'esperaba una promo de pelea');
    assert(pelea.gancho.includes('Cola'));
    assert(!pelea.gancho.includes('1090'), 'el gancho no puede llevar el costo');
    assert(pelea.cuenta.includes('margen'));
  });
  test('arma el combo con la pareja real de las ventas', () => {
    const proms = promosDelDia({ productos, compras, ventas, stockDe: () => 100, ahora: AHORA });
    const combo = proms.find((p) => p.tipo === 'combo');
    assert(combo, 'esperaba un combo');
    assert(combo.gancho.includes('Cola') && combo.gancho.includes('Galletitas'));
  });
  test('sacamercadería sólo si vence y hay más de 5 semanas de stock', () => {
    const conStock = promosDelDia({ productos, compras, ventas, stockDe: (id) => id === 'GALL' ? 200 : 10, ahora: AHORA });
    assert(conStock.some((p) => p.tipo === 'saca'));
    const sinStock = promosDelDia({ productos, compras, ventas, stockDe: () => 5, ahora: AHORA });
    assert(!sinStock.some((p) => p.tipo === 'saca'));
  });
  test('sin datos no hay promos — no se inventa entusiasmo', () => {
    igual(promosDelDia({ productos, compras: [], ventas: [], stockDe: () => 0, ahora: AHORA })
      .filter((p) => p.tipo === 'pelea' || p.tipo === 'combo' || p.tipo === 'saca').length, 0);
  });
});

describe('promos · redondear y textoWa', () => {
  test('redondea a la decena: $1.234 no se sostiene en el mostrador', () => {
    igual(redondear(1234), 1230); igual(redondear(1235), 1240);
  });
  test('el texto de WhatsApp lleva el gancho y deja claro que lo mandás vos', () => {
    const t = textoWa('Cola a $ 1.480');
    assert(t.includes('Cola a $ 1.480'));
    assert(t.includes('Contestá'));
  });
});
