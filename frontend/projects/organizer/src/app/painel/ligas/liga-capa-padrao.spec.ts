import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { League } from '@nexago/leagues';
import { AuthService } from '../../auth/auth.service';
import { PanelContextService } from '../shell/panel-context.service';
import { LigaVisaoGeralComponent } from './liga-visao-geral.component';

export function liga(over: Partial<League> = {}): League {
  return {
    id: 'l1',
    name: 'Liga nexaGO',
    managerId: 'u1',
    sport: 'beachVolleyball',
    sportLabel: 'Vôlei de praia',
    seasonLabel: 'Temporada 2026',
    city: 'Goiânia',
    state: 'GO',
    organizationName: null,
    description: null,
    coverUrl: null,
    listingStatus: 'open',
    seasonStartAt: null,
    seasonEndAt: null,
    plannedStagesCount: null,
    grandFinalEnabled: false,
    grandFinalSpots: 16,
    countingStagesMode: 'best_4_of_6',
    stages: [],
    categories: [],
    updatedAt: null,
    ...over,
  };
}

/** `leagueId` nulo faz o efeito do `LigaStore` sair antes de carregar — o doc da
 *  liga vem do contexto, então a tela renderiza sem tocar o Firestore. */
function fakeCtx(l: League): Partial<PanelContextService> {
  return {
    league: signal(l).asReadonly() as unknown as PanelContextService['league'],
    leagueBase: signal(
      '/painel/ligas/l1',
    ).asReadonly() as unknown as PanelContextService['leagueBase'],
    leagueId: signal(null).asReadonly() as unknown as PanelContextService['leagueId'],
    // O `og-page-header` da tela lê as migalhas do mesmo contexto.
    crumbs: signal([]).asReadonly() as unknown as PanelContextService['crumbs'],
  };
}

async function capaDoHero(l: League): Promise<string | null> {
  TestBed.resetTestingModule();
  // O portal roda zoneless: sem isso o TestBed falha com NG0908.
  await TestBed.configureTestingModule({
    imports: [LigaVisaoGeralComponent],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: AuthService, useValue: { user: signal(null), isSuperAdmin: signal(false) } },
      { provide: PanelContextService, useValue: fakeCtx(l) },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(LigaVisaoGeralComponent);
  fixture.detectChanges();
  return fixture.nativeElement.querySelector('.og-liga-hero img')?.getAttribute('src') ?? null;
}

describe('LigaVisaoGeralComponent — capa padrão', () => {
  it('liga sem capa usa a arte do próprio esporte', async () => {
    expect(await capaDoHero(liga())).toBe('/media/tournament-covers/volei_praia.webp');
  });

  it('a arte não substitui a capa que o organizador subiu', async () => {
    expect(await capaDoHero(liga({ coverUrl: 'https://cdn.example.com/liga.jpg' }))).toBe(
      'https://cdn.example.com/liga.jpg',
    );
  });

  it('liga sem esporte reconhecido segue no ícone da bandeira', async () => {
    expect(await capaDoHero(liga({ sport: null }))).toBeNull();
  });
});
