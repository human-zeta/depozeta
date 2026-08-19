import { describe, test, igual, lanza } from './harness.js';
import { validarZona, armarZona } from '../zonas.js';

describe('zonas · validarZona', () => {
  test('falta nombre o coordenadas se rechaza', async () => {
    await lanza(() => validarZona({ nombre: '', lat: -34.7, lng: -58.3 }));
    await lanza(() => validarZona({ nombre: 'Esquina', lat: NaN, lng: -58.3 }));
  });
  test('coordenadas fuera de rango se rechazan', async () => {
    await lanza(() => validarZona({ nombre: 'Esquina', lat: 200, lng: -58.3 }));
    await lanza(() => validarZona({ nombre: 'Esquina', lat: -34.7, lng: 500 }));
  });
});

describe('zonas · armarZona', () => {
  test('el radio nunca baja del mínimo (30 m)', () => {
    igual(armarZona({ id: 'Z1', nombre: 'Esquina', lat: -34.7, lng: -58.3, radio: 5 }).radio, 30);
  });
  test('sin hastaHora, la zona es siempre', () => {
    igual(armarZona({ id: 'Z1', nombre: 'Esquina', lat: -34.7, lng: -58.3 }).hastaHora, null);
  });
});
