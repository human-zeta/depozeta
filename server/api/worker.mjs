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
import { crearSujeto, ROLES } from '../../app/core/autorizacion.js';
import { repositorioAutenticacionD1, repositorioUsuariosD1, auditoriaD1 } from './repo-d1.mjs';

/* ------------------------------- Utilidades -------------------------------- */

const ENCABEZADOS_BASE = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',   // ver server/api/README.md — a acotar cuando haya dominio final
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(datos, estado = 200) {
  return new Response(JSON.stringify(datos), { status: estado, headers: ENCABEZADOS_BASE });
}

/* Traduce el código de error del dominio (puesto por los motores) a HTTP.
   Un solo lugar — el resto del archivo nunca elige un status a mano. */
const HTTP_POR_CODIGO = {
  DATOS_INCOMPLETOS: 400, CLAVE_DEBIL: 400, CODIGO_INVALIDO: 400,
  CREDENCIALES_INVALIDAS: 401, TICKET_INVALIDO: 401, SIN_SESION: 401,
  CUENTA_INACTIVA: 403, NO_AUTORIZADO: 403,
  YA_EXISTE: 409, YA_INICIALIZADO: 409, NO_EXISTE: 404,
  INTENTOS_EXCEDIDOS: 429,
};

function errorJson(e) {
  const estado = HTTP_POR_CODIGO[e?.codigo] ?? 500;
  if (estado === 500) console.error('error no mapeado:', e);
  return json({ error: e?.codigo ?? 'ERROR_INTERNO', mensaje: e?.message ?? 'error interno' }, estado);
}

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

  return { auth, usuarios, repoUsuarios };
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
    if (req.method === 'OPTIONS') return new Response(null, { headers: ENCABEZADOS_BASE });

    const url = new URL(req.url);
    const { auth, usuarios, repoUsuarios } = armarMotores(env);

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

      return json({ error: 'NO_ENCONTRADO', mensaje: `sin ruta para ${req.method} ${url.pathname}` }, 404);
    } catch (e) {
      return errorJson(e);
    }
  },
};

export const ROLES_DISPONIBLES = Object.values(ROLES);
