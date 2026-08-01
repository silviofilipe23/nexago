import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ArenaAccessService } from './arena-access.service';
import { ArenaContextService } from './arena-context.service';
import type { ArenaStaffRole } from './arena-roles.model';

function contextStub(isOwner: boolean, role: ArenaStaffRole | null, loading = false) {
  return {
    isOwner: signal(isOwner),
    staffRole: signal(role),
    loading: signal(loading),
  };
}

function makeService(stub: ReturnType<typeof contextStub>): ArenaAccessService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    // A app inteira roda zoneless (app.config.ts) — sem este provider o TestBed tenta
    // construir NgZone e quebra com NG0908 (não há zone.js carregado no bundle de testes).
    providers: [
      provideZonelessChangeDetection(),
      ArenaAccessService,
      { provide: ArenaContextService, useValue: stub },
    ],
  });
  return TestBed.inject(ArenaAccessService);
}

describe('ArenaAccessService', () => {
  it('dono alcanca todas as areas, leitura e escrita', () => {
    const svc = makeService(contextStub(true, null));
    expect(svc.isOwner()).toBe(true);
    expect(svc.canWrite('financeiro')).toBe(true);
    expect(svc.canWrite('perfil')).toBe(true);
    expect(svc.canRead('torneios')).toBe(true);
  });

  it('recepcao segue a matriz do cargo', () => {
    const svc = makeService(contextStub(false, 'recepcao'));
    expect(svc.isOwner()).toBe(false);
    expect(svc.canWrite('agenda')).toBe(true);
    expect(svc.canRead('estoque')).toBe(true);
    expect(svc.canWrite('estoque')).toBe(false);
    expect(svc.canRead('financeiro')).toBe(false);
  });

  it('financeiro nao alcanca agenda', () => {
    const svc = makeService(contextStub(false, 'financeiro'));
    expect(svc.canRead('agenda')).toBe(false);
    expect(svc.canRead('financeiro')).toBe(true);
    expect(svc.canWrite('financeiro')).toBe(false);
  });

  it('sem vinculo nenhum nao alcanca nada', () => {
    const svc = makeService(contextStub(false, null));
    expect(svc.canRead('agenda')).toBe(false);
    expect(svc.canWrite('agenda')).toBe(false);
  });

  it('ready acompanha o loading do contexto', () => {
    const svc = makeService(contextStub(false, 'gestor', true));
    expect(svc.ready()).toBe(false);
  });
});
