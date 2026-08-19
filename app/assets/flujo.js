/* ==========================================================================
   depo zeta — Seda de la jornada (la capa de signos vitales)
   --------------------------------------------------------------------------
   Portado de `cajazeta/app/assets/flujo.js`, misma arquitectura y mismas
   reglas de la casa. Lo que cambia es lo único que tenía que cambiar: la
   paleta (verde ruta / coral carga / ámbar) y **qué mide**.

   En Caja Zeta la seda late con las cajas abiertas y se tiñe con las
   excepciones. Acá late con **la jornada de reparto**, y lo que la tiñe es
   la resta que ordena todo el producto — carga − ventas − devoluciones:

     · uFlujo  La ruta avanzando: paradas hechas sobre las del día. Una
               camioneta parada y una a mitad de ruta no se ven igual.
     · uFrac   **El faltante del cierre.** Si la resta no da cero, la seda
               se tiñe de coral. Es el número que justifica el producto, así
               que es el que se ve sin abrir ninguna pantalla.
     · uTurb   Las no-ventas del día: cada «no compró» tensa los pliegues.
     · uSync   Sin sesión o sin poder hablar con el servidor: la escena se
               enfría y pierde brillo, igual que en Caja Zeta con datos
               viejos.

   Reglas de la casa que conserva, sin tocar:
   - Cero dependencias; WebGL2 puro. Sin WebGL2 la capa no se activa y la
     app queda igual. **Jamás puede romper la app.**
   - prefers-reduced-motion: un solo cuadro estático.
   - 30 fps, pausa con pestaña oculta, y siesta a los 2 min sin actividad:
     esto vive una jornada entera en el teléfono de un repartidor, y ahí la
     batería es un problema real, no una métrica.
   - Toggle persistente (dz:flujo), placa de vidrio (dz:vidrio) y API
     window.FLUJO — mismos contratos que en Caja Zeta.
   - Modo intenso (login/demos): FLUJO.intenso(true) o ?flujo=intenso.
   ========================================================================== */

const INTENSO = localStorage.getItem('dz:flujo:modo') === 'intenso'
  || new URLSearchParams(location.search).get('flujo') === 'intenso';
const PASO = 1 / 30;               // 30 fps: para un fondo, sobra
const SIESTA_MS = 120_000;         // sin actividad, a dormir: es una batería en la calle
const ESCALA = INTENSO ? 0.85 : 0.55;   // el especular pide resolución: filo, no blur
const OCTAVAS = INTENSO ? 6 : 5;

/* ------------------------------- Shaders ---------------------------------- */

const VS = `#version 300 es
out vec2 vUv;
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform float uTime;    // segundos, ya escalados por la corriente (uFlujo)
uniform float uAspect;
uniform float uFrac;    // 0..~.14  faltante del cierre → especular coral
uniform float uTurb;    // 0..1     no-ventas → los pliegues se afilan
uniform float uSync;    // 1 sano · .5 sin sesión o sin servidor → frío y apagado

/* La estética no sale del color: sale de la LUZ. La tela es un campo de
   altura; de su gradiente salen normales, y sobre ellas dos luces — una
   verde-agua que enciende las crestas y una ámbar lateral que aparece por
   zonas. El material base es casi negro con un verde muy profundo: el
   fondo de depo zeta (#08120E) llevado a cromo líquido. */

float hash(vec2 p){
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);   // quíntica: sin aristas
  return mix(mix(hash(i),              hash(i + vec2(1, 0)), u.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < ${OCTAVAS}; i++){
    v += a * noise(p);
    p = rot * p * 2.05;
    a *= 0.5;
  }
  return v;
}

/* El campo de altura: pliegues LARGOS y horizontales, deformados una vez.
   La horizontalidad no es capricho — es la ruta, una línea que avanza. */
float campo(vec2 p, float t){
  vec2 q = vec2(fbm(p * 0.8 + t * vec2(0.10, 0.03)),
                fbm(p * 0.8 + vec2(4.7, 2.1) - t * vec2(0.05, 0.07)));
  return fbm(vec2(p.x * 0.8, p.y * 2.6) + 2.2 * q);
}

void main(){
  vec2 uv = vUv;
  vec2 P = vec2(uv.x * uAspect, uv.y) * 0.62;
  float t = uTime;

  /* Normales por diferencias finitas. Las no-ventas AFILAN los pliegues:
     una jornada con clientes que no compraron se ve tensa. */
  float amp = 3.6 + uTurb * 2.0;
  float e = 0.012;
  float h  = campo(P, t);
  float hx = campo(P + vec2(e, 0.0), t);
  float hy = campo(P + vec2(0.0, e), t);
  vec3 N = normalize(vec3(-(hx - h) / e * amp * 0.1, -(hy - h) / e * amp * 0.1, 1.0));
  vec3 V = vec3(0.0, 0.0, 1.0);

  /* Iridiscencia por orientación: la paleta de la casa — verde agua, verde
     ruta, verde cálido, ámbar. Película de aceite sobre cromo verde. */
  float k = fract(h * 0.85 + N.x * 0.30);
  vec3 iri = mix(
    mix(vec3(0.10, 0.86, 0.72), vec3(0.18, 0.75, 0.44), smoothstep(0.00, 0.40, k)),
    mix(vec3(0.42, 0.82, 0.34), vec3(0.96, 0.77, 0.26), smoothstep(0.55, 1.00, k)),
    smoothstep(0.32, 0.72, k));

  /* El faltante: en sus zonas, el brillo vira a coral. El tinte vive EN el
     reflejo — el faltante brilla, no mancha. Es la resta del cierre hecha
     luz: si no da cero, se ve antes de abrir la pantalla de Cierre. */
  float zona = smoothstep(0.5, 0.95, fbm(P * 0.6 + 7.3));
  iri = mix(iri, vec3(1.0, 0.48, 0.35), clamp(uFrac * 5.0, 0.0, 0.75) * zona);

  /* Luz principal (arriba-izquierda): crestas filosas. */
  vec3 L1 = normalize(vec3(-0.45, 0.55, 0.62));
  float ndh1 = max(dot(N, normalize(L1 + V)), 0.0);
  float spec1 = pow(ndh1, 26.0) * 0.85 + pow(ndh1, 140.0) * 1.8;

  /* Luz ámbar lateral, por zonas lentas. */
  vec3 L2 = normalize(vec3(0.70, 0.20, 0.48));
  float ndh2 = max(dot(N, normalize(L2 + V)), 0.0);
  float spec2 = pow(ndh2, 30.0) * 0.35 + pow(ndh2, 110.0) * 1.4;
  float zonaOro = smoothstep(0.70, 0.95, fbm(P * 0.5 + vec2(2.2, 8.9) + t * 0.02));

  /* Fresnel: el borde de cada pliegue respira un halo tenue. */
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);

  vec3 col = vec3(0.005, 0.011, 0.008)              // #08120E llevado a cromo
    + spec1 * iri * 1.5
    + spec2 * vec3(0.96, 0.77, 0.26) * zonaOro * 1.0
    + fres * iri * 0.45
    + pow(clamp(h - 0.42, 0.0, 1.0), 2.0) * iri * 0.40;   // relleno suave en lomos

  /* Sin sesión o sin servidor: la luz se apaga y enfría. */
  col = mix(col * vec3(0.42, 0.58, 0.55), col, uSync);

  /* Viñeta al negro: el contenido manda. */
  vec2 cc = uv - 0.5;
  cc.x *= uAspect * 0.55;
  col *= 1.0 - dot(cc, cc) * 1.25;

  col += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;
  fragColor = vec4(max(col, 0.0), 1.0);
}`;

/* ------------------------------- Utilería ---------------------------------- */

function compilar(gl, vsSrc, fsSrc){
  const sh = (tipo, src) => {
    const s = gl.createShader(tipo);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)){
      throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
    }
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)){
    throw new Error(gl.getProgramInfoLog(p) ?? 'link');
  }
  return p;
}

/* ------------------------------ El sistema --------------------------------- */

const Flujo = {
  activo: false,
  estatico: matchMedia('(prefers-reduced-motion: reduce)').matches,
  _manual: null,           // estado forzado vía FLUJO.estado({...})
  _flujo: 0.18,
  _frac: 0,
  _turb: 0,
  _sync: 1,
  _t: 0,                   // tiempo propio, escalado por la corriente
  _acum: 0,
  _ultimo: 0,
  _desdeLectura: 1,        // fuerza leer estado en el primer tick

  boot(){
    const canvas = document.createElement('canvas');
    canvas.id = 'flujo-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText =
      'position:fixed;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;';
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false });
    if (!gl){
      console.info('[flujo] sin WebGL2: la capa no se activa y la app queda igual');
      return false;
    }

    document.body.insertAdjacentElement('afterbegin', canvas);

    /* La placa de vidrio: una lámina esmerilada ENTRE la seda y las tarjetas,
       para quien quiera más limpieza visual. z-index 1: encima de la seda (0),
       debajo del contenido (2). No captura el mouse. */
    const vidrio = document.createElement('div');
    vidrio.id = 'flujo-vidrio';
    vidrio.setAttribute('aria-hidden', 'true');
    canvas.insertAdjacentElement('afterend', vidrio);
    this.vidrio = vidrio;

    this.canvas = canvas;
    this.gl = gl;
    gl.bindVertexArray(gl.createVertexArray());   // sin atributos: todo por gl_VertexID

    this.prog = compilar(gl, VS, FS);
    this.u = {};
    for (const n of ['uTime', 'uAspect', 'uFrac', 'uTurb', 'uSync'])
      this.u[n] = gl.getUniformLocation(this.prog, n);

    new ResizeObserver(() => this._resize()).observe(document.documentElement);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this._parar(); else if (this.activo && !this.estatico) this._correr();
    });

    /* La siesta: sin actividad, la animación se detiene (el último cuadro
       queda); cualquier gesto la despierta. En un teléfono en la calle esto
       no es una optimización, es la diferencia entre llegar o no al cierre. */
    this._ultimaActividad = performance.now();
    const despertar = () => {
      this._ultimaActividad = performance.now();
      if (this._dormido && this.activo && !document.hidden && !this.estatico){
        this._dormido = false;
        this._correr();
      }
    };
    for (const ev of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'])
      addEventListener(ev, despertar, { passive: true });

    this._resize();
    return true;
  },

  _resize(){
    const dpr = Math.min(devicePixelRatio || 1, 2) * ESCALA;
    this.canvas.width  = Math.max(2, Math.round(innerWidth  * dpr));
    this.canvas.height = Math.max(2, Math.round(innerHeight * dpr));
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    if (this.activo && this.estatico) this._tick(0);   // re-dibuja el cuadro quieto
  },

  /* --------------------- Los datos → los signos vitales ------------------- */

  _leerEstado(){
    if (this._manual){
      const m = this._manual;
      this._flujo = m.flujo ?? 0.5; this._frac = m.frac ?? 0;
      this._turb = m.turb ?? 0; this._sync = m.sync ?? 1;
      return;
    }

    this._flujo = 0.18; this._frac = 0; this._turb = 0; this._sync = 1;   // base, calmo
    try {
      /* Sin sesión (pantalla de login) la escena queda base y calma, pero
         NO fría: el login es la cara del producto, no un estado degradado. */
      if (typeof E === 'undefined' || !E.sesion) return;

      /* La corriente: la ruta avanzando. Una camioneta que no salió y una a
         mitad de reparto no se ven igual. */
      const ruta = typeof rutaDelDia === 'function' ? rutaDelDia() : [];
      const hechas = ruta.filter((c) => estadoParada(c.id) !== 'pendiente').length;
      const avance = ruta.length ? hechas / ruta.length : 0;
      const ventas = (E.ventas || []).length;
      this._flujo = Math.min(1.4, 0.18 + avance * 0.75 + Math.min(ventas, 12) / 26);

      /* El faltante del cierre: carga − ventas − devoluciones ≠ 0. Sólo
         existe una vez que alguien contó la camioneta de vuelta. */
      let faltan = 0, contados = 0;
      if (E.cargaConfirmada && typeof stock === 'function'){
        for (const p of (typeof PRODUCTOS !== 'undefined' ? PRODUCTOS : [])){
          const cont = E.contado?.[p.id];
          if (cont === undefined || cont === '') continue;
          contados++;
          faltan += Math.abs(Number(cont) - stock(p.id, CAM));
        }
      }
      this._frac = contados ? Math.min(0.14, faltan / 40) : 0;

      /* Las no-ventas tensan la tela: el «no compró» es dato, y se ve. */
      this._turb = Math.min(1, (E.noVentas || []).length * 0.22);

      /* Sin servidor, la escena se enfría — igual que Caja Zeta con datos
         viejos. `E.aviso` guarda el error cuando el libro no pudo cargar. */
      this._sync = /no se pudo|no se pudo conectar/i.test(E.aviso || '') ? 0.5 : 1;
    } catch { /* cualquier problema: base neutra, jamás romper la app */ }
  },

  /* ------------------------------ Loop ------------------------------ */

  _frame(t){
    if (!INTENSO && t - this._ultimaActividad > SIESTA_MS){
      this._dormido = true;
      this._parar();
      return;
    }
    this._raf = requestAnimationFrame((tt) => this._frame(tt));
    const dt = Math.min((t - this._ultimo) / 1000, 0.1);
    this._ultimo = t;
    this._acum += dt;
    if (this._acum < PASO) return;
    const paso = Math.min(this._acum, PASO * 3);
    this._acum = 0;
    this._tick(paso);
  },

  _tick(dt){
    // El estado se relee cada ~2 s: los signos vitales no necesitan más.
    this._desdeLectura += dt;
    if (this._desdeLectura > 2){ this._desdeLectura = 0; this._leerEstado(); }

    /* El tiempo propio avanza según la corriente: más ruta hecha, más vivo.
       Escalar el tiempo (y no una velocidad en el shader) mantiene la
       continuidad — un cambio de actividad nunca hace saltar la tela. */
    this._t += dt * (0.25 + this._flujo * 0.6);

    const gl = this.gl;
    gl.useProgram(this.prog);
    gl.uniform1f(this.u.uTime, this._t);
    gl.uniform1f(this.u.uAspect, this.canvas.width / this.canvas.height);
    gl.uniform1f(this.u.uFrac, this._frac);
    gl.uniform1f(this.u.uTurb, this._turb);
    gl.uniform1f(this.u.uSync, this._sync);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  },

  _correr(){
    if (this._raf) return;
    this._ultimo = performance.now();
    this._raf = requestAnimationFrame((t) => this._frame(t));
  },
  _parar(){
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  },

  on(){
    this.activo = true;
    localStorage.setItem('dz:flujo', '1');
    this.canvas.style.display = '';
    document.documentElement.classList.add('con-flujo');
    if (this.estatico){
      // Movimiento reducido: UN cuadro asentado. La seda y sus tintes se ven
      // igual; nada se mueve.
      this._leerEstado();
      this._t = 40;                 // un punto "interesante" de la tela
      this._tick(0);
    } else {
      this._correr();
    }
    this._boton?.setAttribute('data-on', '1');
  },
  off(){
    this.activo = false;
    localStorage.setItem('dz:flujo', '0');
    this._parar();
    this.canvas.style.display = 'none';
    document.documentElement.classList.remove('con-flujo');
    this._boton?.setAttribute('data-on', '0');
  },

  /* API para evaluar a ojo desde la consola:
     FLUJO.estado({flujo:1.2, frac:.14, turb:.6, sync:1})  → fuerza un clima
     FLUJO.estado(null)                                    → datos reales */
  estado(e){ this._manual = e; this._desdeLectura = 1; },

  intenso(v = true){
    if (v) localStorage.setItem('dz:flujo:modo', 'intenso');
    else localStorage.removeItem('dz:flujo:modo');
    location.reload();
  },

  /* -------------------------- La placa de vidrio -------------------------- */

  /* El vidrio se marca con un atributo, no con `display` inline: así el CSS
     puede sacarlo en la pantalla de login sin pelearse con el estilo del
     elemento. Ver la regla `body:has(#pantalla-login...)` más abajo. */
  vidrioOn(){
    this.vidrio?.setAttribute('data-puesto', '1');
    localStorage.setItem('dz:vidrio', '1');
    this._botonVidrio?.setAttribute('data-on', '1');
  },
  vidrioOff(){
    this.vidrio?.setAttribute('data-puesto', '0');
    localStorage.setItem('dz:vidrio', '0');
    this._botonVidrio?.setAttribute('data-on', '0');
  },
  toggleVidrio(){
    if (this.vidrio?.getAttribute('data-puesto') === '1') this.vidrioOff();
    else this.vidrioOn();
  },

  /* ------------------------------ Controles ------------------------------- */

  _montarControles(){
    const cont = document.createElement('div');
    cont.id = 'flujo-controles';

    const pill = (id, etiqueta, titulo) => {
      const b = document.createElement('button');
      b.id = id; b.type = 'button'; b.title = titulo;
      b.innerHTML = `<i></i><span>${etiqueta}</span>`;
      cont.appendChild(b);
      return b;
    };

    const bFlujo = pill('flujo-toggle', 'flujo', this.estatico
      ? 'Flujo (estático por preferencia de movimiento reducido)'
      : 'Seda de la jornada — la corriente late con la ruta hecha, el faltante del cierre la tiñe de coral. Tocá para apagar.');
    const bVidrio = pill('vidrio-toggle', 'vidrio',
      'Vidrio esmerilado entre la seda y la app — para más limpieza visual, sin apagar el flujo.');

    const css = document.createElement('style');
    css.textContent = `
      #flujo-controles{position:fixed;right:14px;bottom:96px;z-index:41;
        display:flex;gap:8px;align-items:center}
      #flujo-controles button{display:flex;align-items:center;gap:7px;padding:7px 12px;
        border-radius:999px;border:.5px solid var(--borde,rgba(255,255,255,.11));
        background:var(--panel,rgba(255,255,255,.055));color:var(--mudo,rgba(233,241,235,.34));
        font:600 10px/1 var(--mono,monospace);letter-spacing:.14em;text-transform:uppercase;
        cursor:pointer;backdrop-filter:blur(8px) saturate(140%);
        -webkit-backdrop-filter:blur(8px) saturate(140%)}
      #flujo-controles button i{width:7px;height:7px;border-radius:50%;background:currentColor;opacity:.4}
      #flujo-toggle[data-on="1"]{color:var(--amarillo,#F5C542)}
      #flujo-toggle[data-on="1"] i{opacity:1;box-shadow:0 0 8px currentColor}
      #vidrio-toggle[data-on="1"]{color:var(--verde,#2FBF71)}
      #vidrio-toggle[data-on="1"] i{opacity:1;box-shadow:0 0 8px currentColor}

      /* La placa: mismo material que las tarjetas — desenfoque + saturación
         = la refracción — y un brillo diagonal = el reflejo. */
      #flujo-vidrio{position:fixed;inset:0;z-index:1;pointer-events:none;display:none;
        background:
          linear-gradient(125deg, rgba(255,255,255,.07) 0%, rgba(255,255,255,.015) 26%,
                          rgba(255,255,255,0) 52%),
          radial-gradient(120% 80% at 50% 118%, rgba(47,191,113,.10), rgba(0,0,0,0) 60%),
          var(--panel,rgba(255,255,255,.055));
        backdrop-filter:blur(11px) saturate(145%) brightness(1.03);
        -webkit-backdrop-filter:blur(11px) saturate(145%) brightness(1.03);
        box-shadow:inset 0 1px 0 rgba(255,255,255,.06), inset 0 -40px 90px rgba(47,191,113,.05)}
      #flujo-vidrio[data-puesto="1"]{display:block}

      /* En el login la seda va a pleno: dura cinco segundos y es la cara del
         producto. Adentro, en cambio, hay que leer números a pleno sol desde
         una camioneta — ahí el vidrio se pone solo, aunque quede elegido. */
      body:has(#pantalla-login:not([hidden])) #flujo-vidrio{display:none}

      /* Con la seda encendida, las manchas del fondo estorban y las capas
         opacas la taparían. Sólo entonces se apagan y se abren. */
      html.con-flujo body::before{opacity:0}
      html.con-flujo #pantalla-login{background:transparent}
      html.con-flujo #pantalla-login::before{opacity:0}
      html.con-flujo .wrap, html.con-flujo #pantalla-login > *{position:relative;z-index:2}`;
    document.head.appendChild(css);

    bFlujo.addEventListener('click', () => (this.activo ? this.off() : this.on()));
    bVidrio.addEventListener('click', () => this.toggleVidrio());

    document.body.appendChild(cont);
    this._boton = bFlujo;
    this._botonVidrio = bVidrio;
  },
};

/* ------------------------------- Arranque ---------------------------------- */

document.addEventListener('DOMContentLoaded', () => {
  try {
    if (!Flujo.boot()) return;
    Flujo._montarControles();
    window.FLUJO = Flujo;
    // Prendida por defecto; los toggles recuerdan la elección.
    if (localStorage.getItem('dz:flujo') !== '0') Flujo.on(); else Flujo.off();
    /* El vidrio arranca PUESTO, al revés que en Caja Zeta: esto se usa en la
       calle, con sol, mirando un teléfono — la seda a pleno detrás de una
       tabla de números se lee mal. En el login el CSS lo saca solo. */
    if (localStorage.getItem('dz:vidrio') === '0') Flujo.vidrioOff(); else Flujo.vidrioOn();
  } catch (e) {
    // Regla de la casa: la capa jamás puede romper la app.
    console.warn('[flujo] desactivada por error:', e);
    document.getElementById('flujo-canvas')?.remove();
    document.getElementById('flujo-vidrio')?.remove();
    document.getElementById('flujo-controles')?.remove();
  }
});
