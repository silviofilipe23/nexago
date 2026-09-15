import { provideZonelessChangeDetection, signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { League } from '@nexago/leagues';
import { AuthService } from '../../auth/auth.service';
import { liga } from '../ligas/liga-capa-padrao.spec';
import { EMPTY_TOURNAMENT_COLLECTED } from '../data/tournament-collected';
import type { OrganizerTournament } from '../data/tournament.model';
import { EventosListComponent } from './eventos-list.component';
import { TorneioDetalheComponent } from './torneio-detalhe.component';

/** `user()` nulo faz o construtor sair cedo, então o teste não toca no Firestore
 *  — a lista é alimentada direto pelo signal. */
function fakeAuth(): Partial<AuthService> {
  return {
    user: signal(null).asReadonly() as unknown as AuthService['user'],
    isSuperAdmin: signal(false).asReadonly() as unknown as AuthService['isSuperAdmin'],
  };
}

function torneio(over: Partial<OrganizerTournament> = {}): OrganizerTournament {
  return {
    id: 't1',
    name: 'Etapa Areia',
    managerId: 'u1',
    sportLabel: 'Vôlei de praia',
    sportId: 'beachVolleyball',
    coverUrl: null,
    status: 'andamento',
    visibility: 'publicListing',
    paymentMode: 'appPixCard',
    collected: EMPTY_TOURNAMENT_COLLECTED,
    startAt: null,
    endAt: null,
    city: null,
    location: null,
    categories: [],
    capacity: null,
    waitlistEnabled: true,
    leagueId: null,
    courts: [],
    courtsCount: 0,
    matchOps: {
      dayStart: '08:00',
      dayEnd: '22:00',
      defaultMatchDurationMin: 30,
      minRestBetweenMatchesMin: 30,
      dynamicRescheduleEnabled: false,
    },
    bigScreen: null,
    uniformRequired: false,
    uniformNumberOnShirt: false,
    uniformNameOnShirt: false,
    ...over,
  };
}

async function capaDoCard(t: OrganizerTournament): Promise<string | null> {
  TestBed.resetTestingModule();
  // O portal roda zoneless: sem isso o TestBed falha com NG0908.
  await TestBed.configureTestingModule({
    imports: [EventosListComponent],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: AuthService, useValue: fakeAuth() },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(EventosListComponent);
  const inst = fixture.componentInstance as unknown as {
    tournaments: WritableSignal<OrganizerTournament[]>;
  };
  inst.tournaments.set([t]);
  fixture.detectChanges();

  return (
    fixture.nativeElement.querySelector('.og-evento-card-cover img')?.getAttribute('src') ?? null
  );
}

describe('EventosListComponent — capa padrão', () => {
  it('torneio sem capa usa a arte do esporte', async () => {
    expect(await capaDoCard(torneio())).toBe('/media/tournament-covers/volei_praia.webp');
  });

  it('a arte não substitui a capa que o organizador subiu', async () => {
    expect(await capaDoCard(torneio({ coverUrl: 'https://cdn.example.com/capa.jpg' }))).toBe(
      'https://cdn.example.com/capa.jpg',
    );
  });

  it('torneio sem esporte reconhecido segue no ícone do troféu', async () => {
    expect(await capaDoCard(torneio({ sportId: null }))).toBeNull();
  });
});

describe('TorneioDetalheComponent — capa padrão', () => {
  /** `id` vazio faz o componente não buscar nada. O `effect` do construtor zera
   *  `tournament` na primeira detecção, então a tela só pode ser alimentada
   *  DEPOIS dela. */
  async function capaDoHero(t: OrganizerTournament): Promise<string | null> {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [TorneioDetalheComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: fakeAuth() },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(TorneioDetalheComponent);
    const inst = fixture.componentInstance as unknown as {
      tournament: WritableSignal<OrganizerTournament | null>;
      loading: WritableSignal<boolean>;
    };
    fixture.detectChanges();
    inst.tournament.set(t);
    inst.loading.set(false);
    fixture.detectChanges();

    return fixture.nativeElement.querySelector('.og-torneio-hero img')?.getAttribute('src') ?? null;
  }

  it('torneio sem capa ganha a arte do esporte no hero', async () => {
    expect(await capaDoHero(torneio({ sportId: 'footvolley' }))).toBe(
      '/media/tournament-covers/futevolei.webp',
    );
  });

  it('torneio sem esporte reconhecido segue sem hero', async () => {
    expect(await capaDoHero(torneio({ sportId: null }))).toBeNull();
  });
});

describe('EventosListComponent — capa padrão da liga', () => {
  async function capaDaLiga(l: League): Promise<string | null> {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [EventosListComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthService, useValue: fakeAuth() },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(EventosListComponent);
    (fixture.componentInstance as unknown as { leagues: WritableSignal<League[]> }).leagues.set([
      l,
    ]);
    fixture.detectChanges();

    return (
      fixture.nativeElement.querySelector('.og-evento-card-cover img')?.getAttribute('src') ?? null
    );
  }

  it('liga sem capa usa a arte do próprio esporte', async () => {
    expect(await capaDaLiga(liga({ sport: 'footvolley' }))).toBe(
      '/media/tournament-covers/futevolei.webp',
    );
  });

  it('liga sem esporte reconhecido segue no ícone da bandeira', async () => {
    expect(await capaDaLiga(liga({ sport: null }))).toBeNull();
  });
});
