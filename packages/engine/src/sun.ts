// The sun's times (Task 6), in a file that imports nothing, so the app may use it at runtime through `@wwi/engine/reader` (Task 18).

const RAD = Math.PI / 180;
/** The sun's apparent upper limb at the horizon, with refraction: zenith angle at sunrise and sunset. */
const HORIZON_ZENITH_DEG = 90.833;

/**
 * Sunrise and sunset in minutes after local midnight, by the NOAA solar-position approximation
 * (Meeus-based; good to about a minute away from the poles). `date` is 'YYYY-MM-DD' on the local clock,
 * which is `utcOffsetMin` east of UTC. At polar day or night the times collapse onto solar noon.
 */
export function sunTimes(lat: number, lon: number, date: string, utcOffsetMin: number): { sunrise: number; sunset: number } {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const jd = (Date.UTC(y, m - 1, d, 12) - Date.UTC(2000, 0, 1, 12)) / 86_400_000 + 2_451_545;
  const T = (jd - 2_451_545) / 36_525;
  const L0 = (280.46646 + T * (36_000.76983 + T * 0.0003032)) % 360;
  const M = 357.52911 + T * (35_999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C =
    Math.sin(M * RAD) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(2 * M * RAD) * (0.019993 - 0.000101 * T) +
    Math.sin(3 * M * RAD) * 0.000289;
  const omega = 125.04 - 1934.136 * T;
  const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const obliq0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const obliq = obliq0 + 0.00256 * Math.cos(omega * RAD);
  const decl = Math.asin(Math.sin(obliq * RAD) * Math.sin(lambda * RAD));
  const yy = Math.tan((obliq * RAD) / 2) ** 2;
  const eqTime =
    4 *
    (yy * Math.sin(2 * L0 * RAD) -
      2 * e * Math.sin(M * RAD) +
      4 * e * yy * Math.sin(M * RAD) * Math.cos(2 * L0 * RAD) -
      0.5 * yy * yy * Math.sin(4 * L0 * RAD) -
      1.25 * e * e * Math.sin(2 * M * RAD)) /
    RAD;
  const cosHa = Math.cos(HORIZON_ZENITH_DEG * RAD) / (Math.cos(lat * RAD) * Math.cos(decl)) - Math.tan(lat * RAD) * Math.tan(decl);
  const ha = Math.acos(Math.min(1, Math.max(-1, cosHa))) / RAD;
  const noon = 720 - 4 * lon - eqTime + utcOffsetMin;
  return { sunrise: noon - 4 * ha, sunset: noon + 4 * ha };
}
