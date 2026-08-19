-- depo zeta — esquema D1 · DZ-SEG-01 / DZ-MOD-01
--
-- Dos familias de tablas:
--   1. Seguridad (usuarios, credenciales, totp, sesiones, intentos, auditoria)
--   2. Operación (el libro de asientos de DZ-MOD-01: clientes, productos,
--      asientos, ventas, encargues, zonas)
--
-- `empresa_id` está en todo, con valor 'default' hoy — el modelo ya
-- soporta más de una empresa aunque el producto todavía sólo vende a una.

-- ───────────────────────────── Seguridad ─────────────────────────────────

CREATE TABLE IF NOT EXISTS usuarios (
  id          TEXT PRIMARY KEY,
  usuario     TEXT NOT NULL UNIQUE,
  nombre      TEXT NOT NULL,
  rol         TEXT NOT NULL CHECK (rol IN ('ADMIN','DEPOSITO','REPARTIDOR')),
  empresa_id  TEXT NOT NULL DEFAULT 'default',
  activo      INTEGER NOT NULL DEFAULT 1,
  creado_en   TEXT NOT NULL,
  creado_por  TEXT
);

-- Sin FOREIGN KEY a usuarios(usuario) a propósito: establecerClave() se
-- llama ANTES de crear la fila en usuarios (así, si la clave es débil, no
-- queda un usuario a medio crear — hay test para eso). La consistencia la
-- garantiza el código de app/core/usuarios.js, no una constraint de acá.
CREATE TABLE IF NOT EXISTS credenciales (
  usuario TEXT PRIMARY KEY,
  hash    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS totp (
  usuario     TEXT PRIMARY KEY,
  secreto     TEXT,
  confirmado  INTEGER NOT NULL DEFAULT 0,
  ultimo_paso INTEGER
);

-- El paso intermedio del login (clave verificada, falta el código TOTP).
-- Tiene que vivir en la base, no en memoria del Worker — una instancia
-- puede atender el paso 1 y otra distinta el paso 2.
CREATE TABLE IF NOT EXISTS tickets (
  id     TEXT PRIMARY KEY,
  datos  TEXT NOT NULL,   -- JSON: usuario, ip, userAgent, secretoPendiente
  expira TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS intentos_login (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario TEXT NOT NULL,
  exito   INTEGER NOT NULL,
  ip      TEXT,
  fecha   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_intentos_usuario_fecha ON intentos_login(usuario, fecha);

CREATE TABLE IF NOT EXISTS sesiones (
  token_hash       TEXT PRIMARY KEY,
  usuario          TEXT NOT NULL,
  creada_en        TEXT NOT NULL,
  ultima_actividad TEXT NOT NULL,
  expira_en        TEXT NOT NULL,
  revocada_en      TEXT,
  ip               TEXT,
  user_agent       TEXT
);
CREATE INDEX IF NOT EXISTS idx_sesiones_usuario ON sesiones(usuario);

CREATE TABLE IF NOT EXISTS auditoria (
  id             TEXT PRIMARY KEY,
  fecha          TEXT NOT NULL,
  accion         TEXT NOT NULL,
  sujeto_id      TEXT,
  sujeto_usuario TEXT,
  sujeto_rol     TEXT,
  ip             TEXT,
  detalle        TEXT   -- JSON
);
CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON auditoria(fecha);

-- ───────────────────────────── Operación ─────────────────────────────────
-- Mapea DZ-MOD-01 casi literal. `asientos` es el libro: append-only, nunca
-- se edita ni se borra una fila — corregir es un asiento nuevo con `anula`.

CREATE TABLE IF NOT EXISTS clientes (
  id              TEXT PRIMARY KEY,
  empresa_id      TEXT NOT NULL DEFAULT 'default',
  nombre          TEXT NOT NULL,
  contacto        TEXT,
  tel             TEXT,
  dir             TEXT NOT NULL,
  ref             TEXT,
  zona            TEXT,
  orden           INTEGER,
  lista           TEXT,
  dias            TEXT,   -- JSON: [1,4]
  punto_lat       REAL,
  punto_lng       REAL,
  punto_aproximado INTEGER DEFAULT 0,
  punto_nuevo     INTEGER DEFAULT 0,
  ultima          INTEGER,   -- días desde la última visita, calculado en cliente
  notas           TEXT,
  recibe          TEXT,   -- JSON: [[8,13],[16,19]]
  activo          INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS productos (
  id                TEXT PRIMARY KEY,
  empresa_id        TEXT NOT NULL DEFAULT 'default',
  nombre            TEXT NOT NULL,
  rubro             TEXT,
  unidad            TEXT,
  por_bulto         INTEGER DEFAULT 1,
  costo             REAL NOT NULL DEFAULT 0,
  costo_actualizado TEXT,
  vence             INTEGER DEFAULT 0,
  retornable        INTEGER DEFAULT 0,
  activo            INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS productos_precios (
  producto_id TEXT NOT NULL REFERENCES productos(id),
  lista       TEXT NOT NULL,
  precio      REAL NOT NULL,
  PRIMARY KEY (producto_id, lista)
);

-- El libro. `id` lleva `{dispositivo}-{contador}` desde el cliente — la
-- sincronización es apilar por ese id, nunca fusionar (DZ-MOD-01).
CREATE TABLE IF NOT EXISTS asientos (
  id         TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL DEFAULT 'default',
  fecha      TEXT NOT NULL,
  tipo       TEXT NOT NULL CHECK (tipo IN ('compra','carga','venta','devolucion_cliente','descarga','merma','ajuste')),
  origen     TEXT NOT NULL,
  destino    TEXT NOT NULL,
  producto_id TEXT NOT NULL,
  cantidad   REAL NOT NULL CHECK (cantidad > 0),
  autor      TEXT,
  dispositivo TEXT,
  motivo     TEXT,
  ref        TEXT,
  anula      TEXT
);
CREATE INDEX IF NOT EXISTS idx_asientos_producto ON asientos(producto_id);
CREATE INDEX IF NOT EXISTS idx_asientos_empresa_fecha ON asientos(empresa_id, fecha);

CREATE TABLE IF NOT EXISTS ventas (
  id          TEXT PRIMARY KEY,
  empresa_id  TEXT NOT NULL DEFAULT 'default',
  fecha       TEXT NOT NULL,
  cliente_id  TEXT NOT NULL,
  repartidor  TEXT,
  total       REAL NOT NULL,
  medio_pago  TEXT NOT NULL CHECK (medio_pago IN ('efectivo','transferencia','qr')),
  remito      TEXT,
  punto_lat   REAL,
  punto_lng   REAL
);

CREATE TABLE IF NOT EXISTS venta_renglones (
  venta_id    TEXT NOT NULL REFERENCES ventas(id),
  producto_id TEXT NOT NULL,
  cantidad    REAL NOT NULL,
  precio      REAL NOT NULL,
  lista       TEXT
);

CREATE TABLE IF NOT EXISTS no_ventas (
  id         TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL DEFAULT 'default',
  fecha      TEXT NOT NULL,
  cliente_id TEXT NOT NULL,
  repartidor TEXT,
  motivo     TEXT NOT NULL CHECK (motivo IN ('cerrado','no_estaba','tiene_stock','precio','otro')),
  detalle    TEXT
);

CREATE TABLE IF NOT EXISTS encargues (
  id         TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL DEFAULT 'default',
  fecha      TEXT NOT NULL,
  cliente_id TEXT NOT NULL,
  autor      TEXT,
  estado     TEXT NOT NULL CHECK (estado IN ('pendiente','preparado','entregado','cancelado')),
  motivo     TEXT,
  venta_id   TEXT
);

CREATE TABLE IF NOT EXISTS encargue_renglones (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  encargue_id         TEXT NOT NULL REFERENCES encargues(id),
  tipo                TEXT NOT NULL CHECK (tipo IN ('catalogo','especial')),
  producto_id         TEXT,
  descripcion         TEXT,
  cantidad            REAL NOT NULL,
  producto_vinculado  TEXT
);

CREATE TABLE IF NOT EXISTS zonas_evitar (
  id         TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL DEFAULT 'default',
  nombre     TEXT NOT NULL,
  lat        REAL NOT NULL,
  lng        REAL NOT NULL,
  radio      REAL NOT NULL,
  motivo     TEXT,
  hasta_hora REAL
);
