import { describe, test, igual, lanza } from './harness.js';
import { validarCliente, siguienteIdCliente, armarCliente, puedeActualizarPunto } from '../clientes.js';

describe('clientes · validarCliente', () => {
  test('falta nombre o domicilio se rechaza', async () => {
    await lanza(() => validarCliente({ nombre: '', dir: 'Zapiola 1240' }));
    await lanza(() => validarCliente({ nombre: 'Kiosco', dir: '' }));
  });
});

describe('clientes · siguienteIdCliente', () => {
  test('primer cliente es C01', () => {
    igual(siguienteIdCliente([]), 'C01');
  });
  test('sigue el máximo existente, no la cantidad', () => {
    igual(siguienteIdCliente(['C01', 'C05', 'C03']), 'C06');
  });
});

describe('clientes · armarCliente', () => {
  test('un cliente nuevo nace activo, sin última visita', () => {
    const c = armarCliente({ id: 'C01', nombre: 'Kiosco', dir: 'Zapiola 1240' });
    igual(c.activo, true);
    igual(c.ultima, null);
  });
  test('zona vacía cae a «Sin zona»', () => {
    igual(armarCliente({ id: 'C01', nombre: 'Kiosco', dir: 'Zapiola 1240', zona: '' }).zona, 'Sin zona');
  });
});

describe('clientes · puedeActualizarPunto — el pin real nunca se pierde', () => {
  test('cliente sin punto todavía: se puede capturar', () => {
    igual(puedeActualizarPunto({ punto: null }), true);
  });
  test('punto aproximado (geocodificado): se puede reemplazar por el real', () => {
    igual(puedeActualizarPunto({ punto: { lat: 1, lng: 1, aproximado: true } }), true);
  });
  test('punto real ya capturado en una entrega: no se pisa', () => {
    igual(puedeActualizarPunto({ punto: { lat: 1, lng: 1, aproximado: false } }), false);
  });
});
