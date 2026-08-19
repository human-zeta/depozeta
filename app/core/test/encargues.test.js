import { describe, test, igual, lanza } from './harness.js';
import {
  armarEncargue, renglonProductoId, encargueListoParaEntregar,
  puedeCambiarEstado, vincularProductoEspecial, armarVentaDesdeEncargue,
} from '../encargues.js';

const CATALOGO = { producto: 'P1', cantidad: 2 };
const ESPECIAL = { tipo: 'especial', descripcion: 'algo raro', cantidad: 1, productoVinculado: null };

describe('encargues · armarEncargue', () => {
  test('sin cliente o sin renglones se rechaza', async () => {
    await lanza(() => armarEncargue({ id: 'ENC1', cliente: '', renglones: [{ tipo: 'catalogo', ...CATALOGO }] }));
    await lanza(() => armarEncargue({ id: 'ENC1', cliente: 'C1', renglones: [] }));
  });

  test('un encargue nuevo nace pendiente', () => {
    const enc = armarEncargue({ id: 'ENC1', cliente: 'C1', renglones: [{ tipo: 'catalogo', ...CATALOGO }] });
    igual(enc.estado, 'pendiente');
    igual(enc.ventaId, null);
  });

  test('renglón catálogo sin producto se rechaza', async () => {
    await lanza(() => armarEncargue({ id: 'ENC1', cliente: 'C1', renglones: [{ tipo: 'catalogo', cantidad: 1 }] }));
  });

  test('renglón especial sin descripción se rechaza', async () => {
    await lanza(() => armarEncargue({ id: 'ENC1', cliente: 'C1', renglones: [{ tipo: 'especial', cantidad: 1 }] }));
  });
});

describe('encargues · listo para entregar', () => {
  test('renglonProductoId: catálogo usa producto, especial usa el vinculado', () => {
    igual(renglonProductoId({ tipo: 'catalogo', producto: 'P1' }), 'P1');
    igual(renglonProductoId({ tipo: 'especial', productoVinculado: 'P9' }), 'P9');
  });

  test('todo catálogo: listo de entrada', () => {
    const enc = armarEncargue({ id: 'ENC1', cliente: 'C1', renglones: [{ tipo: 'catalogo', ...CATALOGO }] });
    igual(encargueListoParaEntregar(enc), true);
  });

  test('especial sin vincular: no está listo — el punto central del modelo', () => {
    const enc = armarEncargue({ id: 'ENC1', cliente: 'C1', renglones: [ESPECIAL] });
    igual(encargueListoParaEntregar(enc), false);
  });

  test('especial ya vinculado: listo', () => {
    const enc = armarEncargue({ id: 'ENC1', cliente: 'C1', renglones: [ESPECIAL] });
    const vinculado = vincularProductoEspecial(enc, 0, 'P9');
    enc.renglones[0] = vinculado;
    igual(encargueListoParaEntregar(enc), true);
  });
});

describe('encargues · vincularProductoEspecial', () => {
  test('no se puede vincular un renglón de catálogo', async () => {
    const enc = armarEncargue({ id: 'ENC1', cliente: 'C1', renglones: [{ tipo: 'catalogo', ...CATALOGO }] });
    await lanza(() => vincularProductoEspecial(enc, 0, 'P9'));
  });
  test('un renglón que no existe se rechaza', async () => {
    const enc = armarEncargue({ id: 'ENC1', cliente: 'C1', renglones: [ESPECIAL] });
    await lanza(() => vincularProductoEspecial(enc, 5, 'P9'));
  });
});

describe('encargues · transiciones de estado', () => {
  test('pendiente puede pasar a preparado, cancelado o directo a entregado', () => {
    igual(puedeCambiarEstado({ estado: 'pendiente' }, 'preparado'), true);
    igual(puedeCambiarEstado({ estado: 'pendiente' }, 'cancelado'), true);
    igual(puedeCambiarEstado({ estado: 'pendiente' }, 'entregado'), true);
  });
  test('entregado y cancelado son finales', () => {
    igual(puedeCambiarEstado({ estado: 'entregado' }, 'pendiente'), false);
    igual(puedeCambiarEstado({ estado: 'cancelado' }, 'preparado'), false);
  });
});

describe('encargues · armarVentaDesdeEncargue', () => {
  const productoPorId = (id) => ({ P1: { id: 'P1', precios: { mayorista: 100, minorista: 120 } } }[id]);

  test('un especial sin vincular bloquea la entrega', async () => {
    const enc = armarEncargue({ id: 'ENC1', cliente: 'C1', renglones: [ESPECIAL] });
    await lanza(() => armarVentaDesdeEncargue({ encargue: enc, ventaId: 'V1', clienteLista: 'mayorista', productoPorId, medioPago: 'efectivo' }));
  });

  test('un encargue ya entregado no se puede volver a entregar', async () => {
    const enc = armarEncargue({ id: 'ENC1', cliente: 'C1', renglones: [{ tipo: 'catalogo', ...CATALOGO }] });
    enc.estado = 'entregado';
    await lanza(() => armarVentaDesdeEncargue({ encargue: enc, ventaId: 'V1', clienteLista: 'mayorista', productoPorId, medioPago: 'efectivo' }));
  });

  test('el precio sale de la lista del cliente AHORA, no de cuando se tomó el pedido', () => {
    const enc = armarEncargue({ id: 'ENC1', cliente: 'C1', renglones: [{ tipo: 'catalogo', producto: 'P1', cantidad: 2 }] });
    const venta = armarVentaDesdeEncargue({ encargue: enc, ventaId: 'V1', clienteLista: 'minorista', productoPorId, medioPago: 'efectivo' });
    igual(venta.renglones[0].precio, 120);
    igual(venta.total, 240);
  });

  test('exige medio de pago igual que cualquier venta — invariante 5', async () => {
    const enc = armarEncargue({ id: 'ENC1', cliente: 'C1', renglones: [{ tipo: 'catalogo', producto: 'P1', cantidad: 1 }] });
    await lanza(() => armarVentaDesdeEncargue({ encargue: enc, ventaId: 'V1', clienteLista: 'mayorista', productoPorId, medioPago: '' }));
  });
});
