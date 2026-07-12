import { radarPointAt, radarDataPoints, pointsToSvgAttr, type RadarAxis } from './radar-geometry';

describe('radarPointAt', () => {
  it('places the first axis straight up from center', () => {
    const p = radarPointAt(100, 50, 0, 4);
    expect(p.x).toBeCloseTo(100, 5);
    expect(p.y).toBeCloseTo(50, 5);
  });

  it('places the second of 4 axes to the right of center', () => {
    const p = radarPointAt(100, 50, 1, 4);
    expect(p.x).toBeCloseTo(150, 5);
    expect(p.y).toBeCloseTo(100, 5);
  });
});

describe('radarDataPoints', () => {
  it('scales each axis value (0-10) as a fraction of the radius', () => {
    const axes: RadarAxis[] = [
      { label: 'Saque', value: 10 },
      { label: 'Recepção', value: 5 },
    ];
    const points = radarDataPoints(axes, 100, 50);
    expect(points).toHaveSize(2);
    // Saque = 10/10 = full radius, straight up from center.
    expect(points[0].x).toBeCloseTo(100, 5);
    expect(points[0].y).toBeCloseTo(50, 5);
  });
});

describe('pointsToSvgAttr', () => {
  it('joins points as an SVG polygon points string', () => {
    expect(pointsToSvgAttr([{ x: 1, y: 2 }, { x: 3, y: 4 }])).toBe('1,2 3,4');
  });
});
