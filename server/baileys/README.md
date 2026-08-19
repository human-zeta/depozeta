# server/baileys/ — alternativa no oficial, con advertencia

**Leer [`docs/tecnico/03-baileys-alternativa-dz-bai-01.md`](../../docs/tecnico/03-baileys-alternativa-dz-bai-01.md)
(DZ-BAI-01) antes de correr esto.** El camino elegido para depo zeta es la Cloud API
oficial ([`DZ-WSP-01`](../../docs/tecnico/02-whatsapp-cloud-api-dz-wsp-01.md)); esto es una
alternativa documentada, no un reemplazo, y trae riesgo real de que Meta banee el número
— sin aviso, de forma permanente.

## Antes de correr

**Nunca contra el número real de la operación.** Un número descartable, siempre.

## Correr

```bash
cd server/baileys
npm install
npm start
```

Muestra un código QR en la terminal. Se escanea desde el número de prueba: WhatsApp →
Configuración → Dispositivos vinculados → Vincular un dispositivo.

## Qué guarda

`auth_info/` — la sesión vinculada. Tan sensible como una contraseña: está en
`.gitignore`, **no se commitea nunca**. Si se pierde esa carpeta, hay que volver a
escanear el QR.

## No instalar paquetes de "anti-ban"

En abril de 2026 se confirmó que uno de esos paquetes, con 56.000 descargas, robaba las
credenciales de sesión y los mensajes de quien lo instalaba. El detalle completo está en
DZ-BAI-01.

## Estado

Escrito contra `@whiskeysockets/baileys` 6.7.x, la línea estable (la 7.x sigue en release
candidate). No probado en vivo — no hay una sesión real vinculada todavía.
