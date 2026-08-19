#!/usr/bin/env node
/* Corredor de tests. `node core/test/run.js` o `npm test` desde app/. */
import { suites, correr } from './harness.js';
import './totp.test.js';
import './autorizacion.test.js';
import './autenticacion.test.js';
import './usuarios.test.js';

void suites;
await correr();
