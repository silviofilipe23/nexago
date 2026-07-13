export interface LinePoint {
  x: number;
  y: number;
}

/** Normaliza uma série de valores em pontos de um SVG de largura/altura dados. */
export function lineChartPoints(values: number[], width: number, height: number, padding = 20): LinePoint[] {
  if (values.length === 0) {
    return [];
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const flat = max === min;
  const range = max - min || 1;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const n = values.length;
  return values.map((v, i) => ({
    x: padding + (n === 1 ? chartWidth / 2 : (i / (n - 1)) * chartWidth),
    y: padding + chartHeight - (flat ? 0.5 : (v - min) / range) * chartHeight,
  }));
}

export function pointsToPolylineAttr(points: LinePoint[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(' ');
}
