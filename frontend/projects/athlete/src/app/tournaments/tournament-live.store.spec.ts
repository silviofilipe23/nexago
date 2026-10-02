import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../auth/auth.service';
import { TournamentLiveStore } from './tournament-live.store';
import type { TournamentSummary } from '../data/tournaments-repository';
import { PublicTournamentReviewsSource } from '../data/public-tournament-reviews.source';
import type { OrganizerReputation, PublicReviewSummary } from '../data/tournament-reviews';
import type { OrganizerNameLookup } from '../data/organizer-name-lookup';

/**
 * Fixação do bug do round 1 de review da seção Agora: o reconhecimento da chamada de quadra
 * (`acknowledgeCall`/`acknowledgedCall`) precisa morar no store — que vive no provider de
 * `torneios/:id` e sobrevive à troca de seção dentro do Focus — e não num signal local de
 * `FocusNowComponent`, que é recriado a cada navegação entre `agora`/`trajetória`/`grupo` (rotas
 * irmãs sem `RouteReuseStrategy` customizada). Este spec instancia a classe real via `TestBed`
 * (necessário porque `TournamentLiveStore` é `@Injectable()`, não uma função pura) e prova que o
 * valor sobrevive a uma releitura simulando outra instância da seção lendo o mesmo store — se
 * alguém reverter o reconhecimento para um signal do componente, `store.acknowledgeCall` deixa
 * de existir e este spec quebra na compilação.
 */
describe('TournamentLiveStore — reconhecimento da chamada de quadra', () => {
  function setup(): TournamentLiveStore {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        TournamentLiveStore,
        // Só `user` importa: `acknowledgeCall`/`acknowledgedCall` não tocam auth nem Firestore.
        { provide: AuthService, useValue: { user: signal(null) } },
      ],
    });
    return TestBed.inject(TournamentLiveStore);
  }

  afterEach(() => TestBed.resetTestingModule());

  it('começa sem nenhuma chamada reconhecida', () => {
    expect(setup().acknowledgedCall).toBeNull();
  });

  it('sobrevive a uma releitura — como a que `FocusNowComponent` faria se fosse recriado pela troca de rota', () => {
    const store = setup();
    store.acknowledgeCall('m1');

    // "Releitura simulada": nenhuma seção guarda esse estado, então uma segunda leitura
    // independente de `acknowledgedCall` (equivalente a uma nova instância da seção Agora lendo
    // o mesmo store injetado por `torneios/:id`) precisa ver o mesmo valor.
    expect(store.acknowledgedCall).toBe('m1');
    expect(store.acknowledgedCall).toBe('m1');
  });

  it('reconhecer uma partida nova substitui o id anterior', () => {
    const store = setup();
    store.acknowledgeCall('m1');
    store.acknowledgeCall('m2');
    expect(store.acknowledgedCall).toBe('m2');
  });
});

describe('TournamentLiveStore — avaliação do torneio', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('sem usuário não há convite nem avaliação própria', () => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        TournamentLiveStore,
        { provide: AuthService, useValue: { user: signal(null) } },
        { provide: PublicTournamentReviewsSource, useValue: { watchSummary: () => () => undefined, watchReputation: () => () => undefined, fetchOrganizerName: () => Promise.resolve(null) } },
      ],
    });
    const store = TestBed.inject(TournamentLiveStore);
    store.tournamentId.set('t1');
    TestBed.tick();
    expect(store.reviewInvite()).toBeNull();
    expect(store.myReview()).toBeNull();
  });
});

describe('TournamentLiveStore — avaliação pública', () => {
  afterEach(() => TestBed.resetTestingModule());

  function torneio(id: string, managerId: string | null): TournamentSummary {
    return { id, name: 'Etapa', managerId, categories: [], startAt: null, endAt: null } as unknown as TournamentSummary;
  }

  /** Fonte falsa: guarda os callbacks para o teste emitir e registra cada `stop`. */
  function fakeSource() {
    const summaries = new Map<string, (s: PublicReviewSummary | null) => void>();
    const reputations = new Map<string, (r: OrganizerReputation | null) => void>();
    const stopped: string[] = [];
    const names = new Map<string, Promise<OrganizerNameLookup | null>>();
    const value = {
      watchSummary: (id: string, cb: (s: PublicReviewSummary | null) => void) => {
        summaries.set(id, cb);
        return () => stopped.push(`summary:${id}`);
      },
      watchReputation: (id: string, cb: (r: OrganizerReputation | null) => void) => {
        reputations.set(id, cb);
        return () => stopped.push(`reputation:${id}`);
      },
      fetchOrganizerName: (id: string) => names.get(id) ?? Promise.resolve(null),
    };
    return { summaries, reputations, stopped, names, value };
  }

  function setup(source: ReturnType<typeof fakeSource>): TournamentLiveStore {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        TournamentLiveStore,
        { provide: AuthService, useValue: { user: signal(null) } },
        { provide: PublicTournamentReviewsSource, useValue: source.value },
      ],
    });
    return TestBed.inject(TournamentLiveStore);
  }

  const flush = () => new Promise<void>((resolve) => setTimeout(resolve));

  it('ouve o resumo do torneio e zera ao trocar de torneio', () => {
    const source = fakeSource();
    const store = setup(source);
    store.tournamentId.set('t1');
    TestBed.tick();
    source.summaries.get('t1')!({ count: 23, average: 4.62, aspects: {} });
    expect(store.reviewSummary()?.count).toBe(23);

    store.tournamentId.set('t2');
    TestBed.tick();
    expect(store.reviewSummary()).toBeNull();
    expect(source.stopped).toContain('summary:t1');
  });

  it('lê nome e reputação do organizador; outro organizador não herda os do anterior', async () => {
    const source = fakeSource();
    source.names.set('o1', Promise.resolve({ name: 'Ana Organiza', hasPublicProfile: true }));
    const store = setup(source);
    store.tournament.set(torneio('t1', 'o1'));
    TestBed.tick();
    await flush();
    source.reputations.get('o1')!({ reviewsCount: 86, tournamentsRated: 5, average: 4.71 });
    expect(store.organizer()).toEqual({ name: 'Ana Organiza', hasPublicProfile: true });
    expect(store.organizerReputation()?.reviewsCount).toBe(86);

    store.tournament.set(torneio('t2', 'o2'));
    TestBed.tick();
    expect(store.organizer()).toBeNull();
    expect(store.organizerReputation()).toBeNull();
    expect(source.stopped).toContain('reputation:o1');
  });

  it('nome que chega depois da troca de organizador é descartado', async () => {
    const source = fakeSource();
    let resolveLate!: (organizer: OrganizerNameLookup | null) => void;
    source.names.set('o1', new Promise((resolve) => (resolveLate = resolve)));
    const store = setup(source);
    store.tournament.set(torneio('t1', 'o1'));
    TestBed.tick();
    store.tournament.set(torneio('t2', 'o2'));
    TestBed.tick();
    resolveLate({ name: 'Ana Organiza', hasPublicProfile: true });
    await flush();
    expect(store.organizer()).toBeNull();
  });

  it('mesmo organizador em outra leitura do torneio não reabre o listener', () => {
    const source = fakeSource();
    const store = setup(source);
    store.tournament.set(torneio('t1', 'o1'));
    TestBed.tick();
    store.tournament.set({ ...torneio('t1', 'o1'), name: 'Etapa renomeada' } as TournamentSummary);
    TestBed.tick();
    expect(source.stopped).not.toContain('reputation:o1');
  });
});
