import { describe, test, igual, lanza } from './harness.js';
import { validarAsiento, calcularStock, idAsiento, camionetaDe, TIPOS_ASIENTO } from '../libro.js';

describe('libro · validarAsiento', () => {
  test('un asiento de compra válido no lanza', () => {
    validarAsiento({ tipo: 'compra', origen: 'proveedor', destino: 'deposito', producto: 'P1', cantidad: 10 });
  });

  test('tipo inválido se rechaza', async () => {
    await lanza(() => validarAsiento({ tipo: 'invento', origen: 'a', destino: 'b', producto: 'P1', cantidad: 1 }));
  });

  test('cantidad cero o negativa se rechaza — invariante 2', async () => {
    await lanza(() => validarAsiento({ tipo: 'compra', origen: 'proveedor', destino: 'deposito', producto: 'P1', cantidad: 0 }));
    await lanza(() => validarAsiento({ tipo: 'compra', origen: 'proveedor', destino: 'deposito', producto: 'P1', cantidad: -5 }));
  });

  test('merma sin motivo se rechaza — invariante 3', async () => {
    await lanza(() => validarAsiento({ tipo: 'merma', origen: 'deposito', destino: 'merma', producto: 'P1', cantidad: 1 }));
  });

  test('ajuste sin motivo se rechaza — invariante 3', async () => {
    await lanza(() => validarAsiento({ tipo: 'ajuste', origen: 'deposito', destino: 'camioneta:juan', producto: 'P1', cantidad: 1 }));
  });

  test('merma con motivo pasa', () => {
    validarAsiento({ tipo: 'merma', origen: 'deposito', destino: 'merma', producto: 'P1', cantidad: 1, motivo: 'rotura' });
  });

  test('falta origen o destino se rechaza', async () => {
    await lanza(() => validarAsiento({ tipo: 'compra', destino: 'deposito', producto: 'P1', cantidad: 1 }));
    await lanza(() => validarAsiento({ tipo: 'compra', origen: 'proveedor', producto: 'P1', cantidad: 1 }));
  });

  test('todos los tipos documentados en DZ-MOD-01 están cubiertos', () => {
    igual(TIPOS_ASIENTO.length, 7);
  });
});

describe('libro · calcularStock', () => {
  test('stock(producto, ubicación) = Σ asientos que la tocaron', () => {
    const asientos = [
      { producto: 'P1', origen: 'proveedor', destino: 'deposito', cantidad: 100 },
      { producto: 'P1', origen: 'deposito', destino: 'camioneta:juan', cantidad: 30 },
      { producto: 'P1', origen: 'camioneta:juan', destino: 'cliente', cantidad: 12 },
    ];
    igual(calcularStock(asientos, 'P1', 'deposito'), 70);
    igual(calcularStock(asientos, 'P1', 'camioneta:juan'), 18);
    igual(calcularStock(asientos, 'P1', 'cliente'), 12);
  });

  test('un producto sin asientos tiene stock cero, no undefined', () => {
    igual(calcularStock([], 'FANTASMA', 'deposito'), 0);
  });

  test('ignora asientos de otro producto', () => {
    const asientos = [{ producto: 'OTRO', origen: 'proveedor', destino: 'deposito', cantidad: 999 }];
    igual(calcularStock(asientos, 'P1', 'deposito'), 0);
  });
});

describe('libro · ids', () => {
  test('idAsiento arma {dispositivo}-{contador}', () => {
    igual(idAsiento('CEL-01', 7), 'CEL-01-7');
  });
  test('camionetaDe arma la ubicación de un repartidor', () => {
    igual(camionetaDe('juan'), 'camioneta:juan');
  });
});
