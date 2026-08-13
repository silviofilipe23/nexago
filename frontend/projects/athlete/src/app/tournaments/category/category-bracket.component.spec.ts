import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, type ParamMap } from '@angular/router';
import { of } from 'rxjs';
import type { TournamentCategoryOffer } from '../../data/tournaments-repository';
import { TournamentLiveStore } from '../tournament-live.store';
import { CategoryBracketComponent, categoryIdOf } from './category-bracket.component';

/**
 * `categoryIdOf` é a precedência entre `categoryIdInput` (Task 10, alimentado pelo wrapper do
 * Focus) e a categoria da rota-pai (rota antiga `/categorias/:categoriaId/chave`) — extraída
 * como função pura pra cobrir as combinações sem `TestBed`, no mesmo padrão de
 * `focus-group.component.spec.ts`/`focus-now-state.spec.ts`.
 */
describe('categoryIdOf', () => {
  it('sem input, usa a categoria da rota — comportamento de antes da Task 10', () => {
    expect(categoryIdOf(null, 'cat-rota')).toBe('cat-rota');
  });

  it('com input, ele manda sobre a rota', () => {
    expect(categoryIdOf('cat-input', 'cat-rota')).toBe('cat-input');
  });

  it('input vazio conta como ausente — cai pra rota, nunca busca a categoria ""', () => {
    expect(categoryIdOf('', 'cat-rota')).toBe('cat-rota');
  });

  it('sem input e sem rota (Focus sem categoria em foco ainda), resulta vazio', () => {
    expect(categoryIdOf(null, '')).toBe('');
  });
});

function makeCategory(id: string): TournamentCategoryOffer {
  return {
    id,
    categoryName: 'Categoria teste',
    entryFee: 0,
    maxTeams: 8,
    spotsLeft: 0,
    level: null,
    genderType: 'M',
    teamSize: null,
    genderFree: false,
    genderComposition: null,
    bracketFormat: 'single_elimination',
    registrationClosed: false,
    isCompleted: false,
    prizes: [],
    qualifiersPerGroup: 2,
    uniformType: null,
    uniformNumberOnShirt: false,
    uniformNameOnShirt: false,
    uniformSizeOptionsTop: [],
    uniformSizeOptionsShorts: [],
    ageBand: null,
    ageRestrictionMode: null,
    ageMinYears: null,
    ageMaxYears: null,
    ageReference: null,
  };
}

/** Rota-pai com (ou sem) `:categoriaId` — o mesmo shape que `parentCategoryId()` (`category-route.ts`) lê. */
function routeWithParentCategoriaId(categoriaId: string | null): ActivatedRoute {
  const paramMap: ParamMap = convertToParamMap(categoriaId != null ? { categoriaId } : {});
  const parent = { paramMap: of(paramMap), snapshot: { paramMap } };
  return { parent } as unknown as ActivatedRoute;
}

/**
 * Cobre a ligação com o `ActivatedRoute`/store de verdade que `categoryIdOf` sozinha não
 * alcança: qual id de categoria o componente efetivamente usa pra buscar no store, em cada uma
 * das duas rotas que o apontam hoje (`/categorias/:categoriaId/chave` e `focus/chave` via
 * `FocusBracketComponent`). O store é um dublê mínimo — só o que o template lê no primeiro
 * render — pra não precisar inicializar o `TournamentLiveStore` de verdade (Firestore/Auth).
 */
describe('CategoryBracketComponent — origem da categoria', () => {
  afterEach(() => TestBed.resetTestingModule());

  function setup(route: ActivatedRoute, categoryById: jasmine.Spy) {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: ActivatedRoute, useValue: route },
        { provide: Router, useValue: { navigate: () => Promise.resolve(true) } },
        {
          provide: TournamentLiveStore,
          useValue: { categoryById, matchesOfCategory: () => [], acquireLive: () => () => {} },
        },
      ],
    });
    const fixture = TestBed.createComponent(CategoryBracketComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('rota antiga (sem categoryIdInput): busca a categoria pelo :categoriaId da rota-pai, igual a antes da Task 10 — a regressão que este componente poderia causar', () => {
    const categoryById = jasmine.createSpy('categoryById').and.returnValue(makeCategory('cat-rota'));

    setup(routeWithParentCategoriaId('cat-rota'), categoryById);

    expect(categoryById).toHaveBeenCalledWith('cat-rota');
  });

  it('Focus (com categoryIdInput): o input manda, mesmo com uma rota-pai sem :categoriaId', () => {
    const categoryById = jasmine.createSpy('categoryById').and.returnValue(makeCategory('cat-foco'));
    const fixture = setup(routeWithParentCategoriaId(null), categoryById);

    fixture.componentRef.setInput('categoryIdInput', 'cat-foco');
    fixture.detectChanges();

    expect(categoryById).toHaveBeenCalledWith('cat-foco');
  });

  /** `bracketData()` é `null` sempre que `category()` é `null` — categoria não encontrada, id
   *  vazio (atleta não registrado abrindo um link de Focus compartilhado) ou torneio ainda não
   *  carregado (`fetchTournament().catch(() => null)`). O `@if (bracketData(); as data)` de
   *  nível superior não tinha `@else`: a tela ficava completamente em branco, sem chrome nem
   *  mensagem — Finding 2 da revisão. Reproduzido nas DUAS rotas que apontam pra este
   *  componente. */
  it('sem categoria encontrada (rota antiga com :categoriaId desconhecido), mostra um estado vazio em vez de tela em branco', () => {
    const categoryById = jasmine.createSpy('categoryById').and.returnValue(null);
    const fixture = setup(routeWithParentCategoriaId('cat-inexistente'), categoryById);

    const text = (fixture.nativeElement as HTMLElement).textContent?.trim() ?? '';
    expect(text.length).toBeGreaterThan(0);
  });

  it('sem categoria em foco no Focus (atleta não registrado abrindo um link compartilhado), mostra um estado vazio em vez de tela em branco', () => {
    const categoryById = jasmine.createSpy('categoryById').and.returnValue(null);
    const fixture = setup(routeWithParentCategoriaId(null), categoryById);

    fixture.componentRef.setInput('categoryIdInput', null);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent?.trim() ?? '';
    expect(text.length).toBeGreaterThan(0);
  });
});
