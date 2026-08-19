/* ==========================================================================
   Repositorios sobre D1 · DZ-SEG-01
   --------------------------------------------------------------------------
   El cable entre los motores puros de `app/core/*.js` (que no saben qué es
   D1, ni falta que les hace) y la base real. Mismo principio que
   `crearRepositorioAutenticacion()`/`crearRepositorioUsuarios()` en memoria
   que usan los tests — esto es la misma forma, contra SQL de verdad.

   Sin ORM: son statements preparados, uno por operación. A este tamaño de
   esquema, un ORM es una dependencia que abstrae seis tablas.
   ========================================================================== */

const aISO = (f) => (f instanceof Date ? f.toISOString() : f);

/* ─────────────────────────── Autenticación ─────────────────────────────── */

export function repositorioAutenticacionD1(db) {
  return {
    /* El ticket del paso intermedio del login — ver la nota en
       app/core/autenticacion.js sobre por qué esto no puede ser una
       variable en memoria del Worker. */
    async guardarTicket(id, datos) {
      await db.prepare('INSERT INTO tickets (id, datos, expira) VALUES (?,?,?)').bind(
        id,
        JSON.stringify({ usuario: datos.usuario, ip: datos.ip, userAgent: datos.userAgent, secretoPendiente: datos.secretoPendiente }),
        aISO(datos.expira),
      ).run();
    },
    async ticketPorId(id) {
      const r = await db.prepare('SELECT datos, expira FROM tickets WHERE id = ?').bind(id).first();
      if (!r) return null;
      return { ...JSON.parse(r.datos), expira: new Date(r.expira) };
    },
    async borrarTicket(id) {
      await db.prepare('DELETE FROM tickets WHERE id = ?').bind(id).run();
    },

    async claveDe(usuario) {
      const r = await db.prepare('SELECT hash FROM credenciales WHERE usuario = ?').bind(usuario).first();
      return r ? { usuario, hash: r.hash } : null;
    },
    async guardarClave(usuario, hash) {
      await db.prepare(
        `INSERT INTO credenciales (usuario, hash) VALUES (?,?)
         ON CONFLICT(usuario) DO UPDATE SET hash = excluded.hash`
      ).bind(usuario, hash).run();
    },

    async totpDe(usuario) {
      const r = await db.prepare('SELECT secreto, confirmado, ultimo_paso FROM totp WHERE usuario = ?').bind(usuario).first();
      return r ? { secreto: r.secreto, confirmado: Boolean(r.confirmado), ultimoPaso: r.ultimo_paso } : null;
    },
    async guardarTotp(usuario, secreto, confirmado) {
      await db.prepare(
        `INSERT INTO totp (usuario, secreto, confirmado, ultimo_paso) VALUES (?,?,?,NULL)
         ON CONFLICT(usuario) DO UPDATE SET secreto = excluded.secreto, confirmado = excluded.confirmado`
      ).bind(usuario, secreto, confirmado ? 1 : 0).run();
    },
    async marcarPasoTotp(usuario, paso) {
      await db.prepare('UPDATE totp SET ultimo_paso = ? WHERE usuario = ?').bind(paso, usuario).run();
    },

    async registrarIntento({ usuario, exito, ip, fecha }) {
      await db.prepare('INSERT INTO intentos_login (usuario, exito, ip, fecha) VALUES (?,?,?,?)')
        .bind(usuario, exito ? 1 : 0, ip, aISO(fecha)).run();
    },
    async intentosFallidosDesde(usuario, desde) {
      const r = await db.prepare(
        'SELECT COUNT(*) AS n FROM intentos_login WHERE usuario = ? AND exito = 0 AND fecha >= ?'
      ).bind(usuario, aISO(desde)).first();
      return Number(r?.n ?? 0);
    },

    async guardarSesion(s) {
      await db.prepare(
        `INSERT INTO sesiones (token_hash, usuario, creada_en, ultima_actividad, expira_en, revocada_en, ip, user_agent)
         VALUES (?,?,?,?,?,?,?,?)`
      ).bind(s.tokenHash, s.usuario, aISO(s.creadaEn), aISO(s.ultimaActividad), aISO(s.expiraEn), aISO(s.revocadaEn), s.ip, s.userAgent).run();
      return s;
    },
    async sesionPorTokenHash(h) {
      const r = await db.prepare('SELECT * FROM sesiones WHERE token_hash = ?').bind(h).first();
      if (!r) return null;
      return {
        tokenHash: r.token_hash, usuario: r.usuario,
        creadaEn: new Date(r.creada_en), ultimaActividad: new Date(r.ultima_actividad),
        expiraEn: new Date(r.expira_en), revocadaEn: r.revocada_en ? new Date(r.revocada_en) : null,
        ip: r.ip, userAgent: r.user_agent,
      };
    },
    async actualizarSesion(tokenHash, campos) {
      const sets = [], vals = [];
      if ('ultimaActividad' in campos) { sets.push('ultima_actividad = ?'); vals.push(aISO(campos.ultimaActividad)); }
      if ('revocadaEn' in campos) { sets.push('revocada_en = ?'); vals.push(campos.revocadaEn ? aISO(campos.revocadaEn) : null); }
      if (!sets.length) return;
      vals.push(tokenHash);
      await db.prepare(`UPDATE sesiones SET ${sets.join(', ')} WHERE token_hash = ?`).bind(...vals).run();
    },
    async revocarSesionesDe(usuario, fecha) {
      await db.prepare('UPDATE sesiones SET revocada_en = ? WHERE usuario = ? AND revocada_en IS NULL')
        .bind(aISO(fecha), usuario).run();
    },
  };
}

/* ─────────────────────────────── Usuarios ──────────────────────────────── */

export function repositorioUsuariosD1(db) {
  const fila = (r) => r && ({
    id: r.id, usuario: r.usuario, nombre: r.nombre, rol: r.rol, empresaId: r.empresa_id,
    activo: Boolean(r.activo), creadoEn: new Date(r.creado_en), creadoPor: r.creado_por,
  });

  return {
    async hayUsuarios() {
      const r = await db.prepare('SELECT COUNT(*) AS n FROM usuarios').first();
      return Number(r?.n ?? 0) > 0;
    },
    async usuarioPorNombre(usuario) {
      const r = await db.prepare('SELECT * FROM usuarios WHERE usuario = ?').bind(usuario).first();
      return fila(r);
    },
    async guardarUsuario(u) {
      await db.prepare(
        `INSERT INTO usuarios (id, usuario, nombre, rol, empresa_id, activo, creado_en, creado_por)
         VALUES (?,?,?,?,?,?,?,?)
         ON CONFLICT(usuario) DO UPDATE SET nombre = excluded.nombre, rol = excluded.rol, activo = excluded.activo`
      ).bind(u.id, u.usuario, u.nombre, u.rol, u.empresaId, u.activo ? 1 : 0, aISO(u.creadoEn), u.creadoPor).run();
      return u;
    },
    async listarUsuarios(empresaId) {
      const { results } = await db.prepare('SELECT * FROM usuarios WHERE empresa_id = ? ORDER BY creado_en').bind(empresaId).all();
      return results.map(fila);
    },
    async siguienteId() { return 'u_' + crypto.randomUUID(); },
  };
}

/* ─────────────────────────────── Auditoría ─────────────────────────────── */

export function auditoriaD1(db) {
  return {
    async registrar({ accion, sujeto = null, ip = null, detalle = null }) {
      const id = crypto.randomUUID();
      await db.prepare(
        `INSERT INTO auditoria (id, fecha, accion, sujeto_id, sujeto_usuario, sujeto_rol, ip, detalle)
         VALUES (?,?,?,?,?,?,?,?)`
      ).bind(id, new Date().toISOString(), accion, sujeto?.id ?? null, sujeto?.usuario ?? null, sujeto?.rol ?? null,
             ip, detalle ? JSON.stringify(detalle) : null).run();
      return { id };
    },
    async listar({ desde = null, accion = null, usuario = null } = {}) {
      let q = 'SELECT * FROM auditoria WHERE 1=1';
      const vals = [];
      if (desde) { q += ' AND fecha >= ?'; vals.push(desde); }
      if (accion) { q += ' AND accion = ?'; vals.push(accion); }
      if (usuario) { q += ' AND sujeto_usuario = ?'; vals.push(usuario); }
      q += ' ORDER BY fecha DESC LIMIT 500';
      const { results } = await db.prepare(q).bind(...vals).all();
      return results.map((r) => ({ ...r, detalle: r.detalle ? JSON.parse(r.detalle) : null }));
    },
  };
}
