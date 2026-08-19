import { describe, test, igual, iguales, lanza } from './harness.js';
import { validarVenta, totalDeRenglones, validarStockParaAsientos, armarVenta, asientosDeVenta, MEDIOS_PAGO } from '../ventas.js';

const RENGLON = { producto: 'P1', cantidad: 3, precio: 100 };

describe('ventas · validarVenta', () => {
  test('una venta sin renglones se rechaza', async () => {
    await lanza(() => validarVenta({ cliente: 'C1', renglones: [], medioPago: 'efectivo' }));
  });

  test('sin medio de pago se rechaza — invariante 5', async () => {
    await lanza(() => validarVenta({ cliente: 'C1', renglones: [RENGLON], medioPago: '' }));
  });

  test('un medio de pago inventado se rechaza', async () => {
    await lanza(() => validarVenta({ cliente: 'C1', renglones: [RENGLON], medioPago: 'cheque' }));
  });

  test('los tres medios de pago documentados pasan', () => {
    for (const m of MEDIOS_PAGO) validarVenta({ cliente: 'C1', renglones: [RENGLON], medioPago: m });
  });

  test('un renglón sin producto o cantidad se rechaza', async () => {
    await lanza(() => validarVenta({ cliente: 'C1', renglones: [{ cantidad: 1, precio: 1 }], medioPago: 'efectivo' }));
    await lanza(() => validarVenta({ cliente: 'C1', renglones: [{ producto: 'P1', cantidad: 0, precio: 1 }], medioPago: 'efectivo' }));
  });
});

describe('ventas · totalDeRenglones', () => {
  test('suma cantidad × precio de cada renglón', () => {
    igual(totalDeRenglones([{ cantidad: 2, precio: 100 }, { cantidad: 3, precio: 50 }]), 350);
  });
});

describe('ventas · validarStockParaAsientos — invariante 4', () => {
  test('vender más de lo cargado en la camioneta se rechaza', async () => {
    const existentes = [{ producto: 'P1', origen: 'deposito', destino: 'camioneta:juan', cantidad: 5 }];
    const nuevos = [{ producto: 'P1', origen: 'camioneta:juan', destino: 'cliente', cantidad: 10 }];
    await lanza(() => validarStockParaAsientos(existentes, nuevos));
  });

  test('vender lo justo que hay en la camioneta pasa', () => {
    const existentes = [{ producto: 'P1', origen: 'deposito', destino: 'camioneta:juan', cantidad: 5 }];
    const nuevos = [{ producto: 'P1', origen: 'camioneta:juan', destino: 'cliente', cantidad: 5 }];
    validarStockParaAsientos(existentes, nuevos);
  });

  test('varios renglones del mismo producto en una venta se acumulan sin pisarse', async () => {
    const existentes = [{ producto: 'P1', origen: 'deposito', destino: 'camioneta:juan', cantidad: 5 }];
    const dosRenglones = [
      { producto: 'P1', origen: 'camioneta:juan', destino: 'cliente', cantidad: 3 },
      { producto: 'P1', origen: 'camioneta:juan', destino: 'cliente', cantidad: 3 },
    ];
    await lanza(() => validarStockParaAsientos(existentes, dosRenglones), 'debería rechazar 3+3 contra 5 disponibles');
  });

  test('un asiento que no sale de una camioneta no chequea stock — deposito puede quedar en cualquier valor', () => {
    validarStockParaAsientos([], [{ producto: 'P1', origen: 'deposito', destino: 'merma', cantidad: 999, motivo: 'x' }]);
  });
});

describe('ventas · armarVenta', () => {
  test('congela precio y recalcula el total, no confía en lo que mande el cliente', () => {
    const venta = armarVenta({
      id: 'V1', cliente: 'C1', repartidor: 'juan',
      renglones: [{ producto: 'P1', cantidad: 2, precio: 100 }, { producto: 'P2', cantidad: 1, precio: 50 }],
      medioPago: 'efectivo', ahora: () => new Date('2026-08-19T12:00:00Z'),
    });
    igual(venta.total, 250);
    igual(venta.remito, 'V1');
    igual(venta.fecha, '2026-08-19T12:00:00.000Z');
  });

  test('sin medio de pago, armarVenta también lanza — no sólo validarVenta', async () => {
    await lanza(() => armarVenta({ id: 'V1', cliente: 'C1', renglones: [RENGLON], medioPago: '' }));
  });
});

describe('ventas · asientosDeVenta', () => {
  test('un asiento «venta» por renglón, camioneta → cliente', () => {
    const venta = armarVenta({
      id: 'V1', cliente: 'C1', renglones: [{ producto: 'P1', cantidad: 2, precio: 100 }, { producto: 'P2', cantidad: 1, precio: 50 }],
      medioPago: 'efectivo',
    });
    const asientos = asientosDeVenta(venta, 'camioneta:juan');
    igual(asientos.length, 2);
    iguales(asientos[0], { tipo: 'venta', origen: 'camioneta:juan', destino: 'cliente', producto: 'P1', cantidad: 2, ref: 'V1', motivo: null });
  });
});
