import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { Observable, firstValueFrom, isObservable } from 'rxjs';
import { areaGuard } from './area.guard';
import { CoachContextService } from './coach-context.service';
import type { CoachContext } from './coach-context.logic';
import { roleCanAccess, type AccessMode, type CoachRole, type PanelArea } from './coach-roles.model';

class FakeContext {
  readonly ready = signal(true);
  readonly contexts = signal<CoachContext[]>([]);
  readonly role = signal<CoachRole | null>(null);
  can(area: PanelArea, mode: AccessMode = 'read'): boolean {
    const role = this.role();
    return role !== null && roleCanAccess(role, area, mode);
  }
}

describe('areaGuard', () => {
  let ctx: FakeContext;

  const someContext: CoachContext = { coachUid: 'c1', role: 'preparador_fisico', coachName: 'Treinador', isOwn: false };

  function run(data: Record<string, unknown>): ReturnType<typeof areaGuard> {
    const route = { data } as unknown as ActivatedRouteSnapshot;
    return TestBed.runInInjectionContext(() => areaGuard(route, {} as RouterStateSnapshot));
  }

  function path(result: unknown): string {
    expect(result instanceof UrlTree).toBeTrue();
    return TestBed.inject(Router).serializeUrl(result as UrlTree);
  }

  beforeEach(() => {
    ctx = new FakeContext();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: CoachContextService, useValue: ctx }],
    });
  });

  it('sem nenhum painel vai para /sem-acesso', () => {
    expect(path(run({ area: 'treinos' }))).toBe('/sem-acesso');
  });

  it('rota sem data.area passa', () => {
    ctx.contexts.set([someContext]);
    expect(run({})).toBeTrue();
  });

  it('leitura negada volta para /painel', () => {
    ctx.contexts.set([someContext]);
    ctx.role.set('preparador_fisico');
    expect(path(run({ area: 'financeiro' }))).toBe('/painel');
  });

  it('escrita em cargo só-leitura da área volta para /painel', () => {
    ctx.contexts.set([someContext]);
    ctx.role.set('preparador_fisico');
    expect(roleCanAccess('preparador_fisico', 'treinos', 'read')).toBeTrue();
    expect(path(run({ area: 'treinos', mode: 'write' }))).toBe('/painel');
  });

  it('acesso permitido passa', () => {
    ctx.contexts.set([someContext]);
    ctx.role.set('preparador_fisico');
    expect(run({ area: 'treinos' })).toBeTrue();
    expect(run({ area: 'fisico', mode: 'write' })).toBeTrue();
  });

  it('espera o ready ficar true antes de decidir', async () => {
    ctx.ready.set(false);
    ctx.contexts.set([someContext]);
    ctx.role.set('preparador_fisico');
    const result = run({ area: 'treinos' });
    expect(isObservable(result)).toBeTrue();
    let emitted: unknown = 'none';
    const pending = firstValueFrom(result as Observable<unknown>).then((v) => (emitted = v));
    TestBed.tick();
    expect(emitted).toBe('none');
    ctx.ready.set(true);
    TestBed.tick();
    await pending;
    expect(emitted).toBeTrue();
  });
});
