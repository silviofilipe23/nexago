export interface RadarAxis {
  label: string;
  value: number; // 0-10
}

export interface RadarPoint {
  x: number;
  y: number;
}

function axisAngle(index: number, count: number): number {
  return -Math.PI / 2 + (index * 2 * Math.PI) / count;
}

export function radarPointAt(center: number, radius: number, index: number, count: number): RadarPoint {
  const angle = axisAngle(index, count);
  return { x: center + radius * Math.cos(angle), y: center + radius * Math.sin(angle) };
}

export function radarRingPoints(axes: RadarAxis[], center: number, radius: number, fraction: number): RadarPoint[] {
  return axes.map((_, i) => radarPointAt(center, radius * fraction, i, axes.length));
}

export function radarAxisLinePoints(axes: RadarAxis[], center: number, radius: number): RadarPoint[] {
  return axes.map((_, i) => radarPointAt(center, radius, i, axes.length));
}

export function radarDataPoints(axes: RadarAxis[], center: number, radius: number): RadarPoint[] {
  return axes.map((a, i) => radarPointAt(center, (a.value / 10) * radius, i, axes.length));
}

export function radarLabelPoints(axes: RadarAxis[], center: number, radius: number, labelOffset: number): RadarPoint[] {
  return axes.map((_, i) => radarPointAt(center, radius + labelOffset, i, axes.length));
}

export function pointsToSvgAttr(points: RadarPoint[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(' ');
}
