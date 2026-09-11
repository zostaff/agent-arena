/** Small flat-shaded mesh renderer. Geometry, normals and painter sorting are CPU-side. */
type Vec = [number, number, number];
export interface BodyOptions {
  cx: number; cy: number; rx: number; ry: number;
  seg?: number; rings?: number; base: Vec; light?: Vec;
  yaw?: number; amb?: number; gain?: number; jitter?: number;
}
export interface Facet { points: string; fill: string; depth: number; normal: Vec }
const unit = ([x, y, z]: Vec): Vec => {
  const m = Math.hypot(x, y, z) || 1;
  return [x / m, y / m, z / m];
};
const rotate = ([x, y, z]: Vec, yaw: number): Vec =>
  [x * Math.cos(yaw) + z * Math.sin(yaw), y, z * Math.cos(yaw) - x * Math.sin(yaw)];

export function polyBody({ cx, cy, rx, ry, seg = 18, rings = 10, base,
  light = [-0.6, -0.7, 1], yaw = 0.3, amb = 0.33, gain = 0.8, jitter = 0.055 }: BodyOptions): Facet[] {
  const lamp = unit(light);
  const vertex = (r: number, s: number): Vec => {
    const wrapped = s % seg;
    const pole = r === 0 || r === rings;
    const wobble = pole ? 0 : Math.sin(r * 37.7 + wrapped * 13.31) * jitter;
    const phi = Math.PI * r / rings + wobble;
    const theta = 2 * Math.PI * wrapped / seg + wobble * 1.3;
    return rotate([Math.sin(phi) * Math.cos(theta), -Math.cos(phi), Math.sin(phi) * Math.sin(theta)], yaw);
  };
  const facets: Facet[] = [];
  for (let r = 0; r < rings; r++) for (let s = 0; s < seg; s++) {
    const vertices = [vertex(r, s), vertex(r, s + 1), vertex(r + 1, s + 1), vertex(r + 1, s)];
    const mean = vertices.reduce<Vec>((a, b) => [a[0] + b[0] / 4, a[1] + b[1] / 4, a[2] + b[2] / 4], [0, 0, 0]);
    const normal = unit([mean[0] / rx, mean[1] / ry, mean[2] / Math.min(rx, ry)]);
    if (normal[2] <= 0) continue;
    const diffuse = Math.max(0, normal[0] * lamp[0] + normal[1] * lamp[1] + normal[2] * lamp[2]);
    const brightness = amb + diffuse * gain;
    facets.push({
      points: vertices.map(([x, y]) => `${(cx + x * rx).toFixed(2)},${(cy + y * ry).toFixed(2)}`).join(" "),
      fill: `rgb(${base.map((n) => Math.min(255, Math.max(0, Math.round(n * brightness)))).join(",")})`,
      depth: mean[2], normal,
    });
  }
  return facets.sort((a, b) => a.depth - b.depth);
}
