/* ==========================================================================
   depo zeta — zonas a evitar · DZ-MOD-01
   --------------------------------------------------------------------------
   Las carga el usuario, la app no trae ninguna precargada — es información
   hiperlocal que no le corresponde inventar a un motor.
   ========================================================================== */

const error = (codigo, mensaje) => Object.assign(new Error(mensaje), { codigo });

const RADIO_MINIMO = 30;

export function validarZona({ nombre, lat, lng }) {
  if (!nombre || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw error('DATOS_INCOMPLETOS', 'falta el nombre o las coordenadas de la zona');
  }
}

export function armarZona({ id, nombre, lat, lng, radio, motivo, hastaHora }) {
  validarZona({ nombre, lat, lng });
  return {
    id,
    nombre,
    lat,
    lng,
    radio: Math.max(RADIO_MINIMO, radio || 150),
    motivo: motivo || '',
    hastaHora: hastaHora == null ? null : Number(hastaHora),
  };
}
