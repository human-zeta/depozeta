import { describe, test, igual, lanza } from './harness.js';
import { validarProducto, armarProducto, margen, precioRemarcado, remarcarProductos } from '../catalogo.js';

describe('catalogo · validarProducto', () => {
  test('falta código o nombre se rechaza', async () => {
    await lanza(() => validarProducto({ id: '', nombre: 'Cola' }));
    await lanza(() => validarProducto({ id: 'COLA', nombre: '' }));
  });
  test('unidad inventada se rechaza', async () => {
    await lanza(() => validarProducto({ id: 'COLA', nombre: 'Cola', unidad: 'litro' }));
  });
});

describe('catalogo · armarProducto', () => {
  test('rubro vacío cae a «Sin rubro»', () => {
    igual(armarProducto({ id: 'P1', nombre: 'Producto' }).rubro, 'Sin rubro');
  });
  test('un producto nuevo nace activo', () => {
    igual(armarProducto({ id: 'P1', nombre: 'Producto' }).activo, true);
  });
});

describe('catalogo · margen', () => {
  test('margen sobre costo de reposición, no histórico', () => {
    const p = { costo: 100, precios: { mayorista: 150 } };
    igual(Math.round(margen(p) * 100) / 100, 33.33);
  });
  test('sin precio en esa lista, margen es cero', () => {
    igual(margen({ costo: 100, precios: {} }), 0);
  });
});

describe('catalogo · remarcación', () => {
  test('precioRemarcado redondea a la decena más cercana', () => {
    igual(precioRemarcado(1234, 10), 1360);
  });

  test('remarcarProductos sólo toca el rubro pedido', () => {
    const productos = [
      { id: 'P1', rubro: 'Bebidas', precios: { mayorista: 1000 } },
      { id: 'P2', rubro: 'Almacén', precios: { mayorista: 1000 } },
    ];
    const resultado = remarcarProductos(productos, { pct: 10, rubro: 'Bebidas' });
    igual(resultado.length, 1);
    igual(resultado[0].id, 'P1');
    igual(resultado[0].precios.mayorista, 1100);
  });

  test('sin rubro, remarca todo el catálogo', () => {
    const productos = [{ id: 'P1', rubro: 'Bebidas', precios: { mayorista: 1000 } }, { id: 'P2', rubro: 'Almacén', precios: { mayorista: 1000 } }];
    igual(remarcarProductos(productos, { pct: 10, rubro: '' }).length, 2);
  });

  test('porcentaje faltante se rechaza', async () => {
    await lanza(() => remarcarProductos([], { pct: undefined, rubro: '' }));
  });
});
