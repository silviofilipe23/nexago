import { lineChartPoints, pointsToPolylineAttr } from './line-chart-geometry';

describe('lineChartPoints', () => {
  it('returns an empty array for no values', () => {
    expect(lineChartPoints([], 320, 140)).toEqual([]);
  });

  it('centers a single value horizontally at mid-height', () => {
    const points = lineChartPoints([50], 320, 140, 20);
    expect(points.length).toBe(1);
    expect(points[0].x).toBeCloseTo(160, 5);
  });

  it('places the minimum value at the bottom and the maximum at the top of the chart area', () => {
    const points = lineChartPoints([10, 20], 100, 100, 10);
    expect(points[0].y).toBeCloseTo(90, 5);
    expect(points[1].y).toBeCloseTo(10, 5);
  });

  it('spaces points evenly across the width for equal-length series', () => {
    const points = lineChartPoints([1, 2, 3], 100, 100, 0);
    expect(points[0].x).toBeCloseTo(0, 5);
    expect(points[1].x).toBeCloseTo(50, 5);
    expect(points[2].x).toBeCloseTo(100, 5);
  });

  it('falls back to a flat mid-height line when all values are equal', () => {
    const points = lineChartPoints([5, 5, 5], 100, 100, 0);
    expect(points[0].y).toBeCloseTo(50, 5);
    expect(points[1].y).toBeCloseTo(50, 5);
    expect(points[2].y).toBeCloseTo(50, 5);
  });
});

describe('pointsToPolylineAttr', () => {
  it('joins points into an SVG polyline points attribute', () => {
    expect(pointsToPolylineAttr([{ x: 1, y: 2 }, { x: 3, y: 4 }])).toBe('1,2 3,4');
  });

  it('returns an empty string for no points', () => {
    expect(pointsToPolylineAttr([])).toBe('');
  });
});
