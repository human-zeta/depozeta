/* ==========================================================================
   depo zeta — API real · DZ-SEG-01
   --------------------------------------------------------------------------
   Cloudflare Worker + D1. Cablea los motores puros de `app/core/*.js`
   (auth, autorización, usuarios, auditoría — probados en Node, 66/66) a
   HTTP real. La lógica de seguridad no vive acá: acá sólo se traduce
   HTTP ↔ motor y se arma el "sujeto" desde la sesión.

   No probado contra Cloudflare real (no hay cuenta desplegada) — sí
   probado de punta a punta con `wrangler dev`, que corre D1 localmente
   sin necesitar la nube. Ver server/api/README.md.

   Secretos esperados (`wrangler secret put NOMBRE`, nunca en el repo):
     BOOTSTRAP_TOKEN   elegido por el dueño del proyecto, sólo para crear
                       el primer ADMIN — sin este token, /api/bootstrap no
                       hace nada aunque la base esté vacía.
   ========================================================================== */

import { crearAutenticacion } from '../../app/core/autenticacion.js';
import { crearGestionUsuarios } from '../../app/core/usuarios.js';
import { crearSujeto, ROLES, ACCIONES, puede, exigir } from '../../app/core/autorizacion.js';
import { validarAsiento } from '../../app/core/libro.js';
import { armarProducto, remarcarProductos } from '../../app/core/catalogo.js';
import { armarCliente, siguienteIdCliente, puedeActualizarPunto } from '../../app/core/clientes.js';
import { armarZona } from '../../app/core/zonas.js';
import { armarVenta, asientosDeVenta, validarStockParaAsientos } from '../../app/core/ventas.js';
import {
  armarEncargue, vincularProductoEspecial, exigirTransicion, armarVentaDesdeEncargue,
} from '../../app/core/encargues.js';
import { repositorioAutenticacionD1, repositorioUsuariosD1, auditoriaD1 } from './repo-d1.mjs';
import {
  repositorioCatalogoD1, repositorioClientesD1, repositorioLibroD1,
  repositorioVentasD1, repositorioNoVentasD1, repositorioEncarguesD1, repositorioZonasD1,
} from './repo-libro-d1.mjs';

/* ------------------------------- Utilidades -------------------------------- */

/* Lista blanca de orígenes — el front todavía puede vivir en cualquiera de
   estos tres lugares (GitHub Pages con o sin el dominio propio resuelto,
   más el navegador local de desarrollo), así que se refleja el que
   corresponda en vez de un `*` abierto a cualquiera. */
const ORIGENES_PERMITIDOS = [
  'https://depozeta.hg-vl.com',
  'https://human-zeta.github.io',
  'null',   // abrir app/index.html con doble clic manda Origin: null —
            // aceptable acá porque la sesión viaja en el header
            // Authorization (localStorage, aislado por origen), nunca en
            // una cookie: otro origen no puede ni leer el token para
            // armar el header, así que este permiso no habilita CSRF.
];

function encabezadosCors(req) {
  const origin = req.headers.get('Origin') || '';
  const permitido = ORIGENES_PERMITIDOS.includes(origin) || /^https?:\/\/localhost(:\d+)?$/.test(origin);
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': permitido ? origin : ORIGENES_PERMITIDOS[0],
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    Vary: 'Origin',
  };
}

/* Traduce el código de error del dominio (puesto por los motores) a HTTP.
   Un solo lugar — el resto del archivo nunca elige un status a mano. */
const HTTP_POR_CODIGO = {
  DATOS_INCOMPLETOS: 400, CLAVE_DEBIL: 400, CODIGO_INVALIDO: 400,
  TIPO_INVALIDO: 400, CANTIDAD_INVALIDA: 400, MOTIVO_REQUERIDO: 400, MEDIO_PAGO_REQUERIDO: 400,
  CREDENCIALES_INVALIDAS: 401, TICKET_INVALIDO: 401, SIN_SESION: 401,
  CUENTA_INACTIVA: 403, NO_AUTORIZADO: 403,
  YA_EXISTE: 409, YA_INICIALIZADO: 409, NO_EXISTE: 404,
  STOCK_INSUFICIENTE: 409, TRANSICION_INVALIDA: 409, ENCARGUE_INCOMPLETO: 409,
  INTENTOS_EXCEDIDOS: 429,
};

const ip = (req) => req.headers.get('CF-Connecting-IP') ?? null;
const userAgent = (req) => req.headers.get('User-Agent') ?? null;

async function cuerpo(req) {
  try { return await req.json(); } catch { return {}; }
}

/* ------------------------------ Armado de motores --------------------------- */

function armarMotores(env) {
  const auditoria = auditoriaD1(env.DB);
  const repoUsuarios = repositorioUsuariosD1(env.DB);

  /* `auth` necesita saber si una cuenta está activa; `usuarios` necesita
     `auth` para fijar la clave al crear una cuenta — dependencia circular
     si se arma con las dos fábricas. Se rompe acá: `activoDe` pregunta
     directo al repositorio de usuarios, no al motor completo. */
  const activoDe = async (usuario) => {
    const u = await repoUsuarios.usuarioPorNombre(usuario);
    return Boolean(u?.activo);
  };

  const auth = crearAutenticacion({
    repositorio: repositorioAutenticacionD1(env.DB),
    auditoria,
    activoDe,
  });
  const usuarios = crearGestionUsuarios({ repositorio: repoUsuarios, autenticacion: auth, auditoria });

  return {
    auth, usuarios, repoUsuarios,
    repoCatalogo: repositorioCatalogoD1(env.DB),
    repoClientes: repositorioClientesD1(env.DB),
    repoLibro: repositorioLibroD1(env.DB),
    repoVentas: repositorioVentasD1(env.DB),
    repoNoVentas: repositorioNoVentasD1(env.DB),
    repoEncargues: repositorioEncarguesD1(env.DB),
    repoZonas: repositorioZonasD1(env.DB),
  };
}

const idAsiento = () => `srv-${crypto.randomUUID()}`;
const idVenta = () => `V-${crypto.randomUUID()}`;
const idEncargue = () => `ENC-${crypto.randomUUID()}`;

/* Costo y margen son lo que separa la interfaz de reparto de la de
   depósito (DZ-MOD-01, «Perfil y permisos») — acá es donde se aplica de
   verdad: quien no tiene VER_COSTOS nunca ve esos campos en la respuesta,
   no es un simple ocultamiento visual. */
const productoPublico = (p, sujeto) => {
  if (puede(sujeto, ACCIONES.VER_COSTOS).ok) return p;
  const { costo, costoActualizado, ...resto } = p;
  return resto;
};

/* Junta los asientos existentes de los productos que una venta va a tocar
   —no todo el libro— para validar la invariante 4 antes de persistir. */
async function asientosRelevantes(repoLibro, asientosNuevos) {
  const productos = [...new Set(asientosNuevos.map((a) => a.producto))];
  const listas = await Promise.all(productos.map((p) => repoLibro.asientosDeProducto(p)));
  return listas.flat();
}

/* Igual que capturarPunto() en el prototipo F0: el pin que se aprende en la
   entrega es un efecto de vender, no un paso aparte — y uno real nunca se
   deja pisar por uno geocodificado (puedeActualizarPunto, DZ-MOD-01). */
async function capturarPuntoSiCorresponde(repoClientes, cliente, punto) {
  if (!punto || !puedeActualizarPunto(cliente)) return;
  await repoClientes.guardarCliente({ ...cliente, punto: { lat: punto.lat, lng: punto.lng, aproximado: false, nuevo: true } });
}

/** Arma el "sujeto" (autorizacion.js) a partir del token del pedido. */
async function sujetoDesde(req, auth, repoUsuarios) {
  const encabezado = req.headers.get('Authorization') ?? '';
  const token = encabezado.startsWith('Bearer ') ? encabezado.slice(7) : null;
  if (!token) return null;
  const sesion = await auth.validarSesion(token);
  if (!sesion) return null;
  const perfil = await repoUsuarios.usuarioPorNombre(sesion.usuario);
  if (!perfil || !perfil.activo) return null;
  return crearSujeto({ id: perfil.id, usuario: perfil.usuario, rol: perfil.rol, empresaId: perfil.empresaId });
}

const perfilPublico = (u) => ({ id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol, empresaId: u.empresaId, activo: u.activo });

/* ---------------------------------- Rutas ----------------------------------- */

export default {
  async fetch(req, env) {
    const encabezados = encabezadosCors(req);
    if (req.method === 'OPTIONS') return new Response(null, { headers: encabezados });

    const json = (datos, estado = 200) => new Response(JSON.stringify(datos), { status: estado, headers: encabezados });
    const errorJson = (e) => {
      const estado = HTTP_POR_CODIGO[e?.codigo] ?? 500;
      if (estado === 500) console.error('error no mapeado:', e);
      return json({ error: e?.codigo ?? 'ERROR_INTERNO', mensaje: e?.message ?? 'error interno' }, estado);
    };

    const url = new URL(req.url);
    const {
      auth, usuarios, repoUsuarios, repoCatalogo, repoClientes, repoLibro,
      repoVentas, repoNoVentas, repoEncargues, repoZonas,
    } = armarMotores(env);

    try {
      // ---- arranque: sólo el primer ADMIN, sólo con el token del Worker ----
      if (url.pathname === '/api/bootstrap' && req.method === 'POST') {
        const b = await cuerpo(req);
        if (!env.BOOTSTRAP_TOKEN || b.token !== env.BOOTSTRAP_TOKEN) {
          return json({ error: 'NO_AUTORIZADO', mensaje: 'token de arranque inválido' }, 403);
        }
        const u = await usuarios.bootstrapAdmin({ usuario: b.usuario, nombre: b.nombre, clave: b.clave });
        return json(perfilPublico(u), 201);
      }

      // ---- login, paso 1: usuario + clave ----
      if (url.pathname === '/api/login' && req.method === 'POST') {
        const b = await cuerpo(req);
        const r = await auth.iniciarSesion({ usuario: b.usuario, clave: b.clave, ip: ip(req), userAgent: userAgent(req) });
        // el secreto y la URI sólo viajan la vez que hay que enrolar
        return json(r);
      }

      // ---- login, paso 2: código TOTP contra el ticket del paso 1 ----
      if (url.pathname === '/api/login/totp' && req.method === 'POST') {
        const b = await cuerpo(req);
        const r = await auth.completarTotp({ ticket: b.ticket, codigo: b.codigo, ip: ip(req), userAgent: userAgent(req) });
        const perfil = await repoUsuarios.usuarioPorNombre(r.usuario);
        return json({ ...r, perfil: perfil ? perfilPublico(perfil) : null });
      }

      // ---- todo lo demás exige sesión ----
      const sujeto = await sujetoDesde(req, auth, repoUsuarios);

      if (url.pathname === '/api/logout' && req.method === 'POST') {
        const encabezado = req.headers.get('Authorization') ?? '';
        const token = encabezado.startsWith('Bearer ') ? encabezado.slice(7) : '';
        await auth.cerrarSesion(token);
        return json({ ok: true });
      }

      if (url.pathname === '/api/yo' && req.method === 'GET') {
        if (!sujeto) return json({ error: 'SIN_SESION', mensaje: 'no hay sesión válida' }, 401);
        /* `sujeto` es la forma angosta de autorizacion.js (id/usuario/rol/
           empresaId) — no lleva nombre ni activo. Para mostrarle algo a la
           persona (“Hola Juan Cruz”) hace falta el perfil real. */
        const perfil = await repoUsuarios.usuarioPorNombre(sujeto.usuario);
        return json(perfilPublico(perfil));
      }

      if (url.pathname === '/api/usuarios' && req.method === 'GET') {
        if (!sujeto) return json({ error: 'SIN_SESION', mensaje: 'no hay sesión válida' }, 401);
        const lista = await usuarios.listarUsuarios(sujeto);
        return json(lista.map(perfilPublico));
      }

      if (url.pathname === '/api/usuarios' && req.method === 'POST') {
        if (!sujeto) return json({ error: 'SIN_SESION', mensaje: 'no hay sesión válida' }, 401);
        const b = await cuerpo(req);
        const u = await usuarios.crearUsuario(sujeto, { usuario: b.usuario, nombre: b.nombre, rol: b.rol, clave: b.clave });
        return json(perfilPublico(u), 201);
      }

      const desactivar = url.pathname.match(/^\/api\/usuarios\/([^/]+)\/desactivar$/);
      if (desactivar && req.method === 'POST') {
        if (!sujeto) return json({ error: 'SIN_SESION', mensaje: 'no hay sesión válida' }, 401);
        const u = await usuarios.desactivarUsuario(sujeto, decodeURIComponent(desactivar[1]));
        return json(perfilPublico(u));
      }

      const reiniciarTotp = url.pathname.match(/^\/api\/usuarios\/([^/]+)\/reiniciar-totp$/);
      if (reiniciarTotp && req.method === 'POST') {
        if (!sujeto) return json({ error: 'SIN_SESION', mensaje: 'no hay sesión válida' }, 401);
        const r = await usuarios.reiniciarTotpDe(sujeto, decodeURIComponent(reiniciarTotp[1]));
        return json(r);
      }

      // ---- a partir de acá, el libro operativo — DZ-MOD-01. Todo pide sesión. ----
      if (!sujeto) return json({ error: 'SIN_SESION', mensaje: 'no hay sesión válida' }, 401);

      // -- catálogo --
      if (url.pathname === '/api/productos' && req.method === 'GET') {
        const lista = await repoCatalogo.listarProductos();
        return json(lista.map((p) => productoPublico(p, sujeto)));
      }

      if (url.pathname === '/api/productos' && req.method === 'POST') {
        exigir(sujeto, ACCIONES.GESTIONAR_PRODUCTOS);
        const b = await cuerpo(req);
        if (await repoCatalogo.productoPorId(b.id)) {
          return json({ error: 'YA_EXISTE', mensaje: `ya existe un producto con el código ${b.id}` }, 409);
        }
        const producto = armarProducto(b);
        await repoCatalogo.guardarProducto(producto);
        if (b.stockInicial > 0) {
          const asiento = {
            id: idAsiento(), fecha: new Date().toISOString(), tipo: 'compra', origen: 'proveedor',
            destino: 'deposito', producto: producto.id, cantidad: b.stockInicial,
            autor: sujeto.usuario, dispositivo: 'srv', motivo: 'alta de producto',
          };
          validarAsiento(asiento);
          await repoLibro.crearAsiento(asiento);
        }
        return json(productoPublico(producto, sujeto), 201);
      }

      if (url.pathname === '/api/productos/remarcar' && req.method === 'POST') {
        exigir(sujeto, ACCIONES.REMARCAR);
        const b = await cuerpo(req);
        const productos = await repoCatalogo.listarProductos();
        const remarcados = remarcarProductos(productos, { pct: Number(b.pct), rubro: b.rubro });
        for (const p of remarcados) await repoCatalogo.guardarProducto(p);
        return json({ ok: true, afectados: remarcados.length });
      }

      // -- clientes --
      if (url.pathname === '/api/clientes' && req.method === 'GET') {
        return json(await repoClientes.listarClientes());
      }

      if (url.pathname === '/api/clientes' && req.method === 'POST') {
        exigir(sujeto, ACCIONES.AGREGAR_CLIENTE);
        const b = await cuerpo(req);
        const ids = await repoClientes.idsExistentes();
        const cliente = armarCliente({ ...b, id: siguienteIdCliente(ids) });
        await repoClientes.guardarCliente(cliente);
        return json(cliente, 201);
      }

      const puntoCliente = url.pathname.match(/^\/api\/clientes\/([^/]+)\/punto$/);
      if (puntoCliente && req.method === 'POST') {
        const id = decodeURIComponent(puntoCliente[1]);
        const existente = await repoClientes.clientePorId(id);
        if (!existente) return json({ error: 'NO_EXISTE', mensaje: `no existe el cliente ${id}` }, 404);
        if (!puedeActualizarPunto(existente)) return json(existente);   // pin real: no se pisa, no es error
        const b = await cuerpo(req);
        existente.punto = { lat: b.lat, lng: b.lng, aproximado: Boolean(b.aproximado), nuevo: !b.aproximado };
        await repoClientes.guardarCliente(existente);
        return json(existente);
      }

      // -- zonas a evitar --
      if (url.pathname === '/api/zonas' && req.method === 'GET') {
        return json(await repoZonas.listarZonas());
      }

      if (url.pathname === '/api/zonas' && req.method === 'POST') {
        exigir(sujeto, ACCIONES.GESTIONAR_ZONAS);
        const b = await cuerpo(req);
        const zona = armarZona({ ...b, id: await repoZonas.siguienteIdZona() });
        await repoZonas.guardarZona(zona);
        return json(zona, 201);
      }

      const eliminarZona = url.pathname.match(/^\/api\/zonas\/([^/]+)\/eliminar$/);
      if (eliminarZona && req.method === 'POST') {
        exigir(sujeto, ACCIONES.GESTIONAR_ZONAS);
        await repoZonas.eliminarZona(decodeURIComponent(eliminarZona[1]));
        return json({ ok: true });
      }

      // -- el libro --
      if (url.pathname === '/api/asientos' && req.method === 'GET') {
        return json(await repoLibro.listarAsientos());
      }

      if (url.pathname === '/api/carga' && req.method === 'POST') {
        exigir(sujeto, ACCIONES.CONFIRMAR_CARGA);
        const b = await cuerpo(req);
        if (!b.repartidor) return json({ error: 'DATOS_INCOMPLETOS', mensaje: 'falta a qué repartidor se carga' }, 400);
        const camioneta = `camioneta:${b.repartidor}`;
        const ref = 'carga-' + new Date().toDateString();
        const asientos = (b.renglones || []).filter((r) => r.cantidad > 0).map((r) => ({
          id: idAsiento(), fecha: new Date().toISOString(), tipo: 'carga', origen: 'deposito',
          destino: camioneta, producto: r.producto, cantidad: r.cantidad,
          autor: sujeto.usuario, dispositivo: 'srv', ref,
        }));
        asientos.forEach(validarAsiento);
        for (const a of asientos) await repoLibro.crearAsiento(a);
        return json({ ok: true, asientos: asientos.length });
      }

      // -- ventas --
      if (url.pathname === '/api/ventas' && req.method === 'POST') {
        exigir(sujeto, ACCIONES.VENDER);
        const b = await cuerpo(req);
        const cliente = await repoClientes.clientePorId(b.cliente);
        if (!cliente) return json({ error: 'NO_EXISTE', mensaje: `no existe el cliente ${b.cliente}` }, 404);

        // el precio SIEMPRE se resuelve acá contra el catálogo real y la lista
        // del cliente — no se confía en el precio que mande el body, aunque el
        // renglón lo lleve congelado después de este punto (invariante 6)
        const idsProducto = [...new Set((b.renglones || []).map((r) => r.producto))];
        const productos = await Promise.all(idsProducto.map((pid) => repoCatalogo.productoPorId(pid)));
        const mapaProductos = new Map(productos.filter(Boolean).map((p) => [p.id, p]));
        const renglones = (b.renglones || []).map((r) => {
          const producto = mapaProductos.get(r.producto);
          if (!producto) throw Object.assign(new Error(`no existe el producto ${r.producto}`), { codigo: 'NO_EXISTE' });
          return { producto: r.producto, cantidad: r.cantidad, precio: (producto.precios || {})[cliente.lista] || 0, lista: cliente.lista };
        });

        // el repartidor de la venta es quien está logueado — no algo que mande
        // el body, si no cualquiera con permiso VENDER podría vender "como" otro
        const venta = armarVenta({
          id: idVenta(), cliente: b.cliente, repartidor: sujeto.usuario, renglones,
          medioPago: b.medioPago, punto: b.punto,
        });
        const camioneta = `camioneta:${sujeto.usuario}`;
        const asientos = asientosDeVenta(venta, camioneta).map((a) => ({ ...a, id: idAsiento(), fecha: venta.fecha, autor: sujeto.usuario, dispositivo: 'srv' }));
        asientos.forEach(validarAsiento);
        validarStockParaAsientos(await asientosRelevantes(repoLibro, asientos), asientos);
        await repoVentas.guardarVentaConAsientos(venta, asientos, repoLibro);
        await capturarPuntoSiCorresponde(repoClientes, cliente, b.punto);
        return json(venta, 201);
      }

      if (url.pathname === '/api/ventas' && req.method === 'GET') {
        return json(await repoVentas.listarVentas());
      }

      if (url.pathname === '/api/no-ventas' && req.method === 'GET') {
        return json(await repoNoVentas.listarNoVentas());
      }

      if (url.pathname === '/api/no-ventas' && req.method === 'POST') {
        exigir(sujeto, ACCIONES.REGISTRAR_NO_VENTA);
        const b = await cuerpo(req);
        if (!b.cliente || !b.motivo) return json({ error: 'DATOS_INCOMPLETOS', mensaje: 'falta el cliente o el motivo' }, 400);
        const noVenta = { id: crypto.randomUUID(), fecha: new Date().toISOString(), cliente: b.cliente, repartidor: sujeto.usuario, motivo: b.motivo, detalle: b.detalle };
        await repoNoVentas.guardarNoVenta(noVenta);
        return json(noVenta, 201);
      }

      // -- encargues --
      if (url.pathname === '/api/encargues' && req.method === 'GET') {
        return json(await repoEncargues.listarEncargues());
      }

      if (url.pathname === '/api/encargues' && req.method === 'POST') {
        exigir(sujeto, ACCIONES.TOMAR_ENCARGUE);
        const b = await cuerpo(req);
        const encargue = armarEncargue({ id: idEncargue(), cliente: b.cliente, autor: sujeto.usuario, renglones: b.renglones });
        await repoEncargues.crearEncargue(encargue);
        return json(encargue, 201);
      }

      const prepararEncargue = url.pathname.match(/^\/api\/encargues\/([^/]+)\/preparar$/);
      if (prepararEncargue && req.method === 'POST') {
        exigir(sujeto, ACCIONES.PREPARAR_ENCARGUE);
        const id = decodeURIComponent(prepararEncargue[1]);
        const encargue = await repoEncargues.encarguePorId(id);
        if (!encargue) return json({ error: 'NO_EXISTE', mensaje: `no existe el encargue ${id}` }, 404);
        exigirTransicion(encargue, 'preparado');
        await repoEncargues.actualizarEstado(id, { estado: 'preparado' });
        return json({ ...encargue, estado: 'preparado' });
      }

      const vincularEncargue = url.pathname.match(/^\/api\/encargues\/([^/]+)\/vincular$/);
      if (vincularEncargue && req.method === 'POST') {
        exigir(sujeto, ACCIONES.VINCULAR_ENCARGUE_ESPECIAL);
        const id = decodeURIComponent(vincularEncargue[1]);
        const encargue = await repoEncargues.encarguePorId(id);
        if (!encargue) return json({ error: 'NO_EXISTE', mensaje: `no existe el encargue ${id}` }, 404);
        const b = await cuerpo(req);
        vincularProductoEspecial(encargue, b.indice, b.productoId);   // valida, tira si no corresponde
        await repoEncargues.vincularRenglon(id, b.indice, b.productoId);
        return json(await repoEncargues.encarguePorId(id));
      }

      const entregarEncargue = url.pathname.match(/^\/api\/encargues\/([^/]+)\/entregar$/);
      if (entregarEncargue && req.method === 'POST') {
        exigir(sujeto, ACCIONES.ENTREGAR_ENCARGUE);
        const id = decodeURIComponent(entregarEncargue[1]);
        const encargue = await repoEncargues.encarguePorId(id);
        if (!encargue) return json({ error: 'NO_EXISTE', mensaje: `no existe el encargue ${id}` }, 404);
        const b = await cuerpo(req);
        const cliente = await repoClientes.clientePorId(encargue.cliente);
        if (!cliente) return json({ error: 'NO_EXISTE', mensaje: 'el cliente de este encargue ya no existe' }, 404);

        // armarVentaDesdeEncargue() es un motor puro y síncrono — se resuelven
        // acá los productos que puede llegar a necesitar (catálogo + vinculados),
        // antes de llamarlo, para no meterle await al motor.
        const idsProducto = [...new Set(encargue.renglones.map((r) => (r.tipo === 'catalogo' ? r.producto : r.productoVinculado)))];
        const productos = await Promise.all(idsProducto.filter(Boolean).map((pid) => repoCatalogo.productoPorId(pid)));
        const mapaProductos = new Map(productos.filter(Boolean).map((p) => [p.id, p]));

        const venta = armarVentaDesdeEncargue({
          encargue, ventaId: idVenta(), repartidor: sujeto.usuario, clienteLista: cliente.lista,
          productoPorId: (pid) => mapaProductos.get(pid), medioPago: b.medioPago, punto: b.punto,
        });
        const camioneta = `camioneta:${sujeto.usuario}`;
        const asientos = asientosDeVenta(venta, camioneta, { motivo: 'entrega de encargue ' + encargue.id })
          .map((a) => ({ ...a, id: idAsiento(), fecha: venta.fecha, autor: sujeto.usuario, dispositivo: 'srv' }));
        asientos.forEach(validarAsiento);
        validarStockParaAsientos(await asientosRelevantes(repoLibro, asientos), asientos);
        await repoVentas.guardarVentaConAsientos(venta, asientos, repoLibro);
        await repoEncargues.actualizarEstado(id, { estado: 'entregado', ventaId: venta.id });
        await capturarPuntoSiCorresponde(repoClientes, cliente, b.punto);
        return json(venta, 201);
      }

      const cancelarEncargue = url.pathname.match(/^\/api\/encargues\/([^/]+)\/cancelar$/);
      if (cancelarEncargue && req.method === 'POST') {
        if (!puede(sujeto, ACCIONES.TOMAR_ENCARGUE).ok && !puede(sujeto, ACCIONES.PREPARAR_ENCARGUE).ok) {
          return json({ error: 'NO_AUTORIZADO', mensaje: 'no autorizado a cancelar encargues' }, 403);
        }
        const id = decodeURIComponent(cancelarEncargue[1]);
        const encargue = await repoEncargues.encarguePorId(id);
        if (!encargue) return json({ error: 'NO_EXISTE', mensaje: `no existe el encargue ${id}` }, 404);
        exigirTransicion(encargue, 'cancelado');
        const b = await cuerpo(req);
        await repoEncargues.actualizarEstado(id, { estado: 'cancelado', motivo: b.motivo || '' });
        return json({ ...encargue, estado: 'cancelado', motivo: b.motivo || '' });
      }

      return json({ error: 'NO_ENCONTRADO', mensaje: `sin ruta para ${req.method} ${url.pathname}` }, 404);
    } catch (e) {
      return errorJson(e);
    }
  },
};

export const ROLES_DISPONIBLES = Object.values(ROLES);
