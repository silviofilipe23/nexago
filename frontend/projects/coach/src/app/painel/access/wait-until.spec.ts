import { Subject, of } from 'rxjs';
import { waitUntil } from './wait-until';

describe('waitUntil', () => {
  it('resolve true quando o valor já satisfaz', async () => {
    expect(await waitUntil(of([1, 2]), (v) => v.includes(2), 50)).toBeTrue();
  });

  it('resolve true quando o valor chega depois', async () => {
    const s = new Subject<number[]>();
    const p = waitUntil(s, (v) => v.includes(2), 500);
    s.next([1]);
    s.next([1, 2]);
    expect(await p).toBeTrue();
  });

  it('resolve false no prazo', async () => {
    const s = new Subject<number[]>();
    const p = waitUntil(s, (v) => v.includes(2), 20);
    s.next([1]);
    expect(await p).toBeFalse();
  });
});
