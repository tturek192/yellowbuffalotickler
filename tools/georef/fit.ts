/**
 * Ground-control-point georeferencing of a scanned map: a least-squares affine transform from image
 * pixels to WGS84 [lon, lat]. An affine fit absorbs scale, rotation, shear and offset, which is all a
 * small sheet of a conformal map projection needs over a few kilometres.
 */

export type Gcp = { px: [number, number]; lonLat: [number, number] };

export type AffineFit = {
  toLonLat(px: [number, number]): [number, number];
  toPx(lonLat: [number, number]): [number, number];
  /** Root-mean-square of the residuals, in metres. */
  rmsM: number;
  /** For each GCP, in order: the distance in metres between its lonLat and where the fit puts its pixel. */
  residualsM: number[];
};

/** The same local metric as the scenario frame (packages/scenario/src/frame.ts). */
const M_PER_DEG_LON_EQ = 111320;
const M_PER_DEG_LAT = 110540;

/** Solve the 3×3 system m·x = b by Gaussian elimination with partial pivoting; undefined if singular. */
function solve3(m: number[][], b: number[]): number[] | undefined {
  const a = m.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(a[r]![c]!) > Math.abs(a[p]![c]!)) p = r;
    if (Math.abs(a[p]![c]!) < 1e-12) return undefined;
    [a[c], a[p]] = [a[p]!, a[c]!];
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const k = a[r]![c]! / a[c]![c]!;
      for (let j = c; j < 4; j++) a[r]![j]! -= k * a[c]![j]!;
    }
  }
  return a.map((row, i) => row[3]! / row[i]!);
}

/**
 * Fit lon = a0 + a1·u + a2·v and lat = b0 + b1·u + b2·v by least squares, where (u, v) is the pixel
 * relative to the GCPs' pixel centroid (centring keeps the normal equations well conditioned).
 * Throws with fewer than 4 GCPs, or when they are collinear.
 */
export function fitAffine(gcps: Gcp[]): AffineFit {
  if (gcps.length < 4) throw new Error(`fitAffine needs at least 4 ground control points, got ${gcps.length}`);
  const n = gcps.length;
  const cu = gcps.reduce((s, g) => s + g.px[0], 0) / n;
  const cv = gcps.reduce((s, g) => s + g.px[1], 0) / n;
  const clon = gcps.reduce((s, g) => s + g.lonLat[0], 0) / n;
  const clat = gcps.reduce((s, g) => s + g.lonLat[1], 0) / n;

  const ata = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const atLon = [0, 0, 0];
  const atLat = [0, 0, 0];
  for (const g of gcps) {
    const row = [1, g.px[0] - cu, g.px[1] - cv];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) ata[i]![j]! += row[i]! * row[j]!;
      atLon[i]! += row[i]! * (g.lonLat[0] - clon);
      atLat[i]! += row[i]! * (g.lonLat[1] - clat);
    }
  }
  // Scale-aware singularity test: the pixel spread must span two dimensions.
  const det2 = ata[1]![1]! * ata[2]![2]! - ata[1]![2]! * ata[2]![1]!;
  const a = det2 > 1e-9 * (ata[1]![1]! + ata[2]![2]!) ** 2 ? solve3(ata, atLon) : undefined;
  const b = a && solve3(ata, atLat);
  if (!a || !b) throw new Error('fitAffine: the ground control points are collinear; spread them across the map');

  const [a0, a1, a2] = a as [number, number, number];
  const [b0, b1, b2] = b as [number, number, number];
  const det = a1 * b2 - a2 * b1;

  const toLonLat = ([x, y]: [number, number]): [number, number] => {
    const u = x - cu;
    const v = y - cv;
    return [clon + a0 + a1 * u + a2 * v, clat + b0 + b1 * u + b2 * v];
  };
  const toPx = ([lon, lat]: [number, number]): [number, number] => {
    const dl = lon - clon - a0;
    const dp = lat - clat - b0;
    return [cu + (b2 * dl - a2 * dp) / det, cv + (-b1 * dl + a1 * dp) / det];
  };

  const kx = M_PER_DEG_LON_EQ * Math.cos((clat * Math.PI) / 180);
  const residualsM = gcps.map((g) => {
    const [lon, lat] = toLonLat(g.px);
    return Math.hypot((lon - g.lonLat[0]) * kx, (lat - g.lonLat[1]) * M_PER_DEG_LAT);
  });
  const rmsM = Math.sqrt(residualsM.reduce((s, r) => s + r * r, 0) / n);
  return { toLonLat, toPx, rmsM, residualsM };
}
