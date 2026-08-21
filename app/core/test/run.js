#!/usr/bin/env node
/* Corredor de tests. `node core/test/run.js` o `npm test` desde app/. */
import { suites, correr } from './harness.js';
import './totp.test.js';
import './autorizacion.test.js';
import './autenticacion.test.js';
import './usuarios.test.js';
import './libro.test.js';
import './ventas.test.js';
import './catalogo.test.js';
import './clientes.test.js';
import './zonas.test.js';
import './encargues.test.js';
import './compras.test.js';
import './promos.test.js';

void suites;
await correr();
