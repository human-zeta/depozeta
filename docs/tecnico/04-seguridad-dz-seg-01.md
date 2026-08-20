# depo zeta — seguridad: roles, TOTP y sesiones · DZ-SEG-01

Documento técnico. El backend real de la app —hasta esta noche, un
prototipo puramente de navegador— arranca por acá: login que separa
depósito de reparto, y de ahí para arriba.

---

## Qué pedía el dueño del proyecto, literal

1. Un acceso de entrada para reparto o depósito, «así no se mezclan ambos
   mundos» — no una pantalla que engañe, un servidor que lo haga cumplir.
2. Registro con sistema TOTP.
3. Un rol admin para él, pensando en si el producto algún día sirve a más
   de una empresa — aunque hoy sea de una sola.
4. Tres roles: **admin, depósito y reparto**. Depósito puede crear usuarios
   de reparto.

Cada uno de estos cuatro puntos tiene su verificación en este documento,
no sólo su descripción.

---

## De dónde sale este motor

No se escribió de cero. `cajazeta/app/core/` —el proyecto hermano de esta
misma casa— ya tenía un motor de autenticación con TOTP, PBKDF2, sesiones
con expiración, límite de intentos y anti-replay, ya en uso, ya probado.
Se portó y se adaptó, no se reinventó:

| Módulo | De dónde | Qué cambió |
|---|---|---|
| `app/core/totp.js` | Portado casi literal | Sólo el emisor por defecto (`depo zeta` en vez de `Caja Zeta`) |
| `app/core/autorizacion.js` | Adaptado | Roles y acciones nuevas, para este dominio |
| `app/core/autenticacion.js` | Adaptado | TOTP obligatorio para los tres roles, sin excepción; sin filtro de IPs |
| `app/core/auditoria.js` | Simplificado | Sin el encadenamiento criptográfico de Caja Zeta — esa exigencia viene de una resolución de UIF que no aplica acá |
| `app/core/usuarios.js` | Nuevo | El flujo de alta/baja, propio de este dominio |

Los tests de TOTP corren contra los vectores oficiales del RFC 6238,
apéndice B —los mismos tres casos que usa Caja Zeta—, no contra sí mismos:
si esta implementación coincide con el RFC, coincide con cualquier app de
autenticación del mercado.

---

## Los tres roles, y quién crea a quién

```
ADMIN (nivel 30)
  └─ crea DEPOSITO, crea REPARTIDOR
DEPOSITO (nivel 20)
  └─ crea REPARTIDOR
REPARTIDOR (nivel 10)
  └─ no crea a nadie
```

**La regla, en una sola función (`puedeCrearUsuario`):** nadie crea a un
par ni a un superior. No es una lista de permisos por rol que hay que
mantener sincronizada — es una comparación de nivel. Un DEPOSITO que
intenta crear otro DEPOSITO se rechaza por la misma razón que uno que
intenta crear un ADMIN: en los dos casos, no sería alguien por debajo.

Mismo criterio para desactivar cuentas y reiniciar el TOTP de otra
persona (`puedeGestionarUsuario`): un DEPOSITO administra a los
REPARTIDOR que él mismo dio de alta —de punta a punta, sin pasarle cada
baja a un ADMIN—, pero no toca a otro DEPOSITO ni al ADMIN.

**Qué ve cada rol:**

| | ADMIN | DEPOSITO | REPARTIDOR |
|---|---|---|---|
| Vender, tomar encargue | — | — | ✓ |
| Ver costo de reposición y margen | ✓ | ✓ | — |
| Confirmar carga, remarcar, gestionar productos y zonas | ✓ | ✓ | — |
| Crear usuarios | cualquier rol menor | sólo REPARTIDOR | — |
| Ver auditoría | ✓ | — | — |

El repartidor no ve costos ni margen — es la separación que ya existía en
el prototipo F0 como ocultamiento de interfaz, ahora aplicada por el
servidor: el dato ni siquiera sale de la base para esa sesión.

---

## Por qué TOTP siempre, sin excepción de rol

Caja Zeta exige el segundo factor según el rol (`RS-103`): los puestos de
supervisión y administración lo tienen obligatorio, el operador de
mostrador no. Acá no se copió esa distinción — **los tres roles de depo
zeta lo tienen obligatorio, sin excepción.**

**Por qué:** no hay un rol de bajo riesgo equivalente al operador de
mostrador. Un REPARTIDOR ya cobra en efectivo, transferencia y QR, y su
sesión ve la cartera completa de clientes. Complicar el modelo para
distinguir "quién necesita el segundo factor" no ahorraba nada real acá.

## Cómo es el login, en dos pasos

1. **`POST /api/login`** — usuario y clave. Si la clave es correcta pero
   todavía no hay TOTP confirmado, la respuesta es `ENROLAR` y trae el
   secreto y la URI `otpauth://` (el QR). Si ya está confirmado, es
   `REQUERIDO`, sin el secreto — no se reenvía un secreto ya entregado.
2. **`POST /api/login/totp`** — el ticket del paso 1 más el código de
   6 dígitos de la app. Ahí se abre la sesión.

**El ticket vence a los 5 minutos** y es de un solo uso — el mismo código
no abre dos sesiones (RFC 6238 §5.2, anti-replay). Cinco intentos
fallidos por identidad en 15 minutos bastan para bloquear, sea clave o
código lo que se equivoca.

### El bug real que apareció al probarlo, no en el diseño

El diseño original (heredado de Caja Zeta) guarda el ticket del paso
intermedio en una variable en memoria del proceso. **Funciona en un
servidor de toda la vida y falla en un Worker de Cloudflare**, donde una
request puede caer en una instancia distinta de la que atendió la
anterior — el ticket del paso 1 simplemente no estaba en el paso 2.

Apareció probando el flujo real contra `wrangler dev`, no leyendo el
código. La corrección: los tickets pasan a vivir en el repositorio
—una tabla en D1—, igual que las sesiones. El repositorio en memoria que
usan los tests de Node no cambió de comportamiento; para ese caso, sigue
siendo un `Map`.

**La lección que deja:** un motor portado de otro proyecto hereda sus
supuestos de despliegue, no sólo su lógica. Probarlo contra la
infraestructura real —aunque sea local— encontró algo que ninguna
revisión de código iba a encontrar.

---

## Sesión

- Expira a los 30 minutos sin uso; tope absoluto de 8 horas aunque se use
  sin parar.
- Sólo se guarda el **hash** del token — un volcado de la base no regala
  sesiones vivas.
- Desactivar una cuenta corta cualquier sesión ya abierta en el momento,
  no recién en el próximo login — verificado en vivo.

---

## El arranque — el primer ADMIN

No hay ningún ADMIN que autorice al primero. `POST /api/bootstrap` es el
único camino que no pasa por `puedeCrearUsuario`, y tiene dos condiciones,
las dos necesarias:

1. **Sólo funciona si el repositorio no tiene un solo usuario.**
2. **Exige un `BOOTSTRAP_TOKEN`**, un secreto del Worker (`wrangler secret
   put`) — sin él, no alcanza con encontrar la URL antes de que el dueño
   real arranque su cuenta.

---

## Probado, no sólo escrito

- **136/136 tests de Node** sobre los motores de seguridad y del libro (`totp`, `autorizacion`,
  `autenticacion`, `usuarios`, y su integración) — incluye los tres
  vectores oficiales del RFC 6238 y el pedido literal del dueño del
  proyecto convertido en test: depósito crea reparto, no crea depósito ni
  admin.
- **De punta a punta contra el Worker real**, con D1 corriendo en local
  (`wrangler dev`, sin cuenta de Cloudflare): bootstrap con token
  incorrecto y correcto, login de dos pasos con código TOTP generado de
  verdad, admin crea depósito, depósito crea repartidor, depósito
  rechazado al crear depósito o admin, repartidor rechazado al crear o
  listar usuarios, token ausente o basura devuelve 401 prolijo (nunca
  500), reinicio de TOTP, y desactivación cortando una sesión que ya
  estaba abierta.

Lo que esa noche **no** se probó: contra una cuenta de Cloudflare real
desplegada. Se resolvió la noche siguiente — `server/api/` corre en vivo
en `https://depo-zeta-api.tukyquilme.workers.dev` desde el 19 de agosto,
con el mismo login de dos pasos verificado ahí, no sólo en local. Ver
`server/api/README.md`.

---

## El segundo bug que sólo apareció usándolo

El del ticket en memoria (arriba) lo encontró el despliegue. Este lo
encontró el dueño del proyecto dando de alta a sus dos primeros
repartidores: **ninguno de los dos podía entrar.**

La causa no estaba en la seguridad sino en la identidad. El teclado de un
teléfono capitaliza la primera letra sin avisar, y el motor comparaba el
nombre de usuario como texto exacto: `Grillodepo` y `grillodepo` eran dos
personas distintas, así que la cuenta «no existía» y el login devolvía
—correctamente, según el código— «usuario o clave incorrectos». La tabla
`intentos_login` lo mostraba sin ambigüedad: cuatro intentos con la
mayúscula puesta.

Se arregló normalizando (trim + minúsculas) **en el motor**, no en el
formulario: los campos ahora además llevan `autocapitalize="off"`, pero
esa es la segunda línea de defensa, no la primera — un atributo HTML
depende del navegador, y la identidad de una cuenta no puede.

**Lo que faltaba en los tests, y es la parte que importa:** había pruebas
del alta por un lado y del login por el otro, pero ninguna que hiciera el
camino entero — crear una cuenta y que esa persona entre con su clave.
Ese test ahora existe, y falla sin el arreglo.

---

## Lo que no está resuelto

- **Sin recuperación de clave por la propia persona.** No hay «olvidé mi
  clave» con mail ni preguntas: la repone quien administra esa cuenta,
  desde Usuarios → «Clave nueva» (`POST /api/usuarios/:usuario/clave`),
  con la misma regla anti-escalada que desactivar — nadie le cambia la
  clave a un par ni a un superior, así un DEPOSITO no puede quedarse con
  la cuenta del ADMIN. Cambiarla corta las sesiones abiertas de esa
  cuenta. Para una operación de tres personas alcanza; un autoservicio
  por mail es otra cosa.
- **La API todavía no tiene dominio propio** — vive en la URL que asigna
  `workers.dev`, no en algo como `depozeta-api.hg-vl.com`. Cosmético, no
  funcional.
- **El primer ADMIN real de producción todavía no lo creó el dueño del
  proyecto** — el `BOOTSTRAP_TOKEN` quedó como secret en Cloudflare, listo
  para que lo use él, no un dato de prueba.

**Ya resuelto, no era cierto en la primera versión de este documento:**
el resto del libro (`clientes`, `productos`, `asientos`, `ventas`,
`encargues`, `zonas`) siguió sin backend la primera noche — quedó
conectado la noche siguiente (19 de agosto, misma fecha, sesión
posterior), con el mismo patrón de acá: motores puros en `app/core/`,
repositorios D1, rutas en `worker.mjs`, autorización por rol en cada una.
Diseño completo en `DZ-MOD-01`. El cliente (`app/index.html`) también
dejó de tener el botón de «cambiar perfil»: hoy es la misma pantalla de
login de esta sección la que decide el rol.
