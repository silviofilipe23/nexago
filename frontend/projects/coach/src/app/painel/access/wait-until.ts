import { firstValueFrom, type Observable } from 'rxjs';
import { filter, map, timeout } from 'rxjs/operators';

/** Resolve `true` assim que `source` emitir um valor que satisfaça `predicate`; `false` no prazo. */
export function waitUntil<T>(
  source: Observable<T>,
  predicate: (value: T) => boolean,
  timeoutMs: number,
): Promise<boolean> {
  return firstValueFrom(
    source.pipe(
      filter(predicate),
      map(() => true),
      timeout({ first: timeoutMs, with: () => [false] }),
    ),
    { defaultValue: false },
  );
}
