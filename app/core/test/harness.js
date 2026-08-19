/* Arnés de test mínimo, portado de Caja Zeta. Sin dependencias: `node core/test/run.js`. */

export const suites = [];
let suiteActual = null;

export function describe(nombre, fn) {
  suiteActual = { nombre, tests: [] };
  suites.push(suiteActual);
  fn();
  suiteActual = null;
}

export function test(nombre, fn) {
  if (!suiteActual) throw new Error('test() fuera de describe()');
  suiteActual.tests.push({ nombre, fn });
}

export function assert(cond, msg = 'assert falló') {
  if (!cond) throw new Error(msg);
}

export function igual(actual, esperado, msg = '') {
  if (!Object.is(actual, esperado)) {
    throw new Error(`${msg}\n  esperado: ${format(esperado)}\n  recibido: ${format(actual)}`);
  }
}

export function iguales(actual, esperado, msg = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(esperado);
  if (a !== e) throw new Error(`${msg}\n  esperado: ${e}\n  recibido: ${a}`);
}

export async function lanza(fn, msg = 'se esperaba una excepción') {
  try {
    await fn();
  } catch {
    return;
  }
  throw new Error(msg);
}

const format = (v) => (typeof v === 'string' ? `"${v}"` : String(v));

/**
 * El corredor compartido: imprime cada suite, resume y sale con el código
 * correcto. `alFinal` es la limpieza propia de cada archivo (cerrar
 * servidor, soltar conexiones) y corre SIEMPRE, incluso si hubo fallas.
 */
export async function correr({ alFinal = async () => {} } = {}) {
  const c = {
    v: (s) => `\x1b[32m${s}\x1b[0m`, r: (s) => `\x1b[31m${s}\x1b[0m`,
    g: (s) => `\x1b[90m${s}\x1b[0m`, n: (s) => `\x1b[1m${s}\x1b[0m`,
  };

  let ok = 0;
  const mal = [];

  for (const s of suites) {
    console.log(`\n${c.n(s.nombre)}`);
    for (const t of s.tests) {
      try { await t.fn(); ok++; console.log(`  ${c.v('✓')} ${c.g(t.nombre)}`); }
      catch (e) { mal.push({ s: s.nombre, t: t.nombre, e }); console.log(`  ${c.r('✗')} ${t.nombre}`); }
    }
  }

  console.log('');
  for (const f of mal) console.log(`${c.r('✗')} ${f.s} → ${f.t}\n  ${f.e.message}\n`);
  console.log(mal.length
    ? c.r(`${ok}/${ok + mal.length} pasaron`)
    : c.v(c.n(`${ok}/${ok} pasaron`)));

  await alFinal();
  process.exit(mal.length ? 1 : 0);
}
