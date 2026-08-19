/* ==========================================================================
   Repositorios del libro operativo sobre D1 · DZ-MOD-01
   --------------------------------------------------------------------------
   Mismo principio que repo-d1.mjs: SQL directo, sin ORM, una función por
   operación. Las escrituras compuestas (una venta con sus renglones y sus
   asientos, un encargue con sus renglones) usan `db.batch()` — D1 las
   corre como una sola transacción, así que nunca queda una venta sin sus
   asientos o viceversa.
   ========================================================================== */

const EMPRESA = 'default';   // hoy sólo hay una — ver DZ-SEG-01 sobre el rol ADMIN
const bJson = (v) => (v == null ? null : JSON.stringify(v));
const pJson = (v) => (v == null ? null : JSON.parse(v));

/* ─────────────────────────────── Catálogo ──────────────────────────────── */

export function repositorioCatalogoD1(db) {
  const filaProducto = (r, precios) => r && ({
    id: r.id, nombre: r.nombre, rubro: r.rubro, unidad: r.unidad, porBulto: r.por_bulto,
    costo: r.costo, costoActualizado: r.costo_actualizado, vence: Boolean(r.vence),
    retornable: Boolean(r.retornable), activo: Boolean(r.activo),
    precios: Object.fromEntries((precios || []).map((p) => [p.lista, p.precio])),
  });

  return {
    async productoPorId(id) {
      const r = await db.prepare('SELECT * FROM productos WHERE id = ? AND empresa_id = ?').bind(id, EMPRESA).first();
      if (!r) return null;
      const { results } = await db.prepare('SELECT lista, precio FROM productos_precios WHERE producto_id = ?').bind(id).all();
      return filaProducto(r, results);
    },
    async listarProductos() {
      const { results } = await db.prepare('SELECT * FROM productos WHERE empresa_id = ? ORDER BY rubro, nombre').bind(EMPRESA).all();
      const { results: precios } = await db.prepare(
        `SELECT pp.* FROM productos_precios pp JOIN productos p ON p.id = pp.producto_id WHERE p.empresa_id = ?`
      ).bind(EMPRESA).all();
      const porProducto = {};
      for (const p of precios) (porProducto[p.producto_id] ||= []).push(p);
      return results.map((r) => filaProducto(r, porProducto[r.id]));
    },
    async guardarProducto(p) {
      await db.prepare(
        `INSERT INTO productos (id, empresa_id, nombre, rubro, unidad, por_bulto, costo, costo_actualizado, vence, retornable, activo)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET nombre=excluded.nombre, rubro=excluded.rubro, unidad=excluded.unidad,
           por_bulto=excluded.por_bulto, costo=excluded.costo, costo_actualizado=excluded.costo_actualizado,
           vence=excluded.vence, retornable=excluded.retornable, activo=excluded.activo`
      ).bind(p.id, EMPRESA, p.nombre, p.rubro, p.unidad, p.porBulto, p.costo, p.costoActualizado,
        p.vence ? 1 : 0, p.retornable ? 1 : 0, p.activo ? 1 : 0).run();

      const statements = Object.entries(p.precios || {}).map(([lista, precio]) =>
        db.prepare(
          `INSERT INTO productos_precios (producto_id, lista, precio) VALUES (?,?,?)
           ON CONFLICT(producto_id, lista) DO UPDATE SET precio = excluded.precio`
        ).bind(p.id, lista, precio)
      );
      if (statements.length) await db.batch(statements);
      return p;
    },
  };
}

/* ─────────────────────────────── Clientes ──────────────────────────────── */

export function repositorioClientesD1(db) {
  const fila = (r) => r && ({
    id: r.id, nombre: r.nombre, contacto: r.contacto, tel: r.tel, dir: r.dir, ref: r.ref,
    zona: r.zona, orden: r.orden, lista: r.lista, dias: pJson(r.dias) || [],
    punto: r.punto_lat == null ? null : { lat: r.punto_lat, lng: r.punto_lng, aproximado: Boolean(r.punto_aproximado), nuevo: Boolean(r.punto_nuevo) },
    ultima: r.ultima, notas: r.notas, recibe: pJson(r.recibe), activo: Boolean(r.activo),
  });

  return {
    async clientePorId(id) {
      return fila(await db.prepare('SELECT * FROM clientes WHERE id = ? AND empresa_id = ?').bind(id, EMPRESA).first());
    },
    async listarClientes() {
      const { results } = await db.prepare('SELECT * FROM clientes WHERE empresa_id = ? ORDER BY zona, orden').bind(EMPRESA).all();
      return results.map(fila);
    },
    async idsExistentes() {
      const { results } = await db.prepare('SELECT id FROM clientes WHERE empresa_id = ?').bind(EMPRESA).all();
      return results.map((r) => r.id);
    },
    async guardarCliente(c) {
      await db.prepare(
        `INSERT INTO clientes (id, empresa_id, nombre, contacto, tel, dir, ref, zona, orden, lista, dias,
           punto_lat, punto_lng, punto_aproximado, punto_nuevo, ultima, notas, recibe, activo)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET nombre=excluded.nombre, contacto=excluded.contacto, tel=excluded.tel,
           dir=excluded.dir, ref=excluded.ref, zona=excluded.zona, orden=excluded.orden, lista=excluded.lista,
           dias=excluded.dias, punto_lat=excluded.punto_lat, punto_lng=excluded.punto_lng,
           punto_aproximado=excluded.punto_aproximado, punto_nuevo=excluded.punto_nuevo, ultima=excluded.ultima,
           notas=excluded.notas, recibe=excluded.recibe, activo=excluded.activo`
      ).bind(
        c.id, EMPRESA, c.nombre, c.contacto, c.tel, c.dir, c.ref, c.zona, c.orden, c.lista, bJson(c.dias),
        c.punto ? c.punto.lat : null, c.punto ? c.punto.lng : null, c.punto && c.punto.aproximado ? 1 : 0,
        c.punto && c.punto.nuevo ? 1 : 0, c.ultima, c.notas, bJson(c.recibe), c.activo ? 1 : 0
      ).run();
      return c;
    },
  };
}

/* ─────────────────────────────────── Libro ─────────────────────────────── */

export function repositorioLibroD1(db) {
  const fila = (r) => r && ({
    id: r.id, fecha: r.fecha, tipo: r.tipo, origen: r.origen, destino: r.destino,
    producto: r.producto_id, cantidad: r.cantidad, autor: r.autor, dispositivo: r.dispositivo,
    motivo: r.motivo, ref: r.ref, anula: r.anula,
  });

  return {
    async listarAsientos() {
      const { results } = await db.prepare('SELECT * FROM asientos WHERE empresa_id = ? ORDER BY fecha').bind(EMPRESA).all();
      return results.map(fila);
    },
    async asientosDeProducto(producto) {
      const { results } = await db.prepare('SELECT * FROM asientos WHERE empresa_id = ? AND producto_id = ? ORDER BY fecha')
        .bind(EMPRESA, producto).all();
      return results.map(fila);
    },
    /* statement listo para .batch() — quien orquesta la transacción es quien
       llama (una venta necesita sus asientos Y su cabecera atómicos). */
    statementAsiento(a) {
      return db.prepare(
        `INSERT INTO asientos (id, empresa_id, fecha, tipo, origen, destino, producto_id, cantidad, autor, dispositivo, motivo, ref, anula)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(a.id, EMPRESA, a.fecha, a.tipo, a.origen, a.destino, a.producto, a.cantidad,
        a.autor || null, a.dispositivo || null, a.motivo || null, a.ref || null, a.anula || null);
    },
    async crearAsiento(a) {
      await db.batch([this.statementAsiento(a)]);
      return a;
    },
  };
}

/* ─────────────────────────────────── Ventas ─────────────────────────────── */

export function repositorioVentasD1(db) {
  const filaVenta = (r, renglones) => r && ({
    id: r.id, fecha: r.fecha, cliente: r.cliente_id, repartidor: r.repartidor, total: r.total,
    medioPago: r.medio_pago, remito: r.remito,
    punto: r.punto_lat == null ? null : { lat: r.punto_lat, lng: r.punto_lng },
    renglones: (renglones || []).map((x) => ({ producto: x.producto_id, cantidad: x.cantidad, precio: x.precio, lista: x.lista })),
  });

  return {
    async listarVentas() {
      const { results } = await db.prepare('SELECT * FROM ventas WHERE empresa_id = ? ORDER BY fecha').bind(EMPRESA).all();
      const { results: renglones } = await db.prepare(
        `SELECT vr.* FROM venta_renglones vr JOIN ventas v ON v.id = vr.venta_id WHERE v.empresa_id = ?`
      ).bind(EMPRESA).all();
      const porVenta = {};
      for (const r of renglones) (porVenta[r.venta_id] ||= []).push(r);
      return results.map((r) => filaVenta(r, porVenta[r.id]));
    },
    /* Venta + renglones + los asientos que la acompañan, todo o nada —
       `asientos` ya vienen armados y validados por quien llama (worker.mjs,
       usando app/core/ventas.js). */
    async guardarVentaConAsientos(venta, asientos, repoLibro) {
      const statements = [
        db.prepare(
          `INSERT INTO ventas (id, empresa_id, fecha, cliente_id, repartidor, total, medio_pago, remito, punto_lat, punto_lng)
           VALUES (?,?,?,?,?,?,?,?,?,?)`
        ).bind(venta.id, EMPRESA, venta.fecha, venta.cliente, venta.repartidor, venta.total, venta.medioPago,
          venta.remito, venta.punto ? venta.punto.lat : null, venta.punto ? venta.punto.lng : null),
        ...venta.renglones.map((r) =>
          db.prepare('INSERT INTO venta_renglones (venta_id, producto_id, cantidad, precio, lista) VALUES (?,?,?,?,?)')
            .bind(venta.id, r.producto, r.cantidad, r.precio, r.lista)
        ),
        ...asientos.map((a) => repoLibro.statementAsiento(a)),
      ];
      await db.batch(statements);
      return venta;
    },
  };
}

export function repositorioNoVentasD1(db) {
  return {
    async listarNoVentas() {
      const { results } = await db.prepare('SELECT * FROM no_ventas WHERE empresa_id = ? ORDER BY fecha').bind(EMPRESA).all();
      return results.map((r) => ({ id: r.id, fecha: r.fecha, cliente: r.cliente_id, repartidor: r.repartidor, motivo: r.motivo, detalle: r.detalle }));
    },
    async guardarNoVenta(n) {
      await db.prepare('INSERT INTO no_ventas (id, empresa_id, fecha, cliente_id, repartidor, motivo, detalle) VALUES (?,?,?,?,?,?,?)')
        .bind(n.id, EMPRESA, n.fecha, n.cliente, n.repartidor || null, n.motivo, n.detalle || null).run();
      return n;
    },
  };
}

/* ─────────────────────────────────── Encargues ──────────────────────────── */

export function repositorioEncarguesD1(db) {
  const filaRenglon = (r) => ({
    tipo: r.tipo, producto: r.producto_id, descripcion: r.descripcion, cantidad: r.cantidad, productoVinculado: r.producto_vinculado,
  });
  const filaEncargue = (r, renglones) => r && ({
    id: r.id, fecha: r.fecha, cliente: r.cliente_id, autor: r.autor, estado: r.estado,
    motivo: r.motivo, ventaId: r.venta_id, renglones: (renglones || []).map(filaRenglon),
  });

  return {
    async encarguePorId(id) {
      const r = await db.prepare('SELECT * FROM encargues WHERE id = ? AND empresa_id = ?').bind(id, EMPRESA).first();
      if (!r) return null;
      const { results } = await db.prepare('SELECT * FROM encargue_renglones WHERE encargue_id = ? ORDER BY id').bind(id).all();
      return filaEncargue(r, results);
    },
    async listarEncargues() {
      const { results } = await db.prepare('SELECT * FROM encargues WHERE empresa_id = ? ORDER BY fecha').bind(EMPRESA).all();
      const { results: renglones } = await db.prepare(
        `SELECT er.* FROM encargue_renglones er JOIN encargues e ON e.id = er.encargue_id WHERE e.empresa_id = ? ORDER BY er.id`
      ).bind(EMPRESA).all();
      const porEncargue = {};
      for (const r of renglones) (porEncargue[r.encargue_id] ||= []).push(r);
      return results.map((r) => filaEncargue(r, porEncargue[r.id]));
    },
    async crearEncargue(enc) {
      const statements = [
        db.prepare('INSERT INTO encargues (id, empresa_id, fecha, cliente_id, autor, estado, motivo, venta_id) VALUES (?,?,?,?,?,?,?,?)')
          .bind(enc.id, EMPRESA, enc.fecha, enc.cliente, enc.autor, enc.estado, enc.motivo || null, enc.ventaId),
        ...enc.renglones.map((r) =>
          db.prepare('INSERT INTO encargue_renglones (encargue_id, tipo, producto_id, descripcion, cantidad, producto_vinculado) VALUES (?,?,?,?,?,?)')
            .bind(enc.id, r.tipo, r.producto || null, r.descripcion || null, r.cantidad, r.productoVinculado || null)
        ),
      ];
      await db.batch(statements);
      return enc;
    },
    async actualizarEstado(id, campos) {
      const sets = [], vals = [];
      if ('estado' in campos) { sets.push('estado = ?'); vals.push(campos.estado); }
      if ('motivo' in campos) { sets.push('motivo = ?'); vals.push(campos.motivo); }
      if ('ventaId' in campos) { sets.push('venta_id = ?'); vals.push(campos.ventaId); }
      vals.push(id, EMPRESA);
      await db.prepare(`UPDATE encargues SET ${sets.join(', ')} WHERE id = ? AND empresa_id = ?`).bind(...vals).run();
    },
    async vincularRenglon(encargueId, indice, productoId) {
      const { results } = await db.prepare('SELECT id FROM encargue_renglones WHERE encargue_id = ? ORDER BY id').bind(encargueId).all();
      const fila = results[indice];
      if (!fila) return false;
      await db.prepare('UPDATE encargue_renglones SET producto_vinculado = ? WHERE id = ?').bind(productoId, fila.id).run();
      return true;
    },
  };
}

/* ─────────────────────────────────── Zonas ──────────────────────────────── */

export function repositorioZonasD1(db) {
  const fila = (r) => r && ({ id: r.id, nombre: r.nombre, lat: r.lat, lng: r.lng, radio: r.radio, motivo: r.motivo, hastaHora: r.hasta_hora });

  return {
    async listarZonas() {
      const { results } = await db.prepare('SELECT * FROM zonas_evitar WHERE empresa_id = ? ORDER BY id').bind(EMPRESA).all();
      return results.map(fila);
    },
    async guardarZona(z) {
      await db.prepare('INSERT INTO zonas_evitar (id, empresa_id, nombre, lat, lng, radio, motivo, hasta_hora) VALUES (?,?,?,?,?,?,?,?)')
        .bind(z.id, EMPRESA, z.nombre, z.lat, z.lng, z.radio, z.motivo || null, z.hastaHora).run();
      return z;
    },
    async eliminarZona(id) {
      await db.prepare('DELETE FROM zonas_evitar WHERE id = ? AND empresa_id = ?').bind(id, EMPRESA).run();
    },
    /* máximo existente, no conteo — una zona borrada no puede hacer que el
       siguiente id choque con una que ya quedó (mismo criterio que clientes). */
    async siguienteIdZona() {
      const { results } = await db.prepare('SELECT id FROM zonas_evitar WHERE empresa_id = ?').bind(EMPRESA).all();
      const max = results.reduce((m, r) => Math.max(m, parseInt(String(r.id).slice(1), 10) || 0), 0);
      return 'Z' + (max + 1);
    },
  };
}
