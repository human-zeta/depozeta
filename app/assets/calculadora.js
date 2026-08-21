/* ==========================================================================
   depo zeta — Calculadora (herramienta lateral, autocontenida)
   --------------------------------------------------------------------------
   Una calculadora de cuatro operaciones que se despliega desde el borde
   derecho. Es una herramienta de apoyo para el operador —sumar un arqueo, sacar un vuelto,
   verificar un total a mano— sin salir del panel ni abrir otra app.

   No toca nada del sistema: no lee ni escribe datos, no depende de la sesión.
   Autocontenida a propósito, como el flujo: un archivo, sin dependencias. Se
   saca borrando este archivo y su <script> en index.html.

   Reglas de la casa que respeta:
   - El resultado se redondea SIEMPRE al centavo antes de mostrarse o de
     encadenarse: el error binario del punto flotante (0.1+0.2) no llega ni
     al display ni a la operación siguiente.
   - Teclado completo: dígitos, + - * /, Enter (=), Backspace, Escape (cierra).
   - Estado propio, aislado del panel; jamás rompe nada.
   ========================================================================== */

const Calc = {
  abierta: false,
  expr: '',        // lo que se está escribiendo, como texto
  resultado: null, // último resultado, para encadenar
  _err: false,

  boot() {
    const cont = document.createElement('div');
    cont.id = 'calc';
    cont.setAttribute('aria-hidden', 'true');
    cont.innerHTML = `
      <button id="calc-tab" type="button" title="Calculadora (herramienta)">
        <span>calc</span>
      </button>
      <div id="calc-panel" role="dialog" aria-label="Calculadora">
        <div id="calc-head">
          <span>Calculadora</span>
          <button id="calc-cerrar" type="button" aria-label="Cerrar">✕</button>
        </div>
        <output id="calc-display">0</output>
        <div id="calc-teclas"></div>
      </div>`;

    const css = document.createElement('style');
    css.textContent = `
      #calc{position:fixed;right:0;top:50%;transform:translateY(-50%);z-index:95;
        display:flex;align-items:center;pointer-events:none}
      #calc *{pointer-events:auto}
      #calc-tab{writing-mode:vertical-rl;transform:rotate(180deg);
        padding:14px 7px;border:1px solid var(--g-edge,rgba(255,255,255,.15));border-right:0;
        border-radius:10px 0 0 10px;background:var(--g-fill,rgba(255,255,255,.075));
        color:var(--dim,rgba(255,255,255,.5));font:600 10px/1 var(--mono,monospace);
        letter-spacing:.16em;text-transform:uppercase;cursor:pointer;
        backdrop-filter:blur(8px) saturate(140%);-webkit-backdrop-filter:blur(8px) saturate(140%)}
      #calc-tab:hover{color:#2FBF71}
      #calc-panel{width:236px;padding:14px;border-radius:14px 0 0 14px;
        border:1px solid var(--g-edge,rgba(255,255,255,.15));border-right:0;
        background:var(--g-fill-hi,rgba(255,255,255,.09));
        backdrop-filter:blur(24px) saturate(160%);-webkit-backdrop-filter:blur(24px) saturate(160%);
        box-shadow:0 24px 80px rgba(0,0,0,.5);
        display:none;flex-direction:column;gap:10px}
      #calc.abierta #calc-panel{display:flex}
      #calc.abierta #calc-tab{display:none}
      #calc-head{display:flex;align-items:center;justify-content:space-between;
        font:600 10px/1 var(--mono,monospace);letter-spacing:.14em;text-transform:uppercase;
        color:var(--dim,rgba(255,255,255,.5))}
      #calc-cerrar{background:none;border:0;color:inherit;cursor:pointer;font-size:14px;line-height:1}
      #calc-display{display:block;text-align:right;font:600 22px/1.3 var(--mono,monospace);
        color:var(--fg,#fff);background:rgba(0,0,0,.28);border-radius:10px;padding:12px 12px;
        min-height:26px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
        border:.5px solid rgba(255,255,255,.08)}
      #calc-display.err{color:var(--bad,#ff6b6b);font-size:15px}
      #calc-teclas{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}
      #calc-teclas button{height:42px;border-radius:10px;cursor:pointer;
        border:.5px solid rgba(255,255,255,.1);background:rgba(255,255,255,.06);
        color:var(--fg,#fff);font:600 15px/1 var(--mono,monospace)}
      #calc-teclas button:hover{background:rgba(255,255,255,.12)}
      #calc-teclas button.op{color:#FF7A59}
      #calc-teclas button.acc{color:#2FBF71}
      #calc-teclas button.eq{background:#2FBF71;color:#04120A;border-color:#2FBF71}
      #calc-teclas button.wide{grid-column:span 2}`;
    document.head.appendChild(css);

    // Distribución de teclas. `op` operadores, `acc` acciones, `eq` igual.
    const TECLAS = [
      ['C', 'acc'], ['←', 'acc'], ['%', 'op'], ['÷', 'op'],
      ['7', ''], ['8', ''], ['9', ''], ['×', 'op'],
      ['4', ''], ['5', ''], ['6', ''], ['−', 'op'],
      ['1', ''], ['2', ''], ['3', ''], ['+', 'op'],
      ['0', ''], ['.', ''], ['=', 'eq'],
    ];
    const teclas = cont.querySelector('#calc-teclas');
    teclas.innerHTML = TECLAS.map(([t, k]) =>
      `<button class="${k}${t === '=' ? ' wide' : ''}" data-k="${t}">${t}</button>`).join('');

    teclas.addEventListener('click', (e) => {
      const b = e.target.closest('[data-k]');
      if (b) this.tecla(b.dataset.k);
    });
    cont.querySelector('#calc-tab').addEventListener('click', () => this.abrir());
    cont.querySelector('#calc-cerrar').addEventListener('click', () => this.cerrar());

    document.body.appendChild(cont);
    this._cont = cont;
    this._display = cont.querySelector('#calc-display');

    addEventListener('keydown', (e) => this._teclado(e));
  },

  abrir() { this.abierta = true; this._cont.classList.add('abierta'); },
  cerrar() { this.abierta = false; this._cont.classList.remove('abierta'); },

  _pintar() {
    this._display.classList.toggle('err', this._err);
    this._display.textContent = this._err
      ? 'no válido'
      : (this.expr || (this.resultado != null ? this._fmt(this.resultado) : '0'));
  },

  /* Formatea con separador de miles y coma decimal, al estilo del panel. */
  _fmt(n) {
    if (!isFinite(n)) return 'no válido';
    const s = (Math.round(n * 100) / 100).toString();
    const [ent, dec] = s.split('.');
    const conMiles = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return dec ? `${conMiles},${dec}` : conMiles;
  },

  tecla(t) {
    if (this._err && t !== 'C') { this._err = false; this.expr = ''; }
    const opsVisibles = { '÷': '/', '×': '*', '−': '-', '+': '+' };

    if (t === 'C') { this.expr = ''; this.resultado = null; this._err = false; }
    else if (t === '←') { this.expr = this.expr.slice(0, -1); }
    else if (t === '=') { this._calcular(); }
    else if (t === '%') { this.expr += '%'; }
    else if (opsVisibles[t]) {
      // Encadenar sobre el último resultado si se arranca con un operador.
      if (!this.expr && this.resultado != null) this.expr = String(this.resultado);
      this.expr += opsVisibles[t];
    } else { // dígito o punto
      this.expr += t === '.' ? '.' : t;
    }
    this._pintar();
  },

  _calcular() {
    if (!this.expr) return;
    try {
      const valor = evaluar(this.expr);
      if (valor == null || !isFinite(valor)) throw new Error('no válido');
      /* Al centavo acá, no sólo al mostrar: lo que se encadena con el
         próximo operador es esto — 0.1+0.2 nunca arrastra el ...004. */
      this.resultado = Math.round(valor * 100) / 100;
      this.expr = '';
      this._err = false;
    } catch { this._err = true; }
    this._pintar();
  },

  _teclado(e) {
    // Sólo captura cuando la calculadora está abierta, para no robarle teclas
    // al panel (los campos de formulario siguen funcionando).
    if (!this.abierta) return;
    const activo = document.activeElement;
    if (activo && /^(INPUT|TEXTAREA|SELECT)$/.test(activo.tagName)) return;

    const k = e.key;
    const mapa = { '/': '÷', '*': '×', '-': '−', '+': '+', 'Enter': '=', '=': '=',
                   'Backspace': '←', 'Escape': null, '%': '%' };
    if (k === 'Escape') { this.cerrar(); e.preventDefault(); return; }
    if (/^[0-9.]$/.test(k)) { this.tecla(k); e.preventDefault(); }
    else if (k in mapa && mapa[k]) { this.tecla(mapa[k]); e.preventDefault(); }
    else if (k === 'c' || k === 'C') { this.tecla('C'); e.preventDefault(); }
  },
};

/* Evaluador propio: NO usa eval(). Convierte la expresión a notación polaca
   inversa (Shunting-yard) y la resuelve. Sólo números, + − × ÷ y % (porcentaje
   del término anterior). Todo lo demás es "no válido". */
function evaluar(expr) {
  const tokens = tokenizar(expr);
  if (!tokens.length) return null;
  const prec = { '+': 1, '-': 1, '*': 2, '/': 2 };
  const salida = [], ops = [];
  for (const t of tokens) {
    if (typeof t === 'number') salida.push(t);
    else {
      while (ops.length && prec[ops[ops.length - 1]] >= prec[t]) salida.push(ops.pop());
      ops.push(t);
    }
  }
  while (ops.length) salida.push(ops.pop());

  const pila = [];
  for (const t of salida) {
    if (typeof t === 'number') { pila.push(t); continue; }
    const b = pila.pop(), a = pila.pop();
    if (a == null || b == null) throw new Error('mal formada');
    if (t === '/' && b === 0) throw new Error('división por cero');
    pila.push(t === '+' ? a + b : t === '-' ? a - b : t === '*' ? a * b : a / b);
  }
  if (pila.length !== 1) throw new Error('mal formada');
  return pila[0];
}

function tokenizar(expr) {
  const tokens = [];
  let num = '';
  const empujarNum = () => {
    if (num === '') return;
    let n = Number(num);
    if (num.endsWith('%')) n = Number(num.slice(0, -1)) / 100;
    if (!isFinite(n)) throw new Error('número inválido');
    tokens.push(n); num = '';
  };
  for (const ch of expr) {
    if (/[0-9.%]/.test(ch)) num += ch;
    else if ('+-*/'.includes(ch)) {
      empujarNum();
      // Un signo al inicio o tras otro operador es signo, no resta.
      if (ch === '-' && (tokens.length === 0 || typeof tokens[tokens.length - 1] === 'string')) {
        num = '-';
      } else tokens.push(ch);
    } else throw new Error('caracter inválido');
  }
  empujarNum();
  return tokens;
}

document.addEventListener('DOMContentLoaded', () => {
  try {
    Calc.boot();
    window.CALC = Calc;
  } catch (e) {
    console.warn('[calc] desactivada por error:', e);
    document.getElementById('calc')?.remove();
  }
});
